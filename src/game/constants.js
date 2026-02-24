export const GRID_WIDTH  = 7
export const GRID_HEIGHT = 7

export const DIRECTIONS = /** @type {const} */ (['north', 'south', 'east', 'west'])

/** Maps direction names to grid deltas (y increases going south) */
export const DIRECTION_VECTORS = {
  north: { dx: 0,  dy: -1 },
  south: { dx: 0,  dy:  1 },
  east:  { dx: 1,  dy:  0 },
  west:  { dx: -1, dy:  0 },
}

/** Starting position — center of 7x7 grid (D4) */
export const START_POSITION = { x: 3, y: 3 }

/** Converts internal {x,y} coord to display label e.g. "D4" */
export function coordToLabel(coord) {
  const col = String.fromCharCode(65 + coord.x) // A=0, B=1, ..., G=6
  const row = coord.y + 1                        // 1-indexed
  return `${col}${row}`
}

/** The Gem Stone item ID — special, cannot be dropped */
export const GEM_STONE_ID = 'gem_stone'

/** The Book of Words item ID — special, cannot be dropped */
export const BOOK_OF_WORDS_ID = 'book_of_words'

/** localStorage key prefix */
export const STORAGE_PREFIX = 'word-world'

/**
 * Story circle sections — one per chapter (1–8).
 * Chapter 1 fires when the player first leaves the mirror room.
 * Chapters 2–7 fire at a random room within seven exploration sets.
 * Chapter 8 fires at the final unexplored room.
 */
export const STORY_CIRCLE = [
  { chapter: 1, theme: 'A character is in a zone of comfort or familiarity' },
  { chapter: 2, theme: 'They desire something' },
  { chapter: 3, theme: 'They enter an unfamiliar situation' },
  { chapter: 4, theme: 'They adapt to that situation' },
  { chapter: 5, theme: 'They get that which they wanted' },
  { chapter: 6, theme: 'They pay a heavy price for it' },
  { chapter: 7, theme: 'They return to their familiar situation' },
  { chapter: 8, theme: 'They have changed as a result of the journey' },
]
