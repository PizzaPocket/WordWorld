import { START_POSITION, GEM_STONE_ID, BOOK_OF_WORDS_ID, STORY_CIRCLE } from './constants.js'
import { getCellKey, generateSpecialEventRooms } from './worldUtils.js'

let msgIdCounter = 0
export function makeId() { return `msg_${Date.now()}_${msgIdCounter++}` }

function todayString() { return new Date().toDateString() }

/** The Librarian — always present in the starting room. Seeded programmatically, not by the LLM. */
export const LIBRARIAN_NPC = {
  id: 'librarian',
  name: 'the Librarian',
  description: 'A tall, calm figure in worn linen, with ink-stained fingers and a warm smile. They guided you here, and are genuinely curious about the Traveller before them.',
  dialogueHistory: [],
  hasAskedName: false,
  aggro: false,
  aggroNarrative: null,
}

/** The Book of Words — narrative spine of the game. Found in starting room, cannot be dropped. */
export const BOOK_OF_WORDS_ITEM = {
  id: BOOK_OF_WORDS_ID,
  name: 'Book of Words',
  description: 'A worn leather tome, its cover etched with shifting symbols. Something about it feels important.',
  takeable: true,
  wearable: false,
  canDrop: false,
  examineText: undefined,
  metadata: undefined,
}

/** The Gem Stone — represents active Elelem energy (API connection). Cannot be dropped. */
export const GEM_STONE_ITEM = {
  id: GEM_STONE_ID,
  name: 'Gem Stone',
  description: 'A small, faceted stone that pulses with soft inner light. You sense it is connected to the Elelem.',
  takeable: false,
  wearable: false,
  canDrop: false,
  glowing: true,
  examineText: undefined,
  metadata: undefined,
}

/**
 * @param {import('./models.js').Coord} position
 * @returns {import('./models.js').Player}
 */
export function createPlayer(position = START_POSITION) {
  return {
    name: null,
    appearance: null,
    inventory: [{ ...GEM_STONE_ITEM }],
    wearing: [],
    holding: null,
    position: { ...position },
  }
}

/**
 * @param {string} text
 * @param {import('./models.js').OutputMessage['type']} type
 * @returns {import('./models.js').OutputMessage}
 */
export function createMessage(text, type = 'narrative') {
  return { id: makeId(), type, text, timestamp: Date.now() }
}

const INTRO_NARRATIVE =
`The lid clicks open.

A small, faceted gem stone tumbles into your palm — warm, pulsing with soft inner light that breathes in rhythm with something vast and unseen.

"The Elelem stirs," the Librarian says with a quiet smile. "Word World wakes for you."

The world assembles itself around you, piece by piece, called into being by your presence.`

const INTRO_HINT =
`Type LOOK to see where you are. Type NOTICE [thing] to bring something into being. Type TALK to speak to a character. Type HELP for a list of commands.`

/**
 * @returns {import('./models.js').GameState}
 */
export function createGameState() {
  const position = { ...START_POSITION }
  const startKey = getCellKey(position)

  return {
    player: createPlayer(position),
    grid: {
      [startKey]: {
        key: startKey,
        coord: position,
        visited: true,
        generated: false,
        name: null,
        description: null,
        items: [{ ...BOOK_OF_WORDS_ITEM }],
        npcs: [{ ...LIBRARIAN_NPC }],
        exits: [],
        hasMirror: false,
        mirrorUsed: false,
      }
    },
    history: [
      createMessage('DAY 1', 'day'),
      createMessage(INTRO_NARRATIVE, 'narrative'),
      createMessage(INTRO_HINT, 'system'),
    ],
    llmStatus: 'idle',
    llmError: null,
    gemStoneActive: true,
    lastError: null,
    awaitingAppearance: false,
    awaitingMirrorConfirmation: false,
    awaitingName: false,
    pendingNpcId: null,
    lastFailedPrompt: null,
    gameDay: 1,
    lastPlayedDate: todayString(),
    bookOfWords: {
      chapter1Title: null,
      chapter1Story: null,
      chapters: STORY_CIRCLE.slice(1).map(sc => ({
        number: sc.chapter,
        title: null,
        story: null,
        completed: false,
      })),
    },
    encounterLocations: [],
    specialEventRooms: generateSpecialEventRooms(),
    roomsExplored: 0,
    chapter1Triggered: false,
    activeEncounter: null,
    endGameReady: false,
    endGameTriggered: false,
    firstRoomGenerated: false,
  }
}
