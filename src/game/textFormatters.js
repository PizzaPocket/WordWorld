import { coordToLabel, GEM_STONE_ID, BOOK_OF_WORDS_ID } from './constants.js'

/**
 * @param {import('./models.js').Cell} cell
 * @param {import('./models.js').Coord} [coord]
 * @returns {string}
 */
export function describeRoom(cell, coord) {
  if (!cell.generated) return 'You stand in an undefined space. The world has not taken shape here yet.'

  const parts = []

  const locationLabel = coord ? `[${coordToLabel(coord)}]` : ''
  if (cell.name) {
    parts.push(locationLabel ? `${cell.name.toUpperCase()}  ${locationLabel}` : cell.name.toUpperCase())
  } else if (locationLabel) {
    parts.push(locationLabel)
  }

  if (cell.description) parts.push(cell.description)

  if (cell.items.length > 0) {
    const itemList = cell.items.map(i => `  ${i.name} — ${i.description}`).join('\n')
    parts.push(`You see:\n${itemList}`)
  }

  if (cell.npcs.length > 0) {
    const npcList = cell.npcs.map(n => `  ${n.name} — ${n.description}`).join('\n')
    parts.push(`Also here:\n${npcList}`)
  }

  if (cell.exits.length > 0) {
    parts.push(`Exits: ${cell.exits.join(', ')}`)
  } else {
    parts.push('There are no obvious exits.')
  }

  if (cell.blockedExits && cell.blockedExits.length > 0) {
    const list = cell.blockedExits.map(e => `${e.direction} — ${e.obstacle}`).join('\n  ')
    parts.push(`Blocked:\n  ${list}`)
  }

  return parts.join('\n\n')
}

/**
 * @param {import('./models.js').Player} player
 * @param {boolean} gemStoneActive
 * @returns {string}
 */
export function formatInventory(player, gemStoneActive = true) {
  const parts = []

  const allItems = [
    ...player.inventory,
    ...(player.holding ? [player.holding] : []),
    ...player.wearing,
  ]

  if (allItems.length === 0) return 'You are carrying nothing.'

  if (player.holding) {
    parts.push(`Holding: ${player.holding.name}`)
  }

  if (player.wearing.length > 0) {
    const wearingList = player.wearing.map(i => `  ${i.name}`).join('\n')
    parts.push(`Wearing:\n${wearingList}`)
  }

  if (player.inventory.length > 0) {
    const invList = player.inventory.map(i => {
      if (i.id === GEM_STONE_ID) {
        const state = gemStoneActive ? '[glowing]' : '[dim]'
        return `  ${i.name} ${state} — ${i.description}`
      }
      if (i.id === BOOK_OF_WORDS_ID) {
        return `  ${i.name} [read to see contents] — ${i.description}`
      }
      return `  ${i.name} — ${i.description}`
    }).join('\n')
    parts.push(`In your pack:\n${invList}`)
  } else {
    parts.push('Your pack is empty.')
  }

  return parts.join('\n\n')
}

/**
 * @param {import('./models.js').Player} player
 * @returns {string}
 */
export function formatPlayerStatus(player) {
  const parts = []
  if (player.name) parts.push(`Name: ${player.name}`)
  if (player.appearance) parts.push(`Appearance: ${player.appearance}`)
  if (!player.name && !player.appearance) parts.push('You have no sense of yourself yet.')
  return parts.join('\n')
}

/**
 * @param {{ chapter1Title: string|null, chapters: { number: number, title: string|null, completed: boolean }[] }} bookOfWords
 * @returns {string}
 */
export function formatBookOfWords(bookOfWords) {
  const lines = ['BOOK OF WORDS', 'Table of Contents', '']

  const ch1Title = bookOfWords.chapter1Title ?? '[ not yet written ]'
  lines.push(`  Chapter One    — ${ch1Title}`)

  for (const ch of bookOfWords.chapters) {
    const num = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'][ch.number - 2]
    const title = ch.title ?? '[ not yet written ]'
    const label = `Chapter ${num}`.padEnd(14)
    lines.push(`  ${label} — ${title}`)
  }

  const ch1Done = bookOfWords.chapter1Title !== null ? 1 : 0
  const completed = bookOfWords.chapters.filter(c => c.completed).length + ch1Done
  const total = bookOfWords.chapters.length + 1 // 7 encounter chapters + chapter 1
  lines.push('')
  lines.push(`${completed} of ${total} chapters written.`)

  return lines.join('\n')
}

/**
 * @returns {string}
 */
export function formatHelp() {
  return `COMMANDS
  look / l                   — describe your current location
  go [direction] / [n/s/e/w] — move in a direction
  inventory / i / inv        — show what you're carrying
  pick up [item] / take / get — pick up an item
  drop [item]                — leave an item here
  hold [item]                — hold an item in your hand
  put down / unhold          — stop holding your item
  wear [item] / put on       — wear something
  remove [item] / take off   — take off a worn item
  examine [thing] / x        — examine something closely
  read [item]                — read an item (use on the Book of Words for Table of Contents)
  notice [thing]             — bring something into being
  talk to [npc]              — speak to someone
  me / status                — describe yourself
  save [name]                — save the game
  load [name]                — load a save
  saves                      — list all saves
  retry                      — retry if the last action failed
  debug                      — show last error details
  learn more / lm            — explain the Gem Stone and rate limits
  help / ?                   — this message`
}
