import { GRID_WIDTH, GRID_HEIGHT, DIRECTION_VECTORS, START_POSITION } from './constants.js'

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
 * Generates 7 encounter locations — one per column (x 0–6), random row.
 * Excludes D4 (start) and its four cardinal neighbours (C4, D3, D5, E4)
 * so the player has time to establish their character before hitting an encounter.
 * Each location maps to a story circle chapter (2–8).
 * @returns {{ x: number, y: number, chapter: number, completed: boolean, resolution: string|null, npcName: string|null }[]}
 */
export function generateEncounterLocations() {
  // Exclude the start cell and its four cardinal neighbours
  const isExcluded = (col, row) =>
    (col === START_POSITION.x && Math.abs(row - START_POSITION.y) <= 1) ||
    (row === START_POSITION.y && Math.abs(col - START_POSITION.x) === 1)

  return Array.from({ length: 7 }, (_, x) => {
    let y
    do { y = Math.floor(Math.random() * GRID_HEIGHT) }
    while (isExcluded(x, y))
    return { x, y, chapter: x + 2, completed: false, resolution: null, npcName: null }
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
