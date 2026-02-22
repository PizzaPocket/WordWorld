/**
 * @typedef {'north'|'south'|'east'|'west'} Direction
 */

/**
 * @typedef {Object} Coord
 * @property {number} x - 0 to GRID_SIZE-1
 * @property {number} y - 0 to GRID_SIZE-1
 */

/**
 * @typedef {Object} Item
 * @property {string} id           - stable snake_case unique id, e.g. "rusty_key"
 * @property {string} name         - display name, e.g. "rusty key"
 * @property {string} description  - one-sentence description seen from the room
 * @property {string} [examineText] - detailed text revealed on first examine
 * @property {boolean} takeable    - can it be picked up?
 * @property {boolean} wearable    - can it be worn?
 * @property {Object} [metadata]   - arbitrary extra data the LLM may produce
 */

/**
 * @typedef {Object} NPC
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string[]} dialogueHistory - alternating ["player: ...", "npc: ..."] lines
 * @property {boolean} hasAskedName     - did this NPC ask the player's name?
 */

/**
 * @typedef {Object} Cell
 * @property {string} key         - "{x},{y}" string key
 * @property {Coord} coord
 * @property {boolean} visited    - has the player ever stepped here?
 * @property {boolean} generated  - has LLM content been generated?
 * @property {string} [name]      - short room name, e.g. "Crumbling Watchtower"
 * @property {string} [description] - LLM-generated room description (2-4 sentences)
 * @property {Item[]} items       - items currently on the floor
 * @property {NPC[]} npcs         - NPCs currently in the room
 * @property {Direction[]} exits  - which directions lead somewhere
 * @property {boolean} [hasMirror] - triggers appearance prompt on first look
 * @property {boolean} mirrorUsed  - appearance prompt already triggered
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} Player
 * @property {string|null} name
 * @property {string|null} appearance
 * @property {Item[]} inventory
 * @property {Item[]} wearing
 * @property {Item|null} holding
 * @property {Coord} position
 */

/**
 * @typedef {'idle'|'loading'|'error'} LlmStatus
 */

/**
 * @typedef {Object} OutputMessage
 * @property {string} id
 * @property {'narrative'|'system'|'command'|'error'|'llm'} type
 * @property {string} text
 * @property {number} timestamp
 */

/**
 * @typedef {Object} GameState
 * @property {Player} player
 * @property {Object.<string, Cell>} grid   - sparse map keyed by "{x},{y}"
 * @property {OutputMessage[]} history      - full terminal output history
 * @property {LlmStatus} llmStatus
 * @property {string|null} llmError
 * @property {boolean} awaitingAppearance   - player needs to type their appearance
 * @property {boolean} awaitingName         - an NPC asked for the player's name
 * @property {string|null} pendingNpcId     - which NPC asked
 * @property {string|null} lastFailedPrompt - stored for retry command
 */

/**
 * @typedef {Object} Save
 * @property {string} name
 * @property {number} savedAt
 * @property {Player} player
 * @property {Object.<string, Cell>} grid
 * @property {OutputMessage[]} history
 */
