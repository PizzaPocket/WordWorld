import { getAdjacentCoord } from '../game/worldUtils.js'

/**
 * Strip markdown code fences that some models add around JSON responses.
 * @param {string} text
 * @returns {string}
 */
function stripFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

/**
 * @param {any} raw
 * @returns {boolean}
 */
function isString(raw) { return typeof raw === 'string' }
function isBoolean(raw) { return typeof raw === 'boolean' }
function isArray(raw) { return Array.isArray(raw) }

/**
 * Validate and clean an Item object from LLM output.
 * @param {any} raw
 * @returns {import('../game/models.js').Item|null}
 */
function parseItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!isString(raw.id) || !raw.id.trim()) return null
  if (!isString(raw.name) || !raw.name.trim()) return null
  return {
    id: raw.id.trim().replace(/\s+/g, '_').toLowerCase(),
    name: raw.name.trim().toLowerCase(),
    description: isString(raw.description) ? raw.description.trim() : '',
    takeable: raw.takeable === true,
    wearable: raw.wearable === true,
    examineText: undefined,
    metadata: undefined,
  }
}

/**
 * Validate and clean an NPC object from LLM output.
 * @param {any} raw
 * @returns {import('../game/models.js').NPC|null}
 */
function parseNpc(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!isString(raw.id) || !raw.id.trim()) return null
  if (!isString(raw.name) || !raw.name.trim()) return null
  return {
    id: raw.id.trim().replace(/\s+/g, '_').toLowerCase(),
    name: raw.name.trim(),
    description: isString(raw.description) ? raw.description.trim() : '',
    dialogueHistory: [],
    hasAskedName: false,
    aggro: isString(raw.aggroNarrative) && raw.aggroNarrative.trim().length > 0,
    aggroNarrative: isString(raw.aggroNarrative) ? raw.aggroNarrative.trim() : null,
  }
}

const VALID_DIRECTIONS = new Set(['north', 'south', 'east', 'west'])

/**
 * Validate and clean a blocked exit object from LLM output.
 * @param {any} raw
 * @returns {{ direction: string, obstacle: string }|null}
 */
function parseBlockedExit(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!VALID_DIRECTIONS.has(raw.direction)) return null
  return {
    direction: raw.direction,
    obstacle: isString(raw.obstacle) ? raw.obstacle.trim() : 'Something blocks the way.',
  }
}

const VALID_ACTION_TYPES = new Set([
  'ADD_ITEM_TO_INVENTORY',
  'ADD_ITEM_TO_WEARING',
  'REMOVE_ITEM_FROM_ROOM',
  'ADD_ITEM_TO_ROOM',
  'REMOVE_ITEM_FROM_INVENTORY',
  'SET_PLAYER_NAME',
  'SET_PLAYER_APPEARANCE',
  'DAMAGE_ITEM',
  'TRANSFORM_ITEM',
  'SPAWN_NPC',
  'REMOVE_NPC',
  'ADD_EXIT',
  'REMOVE_EXIT',
  'UPDATE_ROOM_DESCRIPTION',
  'PLAYER_DEATH',
])

/**
 * Filter out invalid or impossible LLM actions.
 * @param {any[]} actions
 * @param {import('../game/models.js').Coord} playerPos
 * @returns {any[]}
 */
export function sanitizeActions(actions, playerPos) {
  if (!isArray(actions)) return []
  return actions.filter(a => {
    if (!a || !isString(a.type)) return false
    if (!VALID_ACTION_TYPES.has(a.type)) return false

    // Validate ADD/REMOVE_EXIT — must be a valid direction and in bounds
    if (a.type === 'ADD_EXIT' || a.type === 'REMOVE_EXIT') {
      if (!VALID_DIRECTIONS.has(a.direction)) return false
      if (a.type === 'ADD_EXIT' && !getAdjacentCoord(playerPos, a.direction)) return false
    }

    // Validate TRANSFORM_ITEM — newItem must have at least id and name
    if (a.type === 'TRANSFORM_ITEM') {
      if (!a.newItem || !isString(a.newItem.id) || !isString(a.newItem.name)) return false
    }

    // Validate DAMAGE_ITEM — description must be a non-empty string
    if (a.type === 'DAMAGE_ITEM') {
      if (!isString(a.description) || !a.description.trim()) return false
    }

    return true
  })
}

/**
 * Parse the LLM response for room generation.
 * @param {string} rawText
 * @returns {{ ok: true, data: Object } | { ok: false, error: string, rawText: string }}
 */
export function parseRoomResponse(rawText) {
  try {
    const data = JSON.parse(stripFences(rawText))

    const name = isString(data.name) ? data.name.trim() : 'Unnamed Place'
    const description = isString(data.description) ? data.description.trim() : ''
    const narrative = isString(data.narrative) ? data.narrative.trim() : description

    const items = isArray(data.items)
      ? data.items.map(parseItem).filter(Boolean)
      : []

    const npcs = isArray(data.npcs)
      ? data.npcs.map(parseNpc).filter(Boolean)
      : []

    const exits = isArray(data.exits)
      ? data.exits.filter(d => VALID_DIRECTIONS.has(d))
      : []

    const blockedExits = isArray(data.blockedExits)
      ? data.blockedExits.map(parseBlockedExit).filter(Boolean).filter(b => !exits.includes(b.direction))
      : []

    const hasMirror = data.hasMirror === true

    return { ok: true, data: { name, description, narrative, items, npcs, exits, blockedExits, hasMirror } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the LLM response for command interpretation.
 * @param {string} rawText
 * @param {import('../game/models.js').Coord} playerPos
 * @returns {{ ok: true, data: Object } | { ok: false, error: string, rawText: string }}
 */
export function parseCommandResponse(rawText, playerPos) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const narrative = isString(data.narrative) ? data.narrative.trim() : 'Nothing happens.'
    const understood = isBoolean(data.understood) ? data.understood : true
    const actions = sanitizeActions(data.actions, playerPos)
    return { ok: true, data: { narrative, understood, actions } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the LLM response for NPC dialogue.
 * @param {string} rawText
 * @param {import('../game/models.js').Coord} playerPos
 * @returns {{ ok: true, data: Object } | { ok: false, error: string, rawText: string }}
 */
export function parseDialogueResponse(rawText, playerPos) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const dialogue = isString(data.dialogue) ? data.dialogue.trim() : '...'
    const askingForName = data.askingForName === true
    const actions = sanitizeActions(data.actions, playerPos)
    return { ok: true, data: { dialogue, askingForName, actions } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the LLM response for examine.
 * @param {string} rawText
 * @param {import('../game/models.js').Coord} playerPos
 * @returns {{ ok: true, data: Object } | { ok: false, error: string, rawText: string }}
 */
export function parseExamineResponse(rawText, playerPos) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const examineText = isString(data.examineText) ? data.examineText.trim() : 'You look closely but notice nothing new.'
    const reflectiveItem = data.reflectiveItem === true
    const actions = sanitizeActions(data.actions, playerPos)
    return { ok: true, data: { examineText, reflectiveItem, actions } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the start-room response (standard room schema — no chapter 1 wrapper).
 * @param {string} rawText
 * @returns {{ ok: true, data: Object } | { ok: false, error: string, rawText: string }}
 */
export function parseStartRoomResponse(rawText) {
  return parseRoomResponse(rawText)
}

/**
 * Parse the Chapter One writing response.
 * @param {string} rawText
 * @returns {{ ok: true, data: { chapter1Title: string, chapter1Story: string|null } } | { ok: false, error: string, rawText: string }}
 */
export function parseChapter1Response(rawText) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const chapter1Title = isString(data.chapter1Title) ? data.chapter1Title.trim() : null
    if (!chapter1Title) return { ok: false, error: 'Missing chapter1Title', rawText }
    const chapter1Story = isString(data.chapter1Story) ? data.chapter1Story.trim() : null
    return { ok: true, data: { chapter1Title, chapter1Story } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the encounter setup response (stage 1).
 * @param {string} rawText
 * @returns {{ ok: true, data: { narrative: string, npcName: string, situationSummary: string } } | { ok: false, error: string, rawText: string }}
 */
export function parseEncounterResponse(rawText) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const narrative = isString(data.narrative) ? data.narrative.trim() : 'A figure stands before you, waiting.'
    const npcName = isString(data.npcName) ? data.npcName.trim() : 'a stranger'
    const situationSummary = isString(data.situationSummary) ? data.situationSummary.trim() : ''
    return { ok: true, data: { narrative, npcName, situationSummary } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the encounter judgment response (stage 2).
 * @param {string} rawText
 * @returns {{ ok: true, data: { success: boolean, resolution: string, chapterTitle: string|null, failureReason: string|null } } | { ok: false, error: string, rawText: string }}
 */
export function parseEncounterJudgmentResponse(rawText) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const success = data.success === true
    const resolution = isString(data.resolution) ? data.resolution.trim() : 'The encounter fades.'
    const chapterTitle = success && isString(data.chapterTitle) ? data.chapterTitle.trim() : null
    const chapterStory = success && isString(data.chapterStory) ? data.chapterStory.trim() : null
    const failureReason = !success && isString(data.failureReason) ? data.failureReason.trim() : null
    return { ok: true, data: { success, resolution, chapterTitle, chapterStory, failureReason } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

const VALID_AGGRO_OUTCOMES = new Set(['defeated', 'pacified', 'failed'])

/**
 * Parse the aggro encounter judgment response.
 * @param {string} rawText
 * @returns {{ ok: true, data: { outcome: string, resolution: string, pacifiedDescription: string|null } } | { ok: false, error: string, rawText: string }}
 */
export function parseAggroJudgmentResponse(rawText) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const outcome = VALID_AGGRO_OUTCOMES.has(data.outcome) ? data.outcome : 'failed'
    const resolution = isString(data.resolution) ? data.resolution.trim() : 'The encounter ends.'
    const pacifiedDescription = outcome === 'pacified' && isString(data.pacifiedDescription)
      ? data.pacifiedDescription.trim() : null
    return { ok: true, data: { outcome, resolution, pacifiedDescription } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the end-game child NPC response.
 * @param {string} rawText
 * @returns {{ ok: true, data: { childName: string, childDescription: string, arrivalNarrative: string } } | { ok: false, error: string, rawText: string }}
 */
export function parseEndGameResponse(rawText) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const childName = isString(data.childName) ? data.childName.trim() : 'a small child'
    const childDescription = isString(data.childDescription) ? data.childDescription.trim() : 'A child who looks like a younger version of you.'
    const arrivalNarrative = isString(data.arrivalNarrative) ? data.arrivalNarrative.trim() : 'A child appears, looking up at you with wide, familiar eyes.'
    return { ok: true, data: { childName, childDescription, arrivalNarrative } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the LLM response for the notice mechanic.
 * @param {string} rawText
 * @param {import('../game/models.js').Coord} playerPos
 * @returns {{ ok: true, data: Object } | { ok: false, error: string, rawText: string }}
 */
export function parseNoticeResponse(rawText, playerPos) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const narrative = isString(data.narrative) ? data.narrative.trim() : 'Your attention sharpens, but nothing resolves.'
    const actions = sanitizeActions(data.actions, playerPos)
    return { ok: true, data: { narrative, actions } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}

/**
 * Parse the LLM response for the appearance interpretation mechanic.
 * @param {string} rawText
 * @returns {{ ok: true, data: { appearance: string } } | { ok: false, error: string, rawText: string }}
 */
export function parseAppearanceResponse(rawText) {
  try {
    const data = JSON.parse(stripFences(rawText))
    const appearance = isString(data.appearance) ? data.appearance.trim() : null
    if (!appearance) return { ok: false, error: 'Missing appearance field', rawText }
    return { ok: true, data: { appearance } }
  } catch (err) {
    return { ok: false, error: String(err), rawText }
  }
}
