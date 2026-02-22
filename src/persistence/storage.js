import { STORAGE_PREFIX } from '../game/constants.js'

const KEY_API      = `${STORAGE_PREFIX}:api-key`
const KEY_SAVE_INDEX = `${STORAGE_PREFIX}:saves`

/** @typedef {{ name: string, savedAt: number, gameDay: number }} SaveMeta */

// --- API Key ---

/** @param {string} key */
export function saveApiKey(key) {
  localStorage.setItem(KEY_API, key)
}

/** @returns {string|null} */
export function loadApiKey() {
  return localStorage.getItem(KEY_API)
}

export function clearApiKey() {
  localStorage.removeItem(KEY_API)
}

// --- Saves ---

/** @returns {SaveMeta[]} */
export function listSaves() {
  try {
    const raw = localStorage.getItem(KEY_SAVE_INDEX)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * @param {string} name
 * @param {import('../game/models.js').GameState} gameState
 */
export function saveGame(name, gameState) {
  const saveData = {
    name,
    savedAt: Date.now(),
    player: gameState.player,
    grid: gameState.grid,
    history: gameState.history,
    gameDay: gameState.gameDay ?? 1,
    lastPlayedDate: gameState.lastPlayedDate ?? new Date().toDateString(),
    firstRoomGenerated: gameState.firstRoomGenerated ?? false,
  }

  // Store the full save
  localStorage.setItem(`${STORAGE_PREFIX}:save:${name}`, JSON.stringify(saveData))

  // Update the index (include gameDay for display in saves list)
  const index = listSaves().filter(s => s.name !== name)
  index.unshift({ name, savedAt: saveData.savedAt, gameDay: saveData.gameDay })
  localStorage.setItem(KEY_SAVE_INDEX, JSON.stringify(index))
}

/**
 * @param {string} name
 * @returns {import('../game/models.js').Save|null}
 */
export function loadGame(name) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:save:${name}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** @param {string} name */
export function deleteSave(name) {
  localStorage.removeItem(`${STORAGE_PREFIX}:save:${name}`)
  const index = listSaves().filter(s => s.name !== name)
  localStorage.setItem(KEY_SAVE_INDEX, JSON.stringify(index))
}
