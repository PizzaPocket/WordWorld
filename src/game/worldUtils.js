import { GRID_WIDTH, GRID_HEIGHT, DIRECTION_VECTORS } from './constants.js'

/**
 * @param {import('./models.js').Coord} coord
 * @returns {string}
 */
export function getCellKey(coord) {
  return `${coord.x},${coord.y}`
}

/**
 * @param {import('./models.js').Coord} coord
 * @returns {boolean}
 */
export function isInBounds(coord) {
  return coord.x >= 0 && coord.x < GRID_WIDTH && coord.y >= 0 && coord.y < GRID_HEIGHT
}

/**
 * Returns the coordinate in a given direction, or null if out of bounds.
 * @param {import('./models.js').Coord} coord
 * @param {import('./models.js').Direction} direction
 * @returns {import('./models.js').Coord|null}
 */
export function getAdjacentCoord(coord, direction) {
  const vector = DIRECTION_VECTORS[direction]
  if (!vector) return null
  const next = { x: coord.x + vector.dx, y: coord.y + vector.dy }
  return isInBounds(next) ? next : null
}

/**
 * Returns which directions from coord are within bounds.
 * @param {import('./models.js').Coord} coord
 * @returns {import('./models.js').Direction[]}
 */
export function getValidDirections(coord) {
  return /** @type {import('./models.js').Direction[]} */ (
    Object.keys(DIRECTION_VECTORS).filter(dir => getAdjacentCoord(coord, dir) !== null)
  )
}

/**
 * 47 remaining rooms (rooms 3–49) divided into 7 sets.
 * First 5 sets have 7 rooms each; last 2 sets have 6 rooms each (5×7 + 2×6 = 47).
 * Chapters 2–7 fire at a random room within their set. Chapter 8 fires at room 47.
 */
const SPECIAL_EVENT_SETS = [
  [1,  7 ],  // chapter 2
  [8,  14],  // chapter 3
  [15, 21],  // chapter 4
  [22, 28],  // chapter 5
  [29, 35],  // chapter 6
  [36, 41],  // chapter 7
  [42, 47],  // chapter 8 — always room 47
]

/**
 * Pre-computes when each Special Event (chapters 2–8) will fire, by room count.
 * @returns {{ chapter: number, room: number, fired: boolean }[]}
 */
export function generateSpecialEventRooms() {
  return SPECIAL_EVENT_SETS.map(([start, end], i) => {
    const chapter = i + 2
    const room = chapter === 8 ? 47 : Math.floor(Math.random() * (end - start + 1)) + start
    return { chapter, room, fired: false }
  })
}

/**
 * Returns the encounter location at the given coord, or null if none.
 * @param {import('./models.js').Coord} coord
 * @param {{ x: number, y: number, chapter: number, completed: boolean }[]} encounterLocations
 */
export function findEncounterAt(coord, encounterLocations) {
  return encounterLocations.find(e => e.x === coord.x && e.y === coord.y) ?? null
}

/**
 * Builds a neighbor context string for the LLM room generation prompt.
 * @param {Object.<string, import('./models.js').Cell>} grid
 * @param {import('./models.js').Coord} coord
 * @returns {string}
 */
export function getNeighborContext(grid, coord) {
  const lines = []
  const dirs = ['north', 'south', 'east', 'west']

  for (const dir of dirs) {
    const adj = getAdjacentCoord(coord, dir)
    if (!adj) {
      lines.push(`${dir}: [edge of world — the Elelem's reach ends here]`)
      continue
    }
    const key = getCellKey(adj)
    const cell = grid[key]
    if (cell?.generated) {
      lines.push(`${dir}: "${cell.name}" — ${cell.description?.split('.')[0]}.`)
    } else {
      lines.push(`${dir}: [unexplored]`)
    }
  }

  return lines.join('\n')
}
