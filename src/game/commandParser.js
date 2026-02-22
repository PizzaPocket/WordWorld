/**
 * Deterministic command parser.
 * Returns a ParsedCommand object. Falls back to { type: 'unknown', raw } for unrecognised input.
 *
 * @typedef {Object} ParsedCommand
 * @property {string} type
 * @property {string} [direction]
 * @property {string} [itemName]
 * @property {string} [npcName]
 * @property {string} [targetName]
 * @property {string} [saveName]
 * @property {string} [raw]
 */

const DIR_MAP = {
  n: 'north', north: 'north',
  s: 'south', south: 'south',
  e: 'east',  east: 'east',
  w: 'west',  west: 'west',
}

/**
 * @param {string} input
 * @returns {ParsedCommand}
 */
export function parseCommand(input) {
  const raw = input.trim()
  const lower = raw.toLowerCase()
  const words = lower.split(/\s+/)
  const first = words[0]
  const rest = words.slice(1).join(' ').trim()
  const restOriginal = raw.split(/\s+/).slice(1).join(' ').trim()

  // Direction-only shortcuts
  if (DIR_MAP[lower] !== undefined) {
    return { type: 'move', direction: DIR_MAP[lower] }
  }

  // Look
  if (first === 'look' && !rest) return { type: 'look' }
  if (first === 'l' && !rest)    return { type: 'look' }

  // Inventory
  if (first === 'inventory' || first === 'inv' || (first === 'i' && !rest)) {
    return { type: 'inventory' }
  }

  // Help
  if (first === 'help' || first === '?') return { type: 'help' }

  // Me / status
  if (first === 'me' || first === 'status') return { type: 'me' }

  // Saves list
  if (lower === 'saves') return { type: 'saves' }

  // Retry
  if (lower === 'retry') return { type: 'retry' }

  // Go back
  if (lower === 'go back' || lower === 'back') return { type: 'go_back' }

  // Debug
  if (lower === 'debug') return { type: 'debug' }

  // Learn more
  if (lower === 'learn more' || lower === 'lm') return { type: 'learn_more' }

  // Notice
  if (first === 'notice') {
    if (rest) return { type: 'notice', noticedThing: restOriginal }
  }

  // API key
  if (lower === 'api key' || lower === 'apikey' || lower === 'api_key') {
    return { type: 'api_key' }
  }

  // Unhold / put down
  if (lower === 'put down' || lower === 'unhold' || lower === 'lower' || lower === 'drop hand') {
    return { type: 'unhold' }
  }

  // Go [direction]
  if (first === 'go' && DIR_MAP[rest]) {
    return { type: 'move', direction: DIR_MAP[rest] }
  }
  if (first === 'move' && DIR_MAP[rest]) {
    return { type: 'move', direction: DIR_MAP[rest] }
  }
  if (first === 'walk' && DIR_MAP[rest]) {
    return { type: 'move', direction: DIR_MAP[rest] }
  }
  if (first === 'head' && words[1] === 'to' && DIR_MAP[words[2]]) {
    return { type: 'move', direction: DIR_MAP[words[2]] }
  }

  // Pick up / take / get
  if (['pick', 'take', 'get', 'grab'].includes(first)) {
    // "pick up X", "take X", "get X", "grab X"
    let name = rest
    if (first === 'pick' && words[1] === 'up') {
      name = words.slice(2).join(' ').trim()
    }
    if (name) return { type: 'pick_up', itemName: name }
  }

  // Drop
  if (first === 'drop' || first === 'leave' || first === 'place') {
    if (rest) return { type: 'drop', itemName: rest }
  }

  // Hold
  if (first === 'hold' || first === 'wield' || first === 'raise') {
    if (rest) return { type: 'hold', itemName: rest }
  }

  // Wear / put on
  if (first === 'wear' || first === 'don') {
    if (rest) return { type: 'wear', itemName: rest }
  }
  if (lower.startsWith('put on ')) {
    const name = raw.replace(/^put on /i, '').trim()
    if (name) return { type: 'wear', itemName: name.toLowerCase() }
  }

  // Remove / take off
  if (first === 'remove' || first === 'doff') {
    if (rest) return { type: 'remove', itemName: rest }
  }
  if (lower.startsWith('take off ')) {
    const name = raw.replace(/^take off /i, '').trim()
    if (name) return { type: 'remove', itemName: name.toLowerCase() }
  }

  // Examine / x / look at / read
  if (first === 'examine' || first === 'x' || first === 'inspect' || first === 'study') {
    if (rest) return { type: 'examine', targetName: rest }
  }
  if (first === 'read') {
    if (rest === 'more' || rest === 'next') return { type: 'read_more' }
    return { type: 'examine', targetName: restOriginal || 'book of words' }
  }
  if (lower.startsWith('look at ')) {
    const name = raw.replace(/^look at /i, '').trim()
    if (name) return { type: 'examine', targetName: name.toLowerCase() }
  }

  // Talk to / speak to / ask / address
  if (lower.startsWith('talk to ') || lower.startsWith('speak to ') ||
      lower.startsWith('speak with ') || lower.startsWith('talk with ')) {
    const npcName = raw.replace(/^(talk|speak) (to|with) /i, '').trim().toLowerCase()
    if (npcName) return { type: 'talk', npcName }
  }
  if (first === 'ask' || first === 'address' || first === 'greet') {
    if (rest) return { type: 'talk', npcName: rest }
  }

  // Save
  if (first === 'save') {
    const name = restOriginal || 'autosave'
    return { type: 'save', saveName: name }
  }

  // Load
  if (first === 'load') {
    if (rest) return { type: 'load', saveName: restOriginal }
    return { type: 'saves' } // show list if no name given
  }

  // Delete save
  if (first === 'delete' && (words[1] === 'save' || words[1] === 'saves')) {
    const name = words.slice(2).join(' ')
    if (name) return { type: 'delete_save', saveName: name }
  }

  return { type: 'unknown', raw }
}
