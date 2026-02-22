import * as A from './gameActions.js'
import { getCellKey, getAdjacentCoord } from './worldUtils.js'
import { createMessage, GEM_STONE_ITEM } from './initialState.js'
import { START_POSITION, GEM_STONE_ID, BOOK_OF_WORDS_ID } from './constants.js'

/**
 * Finds an item by name (case-insensitive partial match) in an array.
 * @param {import('./models.js').Item[]} items
 * @param {string} name
 * @returns {import('./models.js').Item|null}
 */
function findItem(items, name) {
  const lower = name.toLowerCase()
  return items.find(i => i.name.toLowerCase().includes(lower)) ?? null
}

/**
 * Applies a single LLM action to the state.
 * @param {import('./models.js').GameState} state
 * @param {Object} action - LlmAction from responseParser
 * @returns {import('./models.js').GameState}
 */
function applyLlmAction(state, action) {
  const pos = state.player.position
  const cellKey = getCellKey(pos)
  const cell = state.grid[cellKey]
  if (!cell) return state

  switch (action.type) {
    case 'ADD_ITEM_TO_INVENTORY': {
      const item = cell.items.find(i => i.id === action.itemId)
        || state.player.wearing.find(i => i.id === action.itemId)
      if (!item) return state
      return {
        ...state,
        player: { ...state.player, inventory: [...state.player.inventory, item] },
        grid: { ...state.grid, [cellKey]: { ...cell, items: cell.items.filter(i => i.id !== action.itemId) } }
      }
    }

    case 'REMOVE_ITEM_FROM_ROOM': {
      return {
        ...state,
        grid: { ...state.grid, [cellKey]: { ...cell, items: cell.items.filter(i => i.id !== action.itemId) } }
      }
    }

    case 'ADD_ITEM_TO_ROOM': {
      if (!action.item) return state
      const exists = cell.items.some(i => i.id === action.itemId)
      if (exists) return state
      return {
        ...state,
        grid: { ...state.grid, [cellKey]: { ...cell, items: [...cell.items, action.item] } }
      }
    }

    case 'REMOVE_ITEM_FROM_INVENTORY': {
      // Cannot remove the Gem Stone or Book of Words
      if (action.itemId === GEM_STONE_ID || action.itemId === BOOK_OF_WORDS_ID) return state
      return {
        ...state,
        player: { ...state.player, inventory: state.player.inventory.filter(i => i.id !== action.itemId) }
      }
    }

    case 'SET_PLAYER_NAME':
      return { ...state, player: { ...state.player, name: action.name } }

    case 'SET_PLAYER_APPEARANCE':
      return { ...state, player: { ...state.player, appearance: action.appearance } }

    case 'DAMAGE_ITEM': {
      function updateDesc(items) {
        return items.map(i => i.id === action.itemId ? { ...i, description: action.description } : i)
      }
      return {
        ...state,
        player: {
          ...state.player,
          inventory: updateDesc(state.player.inventory),
          wearing: updateDesc(state.player.wearing),
          holding: state.player.holding?.id === action.itemId
            ? { ...state.player.holding, description: action.description }
            : state.player.holding,
        },
        grid: { ...state.grid, [cellKey]: { ...cell, items: updateDesc(cell.items) } }
      }
    }

    case 'TRANSFORM_ITEM': {
      if (!action.newItem) return state
      function replaceItem(items) {
        return items.map(i => i.id === action.itemId ? action.newItem : i)
      }
      return {
        ...state,
        player: {
          ...state.player,
          inventory: replaceItem(state.player.inventory),
          wearing: replaceItem(state.player.wearing),
          holding: state.player.holding?.id === action.itemId ? action.newItem : state.player.holding,
        },
        grid: { ...state.grid, [cellKey]: { ...cell, items: replaceItem(cell.items) } }
      }
    }

    case 'SPAWN_NPC': {
      if (!action.npc) return state
      const exists = cell.npcs.some(n => n.id === action.npc.id)
      if (exists) return state
      const newNpc = { dialogueHistory: [], hasAskedName: false, ...action.npc }
      return {
        ...state,
        grid: { ...state.grid, [cellKey]: { ...cell, npcs: [...cell.npcs, newNpc] } }
      }
    }

    case 'REMOVE_NPC': {
      return {
        ...state,
        grid: { ...state.grid, [cellKey]: { ...cell, npcs: cell.npcs.filter(n => n.id !== action.npcId) } }
      }
    }

    case 'ADD_EXIT': {
      if (cell.exits.includes(action.direction)) return state
      const adj = getAdjacentCoord(pos, action.direction)
      if (!adj) return state
      return {
        ...state,
        grid: { ...state.grid, [cellKey]: {
          ...cell,
          exits: [...cell.exits, action.direction],
          blockedExits: (cell.blockedExits || []).filter(e => e.direction !== action.direction),
        }}
      }
    }

    case 'REMOVE_EXIT': {
      return {
        ...state,
        grid: { ...state.grid, [cellKey]: { ...cell, exits: cell.exits.filter(d => d !== action.direction) } }
      }
    }

    case 'UPDATE_ROOM_DESCRIPTION': {
      if (!action.description) return state
      return {
        ...state,
        grid: { ...state.grid, [cellKey]: { ...cell, description: action.description } }
      }
    }

    case 'PLAYER_DEATH':
      // Handled at the reducer level below via RESET_TO_START
      return state

    default:
      return state
  }
}

/**
 * @param {import('./models.js').GameState} state
 * @param {{ type: string, [key: string]: any }} action
 * @returns {import('./models.js').GameState}
 */
export function gameReducer(state, action) {
  switch (action.type) {

    case A.ADD_MESSAGE: {
      const message = action.id
        ? { id: action.id, type: action.msgType, text: action.text, timestamp: Date.now() }
        : createMessage(action.text, action.msgType)
      return { ...state, history: [...state.history, message] }
    }

    case A.SET_LLM_STATUS:
      return { ...state, llmStatus: action.status, llmError: action.error ?? null }

    case A.SET_LAST_FAILED_PROMPT:
      return { ...state, lastFailedPrompt: action.prompt }

    case A.SET_LAST_ERROR:
      return { ...state, lastError: action.error }

    case A.SET_GEM_STONE_ACTIVE: {
      const glowing = action.active
      // Update the gem stone in inventory
      const updatedInventory = state.player.inventory.map(i =>
        i.id === GEM_STONE_ID ? { ...i, glowing } : i
      )
      return {
        ...state,
        gemStoneActive: glowing,
        player: { ...state.player, inventory: updatedInventory },
      }
    }

    case A.SET_AWAITING_APPEARANCE:
      return { ...state, awaitingAppearance: action.value }

    case A.SET_AWAITING_MIRROR_CONFIRMATION:
      return { ...state, awaitingMirrorConfirmation: action.value }

    case A.SET_AWAITING_NAME:
      return { ...state, awaitingName: action.value, pendingNpcId: action.npcId ?? null }

    case A.SET_PLAYER_NAME:
      return { ...state, player: { ...state.player, name: action.name }, awaitingName: false, pendingNpcId: null }

    case A.SET_PLAYER_APPEARANCE:
      return { ...state, player: { ...state.player, appearance: action.appearance }, awaitingAppearance: false }

    case A.MOVE: {
      const newPos = action.position
      const newKey = getCellKey(newPos)
      const existingCell = state.grid[newKey]
      return {
        ...state,
        player: { ...state.player, position: newPos },
        grid: {
          ...state.grid,
          [newKey]: existingCell
            ? { ...existingCell, visited: true }
            : {
                key: newKey,
                coord: newPos,
                visited: true,
                generated: false,
                name: null,
                description: null,
                items: [],
                npcs: [],
                exits: [],
                blockedExits: [],
                hasMirror: false,
                mirrorUsed: false,
              }
        }
      }
    }

    case A.SET_CELL: {
      const key = getCellKey(action.cell.coord)
      return {
        ...state,
        grid: { ...state.grid, [key]: { ...action.cell, key, visited: true } }
      }
    }

    case A.PICK_UP: {
      const pos = state.player.position
      const cellKey = getCellKey(pos)
      const cell = state.grid[cellKey]
      const item = findItem(cell?.items ?? [], action.itemName)
      if (!item || !item.takeable) return state
      return {
        ...state,
        player: { ...state.player, inventory: [...state.player.inventory, item] },
        grid: { ...state.grid, [cellKey]: { ...cell, items: cell.items.filter(i => i.id !== item.id) } }
      }
    }

    case A.DROP: {
      const pos = state.player.position
      const cellKey = getCellKey(pos)
      const cell = state.grid[cellKey]
      const item = findItem(state.player.inventory, action.itemName)
        || (state.player.holding?.name.toLowerCase().includes(action.itemName.toLowerCase()) ? state.player.holding : null)
      // Cannot drop the Gem Stone or Book of Words
      if (!item || item.id === GEM_STONE_ID || item.id === BOOK_OF_WORDS_ID) return state
      return {
        ...state,
        player: {
          ...state.player,
          inventory: state.player.inventory.filter(i => i.id !== item.id),
          holding: state.player.holding?.id === item.id ? null : state.player.holding,
        },
        grid: { ...state.grid, [cellKey]: { ...cell, items: [...cell.items, item] } }
      }
    }

    case A.HOLD: {
      const item = findItem(state.player.inventory, action.itemName)
      if (!item) return state
      const prevHeld = state.player.holding
      const newInventory = prevHeld
        ? [...state.player.inventory.filter(i => i.id !== item.id), prevHeld]
        : state.player.inventory.filter(i => i.id !== item.id)
      return { ...state, player: { ...state.player, inventory: newInventory, holding: item } }
    }

    case A.UNHOLD: {
      const held = state.player.holding
      if (!held) return state
      return {
        ...state,
        player: { ...state.player, holding: null, inventory: [...state.player.inventory, held] }
      }
    }

    case A.WEAR: {
      const item = findItem(state.player.inventory, action.itemName)
      if (!item || !item.wearable) return state
      return {
        ...state,
        player: {
          ...state.player,
          inventory: state.player.inventory.filter(i => i.id !== item.id),
          wearing: [...state.player.wearing, item],
        }
      }
    }

    case A.REMOVE_WORN: {
      const item = findItem(state.player.wearing, action.itemName)
      if (!item) return state
      return {
        ...state,
        player: {
          ...state.player,
          wearing: state.player.wearing.filter(i => i.id !== item.id),
          inventory: [...state.player.inventory, item],
        }
      }
    }

    case A.UPDATE_NPC_DIALOGUE: {
      const pos = state.player.position
      const cellKey = getCellKey(pos)
      const cell = state.grid[cellKey]
      return {
        ...state,
        grid: {
          ...state.grid,
          [cellKey]: {
            ...cell,
            npcs: cell.npcs.map(n =>
              n.id === action.npcId
                ? { ...n, dialogueHistory: action.history, hasAskedName: action.hasAskedName ?? n.hasAskedName }
                : n
            )
          }
        }
      }
    }

    case A.SET_ITEM_EXAMINE_TEXT: {
      function updateExamine(items) {
        return items.map(i => i.id === action.itemId ? { ...i, examineText: action.text } : i)
      }
      const pos = state.player.position
      const cellKey = getCellKey(pos)
      const cell = state.grid[cellKey]
      return {
        ...state,
        player: {
          ...state.player,
          inventory: updateExamine(state.player.inventory),
          wearing: updateExamine(state.player.wearing),
          holding: state.player.holding?.id === action.itemId
            ? { ...state.player.holding, examineText: action.text }
            : state.player.holding,
        },
        grid: cell
          ? { ...state.grid, [cellKey]: { ...cell, items: updateExamine(cell.items) } }
          : state.grid
      }
    }

    case A.APPLY_LLM_ACTIONS: {
      const newState = action.actions.reduce(applyLlmAction, state)
      // Check if any action was PLAYER_DEATH — trigger reset
      const hasDeath = action.actions.some(a => a.type === 'PLAYER_DEATH')
      if (hasDeath) {
        return gameReducer(newState, { type: A.RESET_TO_START })
      }
      return newState
    }

    case A.RESET_TO_START: {
      const startKey = getCellKey(START_POSITION)
      const startCell = state.grid[startKey]
      // Ensure gem stone is in inventory after reset
      const hasGemStone = state.player.inventory.some(i => i.id === GEM_STONE_ID)
      const inventory = hasGemStone
        ? state.player.inventory
        : [{ ...GEM_STONE_ITEM, glowing: state.gemStoneActive }, ...state.player.inventory]
      return {
        ...state,
        player: {
          ...state.player,
          position: { ...START_POSITION },
          inventory,
          holding: null,
        },
        grid: {
          ...state.grid,
          [startKey]: startCell
            ? { ...startCell, visited: true }
            : {
                key: startKey,
                coord: { ...START_POSITION },
                visited: true,
                generated: false,
                name: null,
                description: null,
                items: [],
                npcs: [],
                exits: [],
                blockedExits: [],
                hasMirror: false,
                mirrorUsed: false,
              }
        }
      }
    }

    case A.SET_CHAPTER_TITLE: {
      const { chapter, title, story } = action
      if (chapter === 1) {
        return { ...state, bookOfWords: { ...state.bookOfWords, chapter1Title: title, chapter1Story: story ?? null } }
      }
      return {
        ...state,
        bookOfWords: {
          ...state.bookOfWords,
          chapters: state.bookOfWords.chapters.map(c =>
            c.number === chapter ? { ...c, title, story: story ?? null } : c
          ),
        },
      }
    }

    case A.SET_ACTIVE_ENCOUNTER:
      return { ...state, activeEncounter: action.encounter }

    case A.COMPLETE_ENCOUNTER: {
      const { chapter, title, story, resolution, npcName } = action
      const updatedChapters = state.bookOfWords.chapters.map(c =>
        c.number === chapter ? { ...c, title, story: story ?? null, completed: true } : c
      )
      const updatedLocations = state.encounterLocations.map(e =>
        e.chapter === chapter ? { ...e, completed: true, resolution, npcName } : e
      )
      const allDone = updatedChapters.every(c => c.completed)
      return {
        ...state,
        bookOfWords: { ...state.bookOfWords, chapters: updatedChapters },
        encounterLocations: updatedLocations,
        activeEncounter: null,
        endGameReady: allDone,
      }
    }

    case A.SET_END_GAME_TRIGGERED:
      return { ...state, endGameTriggered: true }

    case A.SET_FIRST_ROOM_GENERATED:
      return { ...state, firstRoomGenerated: true }

    case A.LOAD_SAVE: {
      return {
        ...action.saveData,
        llmStatus: 'idle',
        llmError: null,
        lastError: null,
        awaitingAppearance: false,
        awaitingMirrorConfirmation: false,
        awaitingName: false,
        pendingNpcId: null,
        lastFailedPrompt: null,
        activeEncounter: null,
      }
    }

    default:
      return state
  }
}
