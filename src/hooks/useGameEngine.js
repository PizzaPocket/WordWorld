import { useReducer, useCallback, useRef, useState, useEffect } from 'react'
import { gameReducer } from '../game/gameReducer.js'
import { createGameState, makeId } from '../game/initialState.js'
import * as A from '../game/gameActions.js'
import { parseCommand } from '../game/commandParser.js'
import { getCellKey, getAdjacentCoord, getNeighborContext, findEncounterAt } from '../game/worldUtils.js'
import { coordToLabel, START_POSITION, BOOK_OF_WORDS_ID, STORY_CIRCLE } from '../game/constants.js'
import { describeRoom, formatInventory, formatHelp, formatPlayerStatus, formatBookOfWords } from '../game/textFormatters.js'
import { BOOK_OF_WORDS_ITEM } from '../game/initialState.js'
import { generate } from '../llm/geminiClient.js'
import {
  buildRoomPrompt,
  buildStartRoomPrompt,
  buildEncounterPrompt,
  buildEncounterJudgmentPrompt,
  buildEndGamePrompt,
  buildCommandPrompt,
  buildDialoguePrompt,
  buildExaminePrompt,
  buildNoticePrompt,
} from '../llm/prompts.js'
import {
  parseRoomResponse,
  parseStartRoomResponse,
  parseEncounterResponse,
  parseEncounterJudgmentResponse,
  parseEndGameResponse,
  parseCommandResponse,
  parseDialogueResponse,
  parseExamineResponse,
  parseNoticeResponse,
} from '../llm/responseParser.js'
import {
  saveGame,
  loadGame,
  listSaves,
  deleteSave,
} from '../persistence/storage.js'

// How long to block LLM calls after a rate limit (ms)
const RATE_LIMIT_COOLDOWN_MS = 65000

export function useGameEngine() {
  const [gameState, dispatch] = useReducer(gameReducer, null, createGameState)
  const [saves, setSaves] = useState(() => listSaves())

  // Always have the latest state in async callbacks
  const stateRef = useRef(gameState)
  stateRef.current = gameState

  // Track rate limit cooldown (not saved to game state)
  const rateLimitedAtRef = useRef(null)
  // Timer ref for gem stone reactivation
  const gemReactivateTimerRef = useRef(null)
  // Track previous position for "go back"
  const previousPositionRef = useRef(null)
  // Callbacks to fire when a specific message finishes animating: id → fn
  const messageCallbacksRef = useRef(new Map())

  // Clean up reactivation timer on unmount
  useEffect(() => {
    return () => {
      if (gemReactivateTimerRef.current) clearTimeout(gemReactivateTimerRef.current)
    }
  }, [])

  // --- Helpers ---

  function msg(text, type = 'narrative', onComplete = null) {
    const id = makeId()
    if (onComplete) messageCallbacksRef.current.set(id, onComplete)
    dispatch({ type: A.ADD_MESSAGE, id, text, msgType: type })
  }

  function setLoading(loading, error = null) {
    dispatch({ type: A.SET_LLM_STATUS, status: loading ? 'loading' : (error ? 'error' : 'idle'), error })
  }

  function currentCell() {
    const state = stateRef.current
    return state.grid[getCellKey(state.player.position)] ?? null
  }

  function findItemAnywhere(name) {
    const state = stateRef.current
    const lower = name.toLowerCase()
    const search = arr => arr.find(i => i.name.toLowerCase().includes(lower))
    return search(state.player.inventory)
      || search(state.player.wearing)
      || (state.player.holding?.name.toLowerCase().includes(lower) ? state.player.holding : null)
      || search(currentCell()?.items ?? [])
  }

  function findNpc(name) {
    const cell = currentCell()
    if (!cell) return null
    const lower = name.toLowerCase()
    return cell.npcs.find(n => n.name.toLowerCase().includes(lower)) ?? null
  }

  /** Returns true if the gem stone is in cooldown and blocks the LLM call with a narrative. */
  function isGemStoneDepleted() {
    const state = stateRef.current
    if (!state.gemStoneActive && rateLimitedAtRef.current !== null) {
      const elapsed = Date.now() - rateLimitedAtRef.current
      if (elapsed < RATE_LIMIT_COOLDOWN_MS) {
        const secsLeft = Math.ceil((RATE_LIMIT_COOLDOWN_MS - elapsed) / 1000)
        msg(
          `The Gem Stone sits cold and dim in your palm. The Elelem's energy is spent for now. ` +
          `The world cannot take new shape until it recovers. ` +
          `(~${secsLeft}s remaining)`,
          'narrative'
        )
        return true
      }
    }
    return false
  }

  /**
   * Re-activate the gem stone after a successful LLM call.
   * Shows the "energy returned" narrative only if the gem was previously dimmed.
   */
  function reactivateGemStone() {
    const wasInactive = !stateRef.current.gemStoneActive
    dispatch({ type: A.SET_GEM_STONE_ACTIVE, active: true })
    if (wasInactive) {
      msg(
        `A warmth spreads through your palm. The Gem Stone stirs — a soft pulse, then a steady glow. ` +
        `The Elelem breathes again. The world is ready.`,
        'narrative'
      )
    }
  }

  /** Handle rate limit from Gemini — dim the gem stone with lore narrative. */
  function handleRateLimit() {
    rateLimitedAtRef.current = Date.now()
    dispatch({ type: A.SET_GEM_STONE_ACTIVE, active: false })
    msg(
      `The Gem Stone's light gutters and fades. The Elelem has given all it can for now — ` +
      `the world holds its breath, unable to change or grow. ` +
      `Rest. The energy will return.`,
      'narrative'
    )
    msg(
      `Type "save <name>" to preserve your progress, or "learn more" to understand what's happening.`,
      'system'
    )
    // After cooldown, silently clear the block — gem re-activates on next successful call
    if (gemReactivateTimerRef.current) clearTimeout(gemReactivateTimerRef.current)
    gemReactivateTimerRef.current = setTimeout(() => {
      rateLimitedAtRef.current = null
    }, RATE_LIMIT_COOLDOWN_MS)
  }

  // --- LLM helpers ---

  async function generateRoom(coord, showArrival = true, encounterContext = null) {
    if (isGemStoneDepleted()) return

    const state = stateRef.current
    const neighborCtx = getNeighborContext(state.grid, coord)
    const isStartRoom = coord.x === START_POSITION.x && coord.y === START_POSITION.y
    const isFirstVisit = !state.grid[getCellKey(coord)]?.generated

    const forceMirror = !isStartRoom && !state.firstRoomGenerated
    const userPrompt = (isStartRoom && isFirstVisit)
      ? buildStartRoomPrompt(coord, neighborCtx)
      : buildRoomPrompt(coord, neighborCtx, encounterContext, forceMirror)

    dispatch({ type: A.SET_LAST_FAILED_PROMPT, prompt: { type: 'room', coord } })
    setLoading(true)

    try {
      const rawText = await generate(userPrompt)
      const result = (isStartRoom && isFirstVisit)
        ? parseStartRoomResponse(rawText)
        : parseRoomResponse(rawText)

      if (!result.ok) throw new Error(`Failed to parse room response: ${result.error}`)

      let { name, description, narrative, items, npcs, exits, blockedExits, hasMirror } = result.data

      // Ensure the Book of Words is always present in the start room
      if (isStartRoom && !items.some(i => i.id === BOOK_OF_WORDS_ID)) {
        items = [{ ...BOOK_OF_WORDS_ITEM }, ...items]
      }

      // forceMirror: guarantee the flag is set even if the LLM ignores the instruction
      if (forceMirror) hasMirror = true

      const cell = {
        key: getCellKey(coord),
        coord,
        visited: true,
        generated: true,
        name,
        description,
        items,
        npcs,
        exits,
        blockedExits: blockedExits || [],
        hasMirror,
        mirrorUsed: false,
      }

      dispatch({ type: A.SET_CELL, cell })
      if (forceMirror) dispatch({ type: A.SET_FIRST_ROOM_GENERATED })
      dispatch({ type: A.SET_LAST_FAILED_PROMPT, prompt: null })
      reactivateGemStone()

      // Store chapter 1 title (only shown when player reads the book)
      if (isStartRoom && isFirstVisit && result.data.chapter1Title) {
        dispatch({ type: A.SET_CHAPTER_TITLE, chapter: 1, title: result.data.chapter1Title })
      }

      if (showArrival) msg(narrative, 'narrative')
      if (showArrival) msg('', 'narrative')
      msg(describeRoom(cell, coord), 'narrative')

      if (hasMirror) {
        setTimeout(() => {
          msg('There is a mirror here. You catch a glimpse of your reflection.', 'system')
          msg('Describe what you see when you look at yourself.', 'system')
          dispatch({ type: A.SET_AWAITING_APPEARANCE, value: true })
        }, 600)
      }

      setLoading(false)
    } catch (err) {
      setLoading(false, String(err))
      dispatch({ type: A.SET_LAST_ERROR, error: String(err) })
      if (String(err).includes('429')) {
        handleRateLimit()
      } else {
        msg(
          `You step forward, but the world does not follow. All around you stretches a pale, featureless void — a cold gray nothing, neither floor nor sky, as if this corner of Word World has not yet been dreamed into being.`,
          'narrative'
        )
        msg('Type "retry" to try again, "go back" to return to where you came, or "debug" to see the error.', 'system')
      }
    }
  }

  async function runEncounterSetup(coord, encounter) {
    if (isGemStoneDepleted()) return

    const state = stateRef.current
    const storyTheme = STORY_CIRCLE[encounter.chapter - 1].theme

    msg(`You sense something different about this place. The air holds its breath.`, 'narrative')
    setLoading(true)

    try {
      const userPrompt = buildEncounterPrompt(coord, storyTheme, state.player)
      const rawText = await generate(userPrompt)
      const result = parseEncounterResponse(rawText)

      if (!result.ok) throw new Error(result.error)

      const { narrative, npcName, situationSummary } = result.data

      reactivateGemStone()
      msg(narrative, 'narrative')
      msg('The moment waits. How do you respond?', 'system')
      dispatch({
        type: A.SET_ACTIVE_ENCOUNTER,
        encounter: {
          coord,
          chapter: encounter.chapter,
          storyTheme,
          stage: 'awaiting_response',
          context: { narrative, npcName, situationSummary },
        },
      })
      setLoading(false)
    } catch (err) {
      setLoading(false, String(err))
      dispatch({ type: A.SET_LAST_ERROR, error: String(err) })
      if (String(err).includes('429')) {
        handleRateLimit()
      } else {
        msg(`The encounter dissolves before it takes shape. The Elelem's touch falters.`, 'narrative')
        msg('Type "retry" to try again, or "debug" to see the error.', 'system')
      }
    }
  }

  async function handleEncounterResponse(playerInput) {
    const state = stateRef.current
    const encounter = state.activeEncounter
    if (!encounter) return

    setLoading(true)

    try {
      const userPrompt = buildEncounterJudgmentPrompt(
        playerInput, encounter.context, encounter.storyTheme, encounter.chapter
      )
      const rawText = await generate(userPrompt)
      const result = parseEncounterJudgmentResponse(rawText)

      if (!result.ok) throw new Error(result.error)

      const { success, resolution, chapterTitle } = result.data

      reactivateGemStone()
      dispatch({ type: A.SET_ACTIVE_ENCOUNTER, encounter: null })

      if (success) {
        msg(resolution, 'narrative')
        dispatch({
          type: A.COMPLETE_ENCOUNTER,
          chapter: encounter.chapter,
          title: chapterTitle,
          resolution,
          npcName: encounter.context.npcName,
        })
        msg(
          `A new chapter is written in the Book of Words. Chapter ${encounter.chapter}: "${chapterTitle}"`,
          'system'
        )
        // Check if all chapters now complete (endGameReady set in reducer)
        const updatedState = stateRef.current
        if (updatedState.endGameReady) {
          msg(
            `The Book of Words glows in your pack. All eight chapters are written. ` +
            `Something calls you back to the beginning.`,
            'system'
          )
        }
      } else {
        // Failure — dispatch reset only after resolution text finishes animating
        msg(resolution, 'narrative', () => {
          dispatch({ type: A.RESET_TO_START })
          msg(
            `The Elelem's light withdraws, and the world shifts beneath you. ` +
            `When your vision clears, you stand once again at the heart of Word World — ` +
            `returned to where your journey began. The encounter waits, unchanged, should you seek it again.`,
            'narrative'
          )
        })
      }

      setLoading(false)
    } catch (err) {
      setLoading(false, String(err))
      dispatch({ type: A.SET_LAST_ERROR, error: String(err) })
      dispatch({ type: A.SET_ACTIVE_ENCOUNTER, encounter: null })
      if (String(err).includes('429')) {
        handleRateLimit()
      } else {
        msg(`The Elelem cannot judge. The moment passes without resolution.`, 'narrative')
        msg('Type "debug" to see the error.', 'system')
      }
    }
  }

  async function runEndGameSetup() {
    const state = stateRef.current
    setLoading(true)

    try {
      const userPrompt = buildEndGamePrompt(state.player, state.bookOfWords)
      const rawText = await generate(userPrompt)
      const result = parseEndGameResponse(rawText)

      if (!result.ok) throw new Error(result.error)

      const { childName, childDescription, arrivalNarrative } = result.data

      reactivateGemStone()
      msg(arrivalNarrative, 'narrative')
      dispatch({
        type: A.APPLY_LLM_ACTIONS,
        actions: [{
          type: 'SPAWN_NPC',
          npc: {
            id: 'child_wanderer',
            name: childName,
            description: childDescription,
          },
        }],
      })
      setLoading(false)
    } catch (err) {
      setLoading(false, String(err))
      dispatch({ type: A.SET_LAST_ERROR, error: String(err) })
      if (String(err).includes('429')) {
        handleRateLimit()
      } else {
        msg(
          `A small figure stands at the edge of your vision, waiting. ` +
          `They look like someone you used to know.`,
          'narrative'
        )
      }
    }
  }

  async function runCommandLlm(rawText) {
    if (isGemStoneDepleted()) return

    const state = stateRef.current
    const cell = currentCell()
    if (!cell) return

    dispatch({ type: A.SET_LAST_FAILED_PROMPT, prompt: { type: 'command', raw: rawText } })
    setLoading(true)

    try {
      const userPrompt = buildCommandPrompt(rawText, state, cell)
      const response = await generate(userPrompt)
      const result = parseCommandResponse(response, state.player.position)

      if (!result.ok) throw new Error(result.error)

      const { narrative, actions } = result.data
      dispatch({ type: A.SET_LAST_FAILED_PROMPT, prompt: null })
      reactivateGemStone()

      const hasDeath = actions.some(a => a.type === 'PLAYER_DEATH')
      if (actions.length) {
        dispatch({ type: A.APPLY_LLM_ACTIONS, actions })
      }

      if (hasDeath) {
        msg(narrative, 'narrative', () => {
          const label = coordToLabel(stateRef.current.player.position)
          msg(
            `You find yourself at ${label}, standing at the center of the world once more. ` +
            `The Gem Stone pulses steadily in your palm, as if nothing happened.`,
            'narrative'
          )
        })
      } else {
        msg(narrative, 'narrative')
      }

      setLoading(false)
    } catch (err) {
      setLoading(false, String(err))
      dispatch({ type: A.SET_LAST_ERROR, error: String(err) })
      if (String(err).includes('429')) {
        handleRateLimit()
      } else {
        msg(`The Elelem's attention drifts. Nothing comes of it.`, 'narrative')
        msg('Type "retry" to try again, or "debug" to see the error.', 'system')
      }
    }
  }

  async function runNoticeLlm(noticedThing) {
    if (isGemStoneDepleted()) return

    const state = stateRef.current
    const cell = currentCell()
    if (!cell || !cell.generated) {
      msg('There is nothing yet here to notice. The world has not taken shape.', 'narrative')
      return
    }

    dispatch({ type: A.SET_LAST_FAILED_PROMPT, prompt: { type: 'command', raw: `notice ${noticedThing}` } })
    setLoading(true)

    try {
      const userPrompt = buildNoticePrompt(noticedThing, state, cell)
      const response = await generate(userPrompt)
      const result = parseNoticeResponse(response, state.player.position)

      if (!result.ok) throw new Error(result.error)

      const { narrative, actions } = result.data
      dispatch({ type: A.SET_LAST_FAILED_PROMPT, prompt: null })
      reactivateGemStone()
      msg(narrative, 'narrative')

      if (actions.length) {
        dispatch({ type: A.APPLY_LLM_ACTIONS, actions })
      }
      setLoading(false)
    } catch (err) {
      setLoading(false, String(err))
      dispatch({ type: A.SET_LAST_ERROR, error: String(err) })
      if (String(err).includes('429')) {
        handleRateLimit()
      } else {
        msg(`Your attention sharpens, but the Elelem does not respond.`, 'narrative')
        msg('Type "retry" to try again, or "debug" to see the error.', 'system')
      }
    }
  }

  async function runDialogueLlm(npc, playerInput) {
    if (isGemStoneDepleted()) return

    const state = stateRef.current
    const cell = currentCell()
    if (!cell) return

    setLoading(true)

    try {
      const userPrompt = buildDialoguePrompt(npc, playerInput, state, cell)
      const response = await generate(userPrompt)
      const result = parseDialogueResponse(response, state.player.position)

      if (!result.ok) throw new Error(result.error)

      const { dialogue, askingForName, actions } = result.data

      const newHistory = [
        ...npc.dialogueHistory,
        `you: "${playerInput}"`,
        `${npc.name}: "${dialogue}"`,
      ]
      dispatch({
        type: A.UPDATE_NPC_DIALOGUE,
        npcId: npc.id,
        history: newHistory,
        hasAskedName: npc.hasAskedName || askingForName,
      })

      reactivateGemStone()
      msg(`${npc.name}: "${dialogue}"`, 'llm')

      if (askingForName && !state.player.name) {
        setTimeout(() => {
          msg('(What do you tell them your name is?)', 'system')
          dispatch({ type: A.SET_AWAITING_NAME, value: true, npcId: npc.id })
        }, 400)
      }

      if (actions.length) {
        dispatch({ type: A.APPLY_LLM_ACTIONS, actions })
      }
      setLoading(false)
    } catch (err) {
      setLoading(false, String(err))
      dispatch({ type: A.SET_LAST_ERROR, error: String(err) })
      if (String(err).includes('429')) {
        handleRateLimit()
      } else {
        msg(`${npc.name} seems unable to respond. Their words dissolve before they form.`, 'narrative')
      }
    }
  }

  async function runExamineLlm(target, targetType) {
    if (isGemStoneDepleted()) return

    const state = stateRef.current
    const cell = currentCell()
    if (!cell) return

    setLoading(true)

    try {
      const userPrompt = buildExaminePrompt(target, targetType, cell, state.player)
      const response = await generate(userPrompt)
      const result = parseExamineResponse(response, state.player.position)

      if (!result.ok) throw new Error(result.error)

      const { examineText, actions } = result.data

      if (targetType === 'item') {
        dispatch({ type: A.SET_ITEM_EXAMINE_TEXT, itemId: target.id, text: examineText })
      }
      reactivateGemStone()
      msg(examineText, 'narrative')

      if (actions.length) {
        dispatch({ type: A.APPLY_LLM_ACTIONS, actions })
      }
      setLoading(false)
    } catch (err) {
      setLoading(false, String(err))
      dispatch({ type: A.SET_LAST_ERROR, error: String(err) })
      if (String(err).includes('429')) {
        handleRateLimit()
      } else {
        msg('You look closely but your thoughts scatter. The Elelem does not illuminate it.', 'narrative')
      }
    }
  }

  // --- Command handlers ---

  function handleMove(direction) {
    const state = stateRef.current
    const cell = currentCell()
    if (!cell) return

    if (cell.generated && !cell.exits.includes(direction)) {
      const blocked = (cell.blockedExits || []).find(e => e.direction === direction)
      if (blocked) {
        msg(blocked.obstacle, 'narrative')
      } else {
        msg(`You cannot go ${direction} from here.`, 'system')
      }
      return
    }

    const newCoord = getAdjacentCoord(state.player.position, direction)
    if (!newCoord) {
      msg(
        `The Gem Stone grows warm in your palm, almost a warning. ` +
        `Beyond here, the Elelem's reach ends — the world does not extend farther.`,
        'narrative'
      )
      return
    }

    previousPositionRef.current = { ...state.player.position }
    dispatch({ type: A.MOVE, position: newCoord })

    // End game: player returns to start with all chapters complete
    const isStart = newCoord.x === START_POSITION.x && newCoord.y === START_POSITION.y
    if (isStart && state.endGameReady && !state.endGameTriggered) {
      dispatch({ type: A.SET_END_GAME_TRIGGERED })
      msg(
        `You step back into the heart of Word World. Something is different. ` +
        `The air is still — expectant, as if the world itself is holding its breath.`,
        'narrative'
      )
      runEndGameSetup()
      return
    }

    const newKey = getCellKey(newCoord)
    const newCell = state.grid[newKey]

    // Check for encounter location
    const encounter = findEncounterAt(newCoord, state.encounterLocations)
    if (encounter && !encounter.completed) {
      runEncounterSetup(newCoord, encounter)
      return
    }

    if (newCell?.generated) {
      msg(describeRoom(newCell, newCoord), 'narrative')
    } else if (!state.gemStoneActive) {
      msg(
        `You step forward, but the world does not follow. ` +
        `A gray, featureless void stretches in all directions. ` +
        `The Gem Stone is dark and cold — the Elelem cannot shape this space. ` +
        `You can only turn back the way you came.`,
        'narrative'
      )
    } else if (encounter && encounter.completed) {
      generateRoom(newCoord, true, encounter)
    } else {
      generateRoom(newCoord)
    }
  }

  function handlePickUp(itemName) {
    const cell = currentCell()
    if (!cell) return
    const lower = itemName.toLowerCase()
    const item = cell.items.find(i => i.name.toLowerCase().includes(lower))

    if (!item) {
      msg(`You don't see "${itemName}" here.`, 'system')
      return
    }
    if (!item.takeable) {
      msg(`You can't pick up the ${item.name}.`, 'system')
      return
    }
    dispatch({ type: A.PICK_UP, itemName })
    msg(`You pick up the ${item.name}.`, 'narrative')
  }

  function handleDrop(itemName) {
    const state = stateRef.current
    const lower = itemName.toLowerCase()

    // Gem Stone cannot be dropped
    if (lower.includes('gem') || lower.includes('stone')) {
      const gemInInv = state.player.inventory.find(i => i.id === 'gem_stone')
      if (gemInInv) {
        msg('The Gem Stone will not leave your hand. It is bound to you for as long as you walk this world.', 'narrative')
        return
      }
    }

    // Book of Words cannot be dropped
    if (lower.includes('book') || lower.includes('word')) {
      const bookInInv = state.player.inventory.find(i => i.id === BOOK_OF_WORDS_ID)
      if (bookInInv) {
        msg('The Book of Words clings to your pack, as if it knows it must travel with you.', 'narrative')
        return
      }
    }

    const item = state.player.inventory.find(i => i.name.toLowerCase().includes(lower))
      || (state.player.holding?.name.toLowerCase().includes(lower) ? state.player.holding : null)

    if (!item) {
      msg(`You're not carrying "${itemName}".`, 'system')
      return
    }
    dispatch({ type: A.DROP, itemName })
    msg(`You set down the ${item.name}.`, 'narrative')
  }

  function handleHold(itemName) {
    const state = stateRef.current
    const lower = itemName.toLowerCase()
    const item = state.player.inventory.find(i => i.name.toLowerCase().includes(lower))

    if (!item) {
      msg(`You don't have "${itemName}" in your pack.`, 'system')
      return
    }
    dispatch({ type: A.HOLD, itemName })
    const prevHeld = state.player.holding
    const text = prevHeld
      ? `You put away the ${prevHeld.name} and pick up the ${item.name}.`
      : `You hold the ${item.name}.`
    msg(text, 'narrative')
  }

  function handleUnhold() {
    const state = stateRef.current
    if (!state.player.holding) {
      msg("You're not holding anything.", 'system')
      return
    }
    const name = state.player.holding.name
    dispatch({ type: A.UNHOLD })
    msg(`You lower the ${name}.`, 'narrative')
  }

  function handleWear(itemName) {
    const state = stateRef.current
    const lower = itemName.toLowerCase()
    const item = state.player.inventory.find(i => i.name.toLowerCase().includes(lower))

    if (!item) {
      msg(`You don't have "${itemName}" in your pack.`, 'system')
      return
    }
    if (!item.wearable) {
      msg(`You can't wear the ${item.name}.`, 'system')
      return
    }
    dispatch({ type: A.WEAR, itemName })
    msg(`You put on the ${item.name}.`, 'narrative')
  }

  function handleRemoveWorn(itemName) {
    const state = stateRef.current
    const lower = itemName.toLowerCase()
    const item = state.player.wearing.find(i => i.name.toLowerCase().includes(lower))

    if (!item) {
      msg(`You're not wearing "${itemName}".`, 'system')
      return
    }
    dispatch({ type: A.REMOVE_WORN, itemName })
    msg(`You take off the ${item.name}.`, 'narrative')
  }

  function handleExamine(targetName) {
    const cell = currentCell()
    if (!cell) return
    const lower = targetName.toLowerCase()

    const npc = cell.npcs.find(n => n.name.toLowerCase().includes(lower))
    if (npc) {
      if (npc.examineText) {
        msg(npc.examineText, 'narrative')
      } else {
        runExamineLlm(npc, 'npc')
      }
      return
    }

    // Book of Words: fuzzy-match before generic search so "the book of words" still resolves
    if (lower.includes('book') || lower.includes('words')) {
      const state = stateRef.current
      const bookItem = state.player.inventory.find(i => i.id === BOOK_OF_WORDS_ID)
        || currentCell()?.items.find(i => i.id === BOOK_OF_WORDS_ID)
      if (bookItem) {
        msg(formatBookOfWords(state.bookOfWords), 'system')
        return
      }
    }

    const item = findItemAnywhere(targetName)
    if (item) {
      if (item.examineText) {
        msg(item.examineText, 'narrative')
      } else {
        runExamineLlm(item, 'item')
      }
      return
    }

    if (lower.includes('mirror') || lower.includes('reflect')) {
      if (cell.hasMirror) {
        const state = stateRef.current
        if (state.player.appearance) {
          msg(`You look at your reflection. ${state.player.appearance}`, 'narrative')
        } else {
          msg('You look into the mirror. Describe what you see.', 'system')
          dispatch({ type: A.SET_AWAITING_APPEARANCE, value: true })
        }
        return
      }
    }

    runCommandLlm(`examine ${targetName}`)
  }

  function handleTalk(npcName) {
    const npc = findNpc(npcName)
    if (!npc) {
      msg(`There is no one called "${npcName}" here.`, 'system')
      return
    }
    msg(`You approach ${npc.name}.`, 'narrative')
    runDialogueLlm(npc, 'Hello')
  }

  function handleSave(saveName) {
    const state = stateRef.current
    saveGame(saveName, state)
    setSaves(listSaves())
    msg(`Game saved as "${saveName}".`, 'system')
  }

  function handleLoad(saveName) {
    const saveData = loadGame(saveName)
    if (!saveData) {
      msg(`No save found named "${saveName}".`, 'system')
      return
    }
    const today = new Date().toDateString()
    const isNewDay = saveData.lastPlayedDate !== today
    const newGameDay = isNewDay ? (saveData.gameDay ?? 1) + 1 : (saveData.gameDay ?? 1)
    dispatch({ type: A.LOAD_SAVE, saveData: { ...saveData, gameDay: newGameDay, lastPlayedDate: today, firstRoomGenerated: saveData.firstRoomGenerated ?? false } })
    msg(`Loaded "${saveName}".`, 'system')
    msg(`DAY ${newGameDay}`, 'day')
    setTimeout(() => {
      const state = stateRef.current
      const cell = state.grid[getCellKey(state.player.position)]
      if (cell?.generated) {
        msg(describeRoom(cell, state.player.position), 'narrative')
      }
    }, 50)
  }

  function handleDelete(saveName) {
    deleteSave(saveName)
    setSaves(listSaves())
    msg(`Save "${saveName}" deleted.`, 'system')
  }

  function handleRetry() {
    const state = stateRef.current
    // Reset rate limit block to allow a retry attempt
    if (!state.gemStoneActive) {
      rateLimitedAtRef.current = null
    }
    const failed = state.lastFailedPrompt
    if (!failed) {
      msg('Nothing to retry.', 'system')
      return
    }
    msg('The Gem Stone flickers. You try again...', 'narrative')
    if (failed.type === 'room') {
      generateRoom(failed.coord)
    } else if (failed.type === 'command') {
      runCommandLlm(failed.raw)
    }
  }

  function handleDebug() {
    const state = stateRef.current
    if (!state.lastError) {
      msg('No errors recorded.', 'debug')
      return
    }
    msg(`[DEBUG] Last error:\n${state.lastError}`, 'debug')
  }

  // --- Main command handler ---

  const handleCommand = useCallback((text) => {
    const state = stateRef.current
    if (state.llmStatus === 'loading') return

    // Encounter response intercept — any input becomes the player's encounter answer
    if (state.activeEncounter?.stage === 'awaiting_response') {
      msg(`> ${text}`, 'command')
      handleEncounterResponse(text)
      return
    }

    if (state.awaitingAppearance) {
      msg(`> ${text}`, 'command')
      dispatch({ type: A.SET_PLAYER_APPEARANCE, appearance: text })
      msg(`You study your reflection. ${text}`, 'narrative')
      return
    }

    if (state.awaitingName) {
      msg(`> ${text}`, 'command')
      dispatch({ type: A.SET_PLAYER_NAME, name: text })
      const npc = state.pendingNpcId
        ? currentCell()?.npcs.find(n => n.id === state.pendingNpcId)
        : null
      msg(
        npc
          ? `You tell them your name is ${text}.`
          : `Your name is ${text}.`,
        'narrative'
      )
      if (npc) {
        runDialogueLlm(npc, `My name is ${text}.`)
      }
      return
    }

    const parsed = parseCommand(text)
    msg(`> ${text}`, 'command')

    switch (parsed.type) {
      case 'look': {
        const cell = currentCell()
        const pos = state.player.position
        if (!cell) { msg('You exist in nothing.', 'system'); return }
        if (!cell.generated) {
          generateRoom(pos, false)
        } else {
          msg(describeRoom(cell, pos), 'narrative')
        }
        break
      }

      case 'move':
        handleMove(parsed.direction)
        break

      case 'go_back': {
        const prev = previousPositionRef.current
        if (!prev) { msg('There is nowhere to go back to.', 'system'); break }
        dispatch({ type: A.MOVE, position: prev })
        previousPositionRef.current = null
        const prevCell = stateRef.current.grid[getCellKey(prev)]
        if (prevCell?.generated) msg(describeRoom(prevCell, prev), 'narrative')
        break
      }

      case 'inventory':
        msg(formatInventory(state.player, state.gemStoneActive), 'system')
        break

      case 'me':
        msg(formatPlayerStatus(state.player), 'system')
        break

      case 'pick_up':
        handlePickUp(parsed.itemName)
        break

      case 'drop':
        handleDrop(parsed.itemName)
        break

      case 'hold':
        handleHold(parsed.itemName)
        break

      case 'unhold':
        handleUnhold()
        break

      case 'wear':
        handleWear(parsed.itemName)
        break

      case 'remove':
        handleRemoveWorn(parsed.itemName)
        break

      case 'examine':
        handleExamine(parsed.targetName)
        break

      case 'notice':
        runNoticeLlm(parsed.noticedThing)
        break

      case 'talk':
        handleTalk(parsed.npcName)
        break

      case 'save':
        handleSave(parsed.saveName)
        break

      case 'load':
        handleLoad(parsed.saveName)
        break

      case 'saves': {
        const list = listSaves()
        if (list.length === 0) {
          msg('No saves found. Type "save <name>" to save.', 'system')
        } else {
          const text = list.map(s => `  ${s.name} — Day ${s.gameDay ?? 1} (${new Date(s.savedAt).toLocaleDateString()})`).join('\n')
          msg(`Saves:\n${text}`, 'system')
        }
        break
      }

      case 'delete_save':
        handleDelete(parsed.saveName)
        break

      case 'help':
        msg(formatHelp(), 'system')
        break

      case 'retry':
        handleRetry()
        break

      case 'debug':
        handleDebug()
        break

      case 'learn_more':
        msg(
          `ABOUT THE GEM STONE\n` +
          `Word World uses Google Gemini 2.5 Flash Lite to generate the world around you in real time.\n\n` +
          `Each room you enter, each command you type, and each encounter you face sends a request to the Gemini API. ` +
          `The free tier of this API has rate limits — most commonly a daily cap on the total number of requests. ` +
          `Once that daily limit is reached, the API will refuse further requests until the quota resets the following day. ` +
          `In the world of Word World, this is represented as the Gem Stone losing its glow. ` +
          `Once the rate limit clears and your next action succeeds, the Gem Stone will light up again automatically.\n\n` +
          `RECOMMENDATION: Type "save <name>" now to preserve your progress, and come back to adventure more tomorrow. `+
          `Use "load <name>" to load the save later`,
          'system'
        )
        break

      case 'api_key':
        msg(
          'To change your Gem Key, open the browser console and run:\n' +
          '  localStorage.removeItem("word-world:api-key")\nthen reload.',
          'system'
        )
        break

      case 'unknown':
      default:
        runCommandLlm(parsed.raw ?? text)
        break
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onMessageAnimated = useCallback((id) => {
    const cb = messageCallbacksRef.current.get(id)
    if (cb) {
      messageCallbacksRef.current.delete(id)
      cb()
    }
  }, [])

  return {
    gameState,
    handleCommand,
    saves,
    handleLoad,
    handleDelete,
    onMessageAnimated,
  }
}
