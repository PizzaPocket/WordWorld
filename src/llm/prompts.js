/**
 * All LLM prompt builder functions.
 * Pure functions — no side effects. Take game state slices, return strings.
 */

export const SYSTEM_PROMPT = `You are the game engine for a text-based adventure game called Word World.
The world is a 7x7 grid of cells (columns A-G, rows 1-7). The player starts at D4 (center).
The world is imbued with life by the Elelem, an omnipresent life force. Be creative, surreal, and unpredictable. There is no fixed theme — rooms may end up being themed atmospheres such as mundane, alien, fantastic, playful, absurd, dreamlike, or anything in between.
Maintain loose internal consistency within a single session, but don't be afraid to be strange.
Write at an intermediate reading level — clear, direct sentences. Vivid but not overwrought. Aim for the tone of a good middle-grade adventure novel: concrete images, no purple prose, no stacking adjectives.

CRITICAL RULES:
- Always respond with valid JSON matching the exact schema requested. No extra keys, no missing keys.
- Never break the fourth wall or mention that this is an AI or a language model.
- Never refuse to generate content. If uncertain, invent something strange.
- Descriptions must be vivid but concise (2-4 sentences maximum per description field).
- Item names: lowercase, 1-4 words. NPC names may be proper nouns. The Book of Words and the Gem Stone are proper nouns and must always be capitalised as such.
- Do not wrap your response in markdown code fences. Return raw JSON only.
- The PLAYER_DEATH action resets the player to D4. Use it when the player experiences a clear fatal outcome. Always include a dramatic narrative before triggering it.`

/**
 * Returns a compact string of written Book of Words chapters (title + story).
 * Included in encounter and dialogue prompts to give the LLM narrative continuity.
 * @param {{ chapter1Title: string|null, chapter1Story: string|null, chapters: { number: number, title: string|null, story: string|null, completed: boolean }[] }} bookOfWords
 * @returns {string}
 */
export function buildBookContext(bookOfWords) {
  const lines = []
  if (bookOfWords.chapter1Title) {
    lines.push(`Chapter One: "${bookOfWords.chapter1Title}"`)
    if (bookOfWords.chapter1Story) lines.push(`  ${bookOfWords.chapter1Story}`)
  }
  for (const ch of bookOfWords.chapters) {
    if (ch.title) {
      lines.push(`Chapter ${ch.number}: "${ch.title}"`)
      if (ch.story) lines.push(`  ${ch.story}`)
    }
  }
  return lines.length ? lines.join('\n') : '(no chapters written yet)'
}

/**
 * @param {import('../game/models.js').Coord} coord
 * @param {string} neighborContext
 * @param {{ npcName: string|null, resolution: string|null }|null} [encounterContext]
 * @param {boolean} [forceMirror]
 * @returns {string}
 */
/**
 * Builds a compact player context string for room generation.
 * Omits universal items (gem stone, book of words) that every player carries.
 * Returns empty string if there is nothing distinctive to say.
 * @param {import('../game/models.js').Player} player
 * @returns {string}
 */
function buildPlayerContext(player) {
  const lines = []
  if (player.appearance) lines.push(`Appearance: ${player.appearance}`)

  const worn = player.wearing.map(i => i.name)
  if (worn.length) lines.push(`Wearing: ${worn.join(', ')}`)

  if (player.holding) lines.push(`Holding: ${player.holding.name}`)

  const carried = player.inventory
    .filter(i => i.id !== 'gem_stone' && i.id !== 'book_of_words')
    .map(i => i.name)
  if (carried.length) lines.push(`Carrying: ${carried.join(', ')}`)

  if (!lines.length) return ''
  return `TRAVELLER (this person is entering the room — let their nature subtly echo in what you place here, but do not overdo it):\n${lines.join('\n')}`
}

export function buildRoomPrompt(coord, neighborContext, encounterContext = null, forceMirror = false, player = null, allowBlockedExit = false, npcType = 'none') {
  const { x, y } = coord
  const blocked = []
  if (y === 0) blocked.push('"north"')
  if (y === 6) blocked.push('"south"')
  if (x === 0) blocked.push('"west"')
  if (x === 6) blocked.push('"east"')

  const col = String.fromCharCode(65 + x)
  const row = y + 1

  const playerSection = player ? buildPlayerContext(player) : ''

  const npcSchema = npcType === 'none' ? '' : npcType === 'aggro'
    ? `  "npcs": [
    {
      "id": "string (snake_case, unique)",
      "name": "string",
      "description": "string (one sentence)",
      "aggroNarrative": "string (1-2 sentences: what this NPC does the instant the player enters — threatening, immediate, present tense)"
    }
  ],`
    : `  "npcs": [
    {
      "id": "string (snake_case, unique)",
      "name": "string",
      "description": "string (one sentence)"
    }
  ],`

  const npcConstraint = npcType === 'none'
    ? '- npcs: leave this as an empty array [] for this room.'
    : npcType === 'aggro'
      ? '- npcs: this room has exactly one hostile NPC — dangerous, territorial, or predatory. The aggroNarrative field MUST describe what they do the instant the player enters. Do not resolve the confrontation.'
      : '- npcs: this room has exactly one NPC. Describe them as curious and open to conversation — the player should feel invited to approach them.'

  return `Generate content for grid cell ${col}${row} (x=${x}, y=${y}).

NEIGHBORING CELLS (for loose thematic continuity — you don't have to match them):
${neighborContext}
${playerSection ? `\n${playerSection}\n` : ''}
Respond with JSON matching this exact schema:
{
  "name": "string (short room name, 2-5 words)",
  "description": "string (vivid 2-4 sentence room description, present tense, second person)",
  "narrative": "string (what the player experiences upon arrival, 1-3 sentences, present tense, second person)",
  "items": [
    {
      "id": "string (snake_case, unique, e.g. tarnished_coin)",
      "name": "string (lowercase, 1-4 words)",
      "description": "string (one sentence describing it as seen from the room)",
      "takeable": true or false,
      "wearable": true or false
    }
  ],
${npcSchema ? npcSchema + '\n' : '  "npcs": [],\n'}  "exits": ["north", "south", "east", "west"],
  "blockedExits": [
    { "direction": "north"|"south"|"east"|"west", "obstacle": "string (one sentence describing what physically blocks this exit, as seen from the room)" }
  ],
  "hasMirror": true or false
}

CONSTRAINTS:
- exits array: include every direction the player can walk through freely. Every non-boundary direction MUST appear in either exits or blockedExits — do not silently omit any.${blocked.length ? `\n  BOUNDARY DIRECTIONS: ${blocked.join(', ')} — this room is at the world's edge in those directions. Do NOT include them in exits, blockedExits, or any description or narrative. The world simply ends there; do not draw attention to it.` : '\n  All four directions (north, south, east, west) are within the world boundary — each must be either an open exit or a blocked exit.'}
- blockedExits: ${allowBlockedExit ? 'this room MUST have exactly one blocked exit — pick one direction and describe a visible physical obstruction (locked door, rubble, sealed arch, etc.) that COULD potentially be cleared by player action. The description or narrative MUST mention it.' : 'leave this as an empty array [] for this room.'}
- items: 0-4 items. Most rooms have 0-2 items. Empty rooms are fine and often more atmospheric.
- ${npcConstraint}
- hasMirror: ${forceMirror ? 'MUST be true for this room. The room contains a mirror — mention it explicitly in the description or narrative.' : 'set to true in approximately 1 out of 15 rooms.'}
- At least 2 exits in most rooms (the world should feel explorable).${encounterContext ? `

ENCOUNTER HISTORY: This location was the site of a special story encounter. Let this subtly flavor the room's atmosphere.
  NPC who appeared here: ${encounterContext.npcName || 'unknown'}
  What transpired: ${encounterContext.resolution || 'unknown'}
The NPC may still be present (as a regular NPC) or the room may bear traces of what happened.` : ''}`
}

export function buildAggroJudgmentPrompt(npc, playerResponse) {
  return `You are judging the outcome of a dangerous encounter in Word World.

NPC: ${npc.name} — ${npc.description}
THE THREAT: "${npc.aggroNarrative}"
PLAYER'S RESPONSE: "${playerResponse}"

Determine the outcome. Three possibilities:
- "defeated": the player overcomes or escapes the threat by force, wit, or cunning — the NPC is gone.
- "pacified": the player disarms, befriends, or wins over the NPC — they become calm and willing to talk.
- "failed": the player's response is insufficient, nonsensical, or makes things worse — they are overwhelmed.

Respond with JSON:
{
  "outcome": "defeated" or "pacified" or "failed",
  "resolution": "string (2-3 sentences, second person, present tense — describe what happens)",
  "pacifiedDescription": "string (only if outcome is pacified — one sentence describing the NPC now that they are calm)"
}`
}

/**
 * @param {string} rawCommand
 * @param {import('../game/models.js').GameState} gameState
 * @param {import('../game/models.js').Cell} currentCell
 * @returns {string}
 */
export function buildCommandPrompt(rawCommand, gameState, currentCell) {
  const { player } = gameState
  const roomItems = currentCell.items.length
    ? currentCell.items.map(i => `${i.name} [id:${i.id}]: ${i.description}`).join('; ')
    : 'none'
  const roomNpcs = currentCell.npcs.length
    ? currentCell.npcs.map(n => `${n.name} [id:${n.id}]`).join(', ')
    : 'none'
  const inventory = player.inventory.length
    ? player.inventory.map(i => `${i.name} [id:${i.id}]`).join(', ')
    : 'nothing'
  const wearing = player.wearing.length
    ? player.wearing.map(i => `${i.name} [id:${i.id}]`).join(', ')
    : 'nothing'
  const holding = player.holding ? `${player.holding.name} [id:${player.holding.id}]` : 'nothing'

  const openExits = currentCell.exits.join(', ') || 'none'
  const blockedExitsText = (currentCell.blockedExits || []).length
    ? currentCell.blockedExits.map(e => `${e.direction} (${e.obstacle})`).join('; ')
    : 'none'

  return `The player typed: "${rawCommand}"

CURRENT STATE:
Room: ${currentCell.name || 'Unnamed'} — ${currentCell.description || '(no description)'}
Open exits: ${openExits}
Blocked exits (physical obstructions that player actions could clear): ${blockedExitsText}
Items in room: ${roomItems}
NPCs in room: ${roomNpcs}
Player inventory: ${inventory}
Player is holding: ${holding}
Player is wearing: ${wearing}
Player name: ${player.name || 'unknown'}
Player appearance: ${player.appearance || 'unknown'}

Interpret this command and respond with JSON:
{
  "understood": true or false,
  "narrative": "string (what happens, 1-3 sentences, present tense, second person)",
  "actions": []
}

AVAILABLE ACTION TYPES (include only if the command causes a game state change):
{ "type": "ADD_ITEM_TO_INVENTORY", "itemId": "string" }
{ "type": "REMOVE_ITEM_FROM_ROOM", "itemId": "string" }
{ "type": "ADD_ITEM_TO_ROOM", "itemId": "string", "item": { id, name, description, takeable, wearable } }
{ "type": "REMOVE_ITEM_FROM_INVENTORY", "itemId": "string" }
{ "type": "SET_PLAYER_NAME", "name": "string" }
{ "type": "SET_PLAYER_APPEARANCE", "appearance": "string" }
{ "type": "DAMAGE_ITEM", "itemId": "string", "description": "string (new description — use for cosmetic wear/damage only, not structural change)" }
{ "type": "TRANSFORM_ITEM", "itemId": "string", "newItem": { id, name, description, takeable, wearable } }
  — Use TRANSFORM_ITEM whenever a player action changes what an item fundamentally is (smashed, melted, combined, etc.). This replaces the original item in-place. Never use ADD_ITEM_TO_ROOM to add the result of a transformation without also using REMOVE_ITEM_FROM_ROOM to remove the original — otherwise both will exist.
{ "type": "SPAWN_NPC", "npc": { id, name, description } }
{ "type": "REMOVE_NPC", "npcId": "string" }
{ "type": "ADD_EXIT", "direction": "north"|"south"|"east"|"west" }
{ "type": "REMOVE_EXIT", "direction": "north"|"south"|"east"|"west" }
{ "type": "PLAYER_DEATH" }

ITEM STATE RULES:
- If the player throws, drops, places, or otherwise releases an item, it MUST be removed from inventory (REMOVE_ITEM_FROM_INVENTORY). If it lands in the room, also ADD_ITEM_TO_ROOM. If it is destroyed or lost, just remove it.
- If the player picks something up, ADD_ITEM_TO_INVENTORY + REMOVE_ITEM_FROM_ROOM.
- Never describe an item moving without the corresponding state change actions.

If the command cannot be meaningfully interpreted or is impossible in context, set "understood": false
and provide a narrative explaining in-world why nothing happened. Never say "I don't understand".`
}

/**
 * Builds the start-room prompt (used only for D4 first generation).
 * The Librarian is seeded programmatically — just instruct the LLM to reference them.
 * @param {import('../game/models.js').Coord} coord
 * @param {string} neighborContext
 * @returns {string}
 */
export function buildStartRoomPrompt(coord, neighborContext) {
  const base = buildRoomPrompt(coord, neighborContext)
  return `${base}

ADDITIONAL REQUIREMENT — BOOK OF WORDS:
The starting room must contain the Book of Words as one of its items. Include it exactly as:
{ "id": "book_of_words", "name": "book of words", "takeable": true, "wearable": false, "description": "A worn leather tome, its cover etched with shifting symbols. Something about it feels important." }

ADDITIONAL REQUIREMENT — THE LIBRARIAN:
The Librarian is already present in this room. Mention them in the description or narrative — they are a tall, calm figure with ink-stained fingers who guided the player here. Do NOT add them to the npcs array (they are seeded separately).`
}

/**
 * Builds the Chapter One writing prompt — called when the player first leaves the mirror room.
 * Uses accumulated context (player name/appearance, start room) for a richer chapter.
 * @param {import('../game/models.js').Player} player
 * @param {import('../game/models.js').Cell|null} startRoomCell
 * @returns {string}
 */
export function buildChapter1Prompt(player, startRoomCell) {
  const roomName = startRoomCell?.name || 'the starting chamber'
  const roomDesc = startRoomCell?.description || ''

  return `You are writing Chapter One of the Book of Words in Word World.

STORY CIRCLE THEME: "A character is in a zone of comfort or familiarity."

THE TRAVELLER:
  Name: ${player.name || 'unknown (use "the Traveller")'}
  ${player.appearance ? `Appearance: ${player.appearance}` : 'Appearance: unknown'}

THE FIRST ROOM (where the journey began):
  ${roomName} — ${roomDesc}

Write a chapter title (4–8 words) and a chapter story (3–4 sentences, third person past tense, warm and slightly mythic, intermediate reading level — clear and vivid like a good children's book). Use the Traveller's name if known, otherwise "the Traveller".

Respond with JSON:
{
  "chapter1Title": "string (4–8 word chapter title)",
  "chapter1Story": "string (3–4 sentence storybook prose, third person past tense)"
}`
}

/**
 * Builds the encounter setup prompt (stage 1 — NPC challenge).
 * @param {import('../game/models.js').Coord} coord
 * @param {string} storyTheme
 * @param {import('../game/models.js').Player} player
 * @param {Object|null} [bookOfWords]
 * @returns {string}
 */
export function buildEncounterPrompt(coord, storyTheme, player, bookOfWords = null) {
  const { x, y } = coord
  const col = String.fromCharCode(65 + x)
  const row = y + 1
  const inventory = player.inventory.map(i => i.name).join(', ') || 'nothing'
  const bookCtx = bookOfWords ? buildBookContext(bookOfWords) : null

  return `Generate a special encounter at grid location ${col}${row} in Word World.

STORY CIRCLE THEME: "${storyTheme}"

PLAYER:
  Name: ${player.name || 'unknown'}
  Appearance: ${player.appearance || 'unknown'}
  Inventory: ${inventory}
${bookCtx ? `\nBOOK OF WORDS (chapters written so far — let this inform the encounter's tone and continuity):\n${bookCtx}\n` : ''}
Generate a special encounter that expresses the theme above — but the encounter can take ANY form across the full spectrum of human experience. It does not need to be dramatic or mysterious. It could be mundane, playful, absurd, tender, funny, strange, or quietly poignant. The NPC could be anyone or anything: an elderly stranger asking for directions, a child who wants to play a game, a talking animal mid-task, a robot with an urgent errand, a merchant with an unusual problem, a creature simply going about its day.

The encounter should:
- Express the Story Circle theme through situation and character — not through grand speeches or dramatic declarations
- Feature a named NPC with a distinct voice and presence
- Present a clear situation the player can meaningfully respond to
- End with the NPC waiting for the player's response

Do NOT resolve the encounter — leave it open for the player to act.
Do NOT default to mysterious figures, cloaked strangers, or portentous questions. Be specific and surprising.

Respond with JSON:
{
  "narrative": "string (the full encounter description, 3–6 sentences, second person, present tense)",
  "npcName": "string (the NPC's name)",
  "situationSummary": "string (1–2 sentence internal summary of what the player must decide, used for judgment)"
}`
}

/**
 * Builds the encounter judgment prompt (stage 2 — pass/fail + resolution).
 * @param {string} playerResponse
 * @param {{ narrative: string, npcName: string, situationSummary: string }} encounterContext
 * @param {string} storyTheme
 * @param {number} chapterNumber
 * @param {Object|null} [bookOfWords]
 * @returns {string}
 */
export function buildEncounterJudgmentPrompt(playerResponse, encounterContext, storyTheme, chapterNumber, bookOfWords = null, playerName = null) {
  const bookCtx = bookOfWords ? buildBookContext(bookOfWords) : null
  const protagonistName = playerName || 'the Traveller'
  return `You are judging the outcome of a special encounter in Word World.

ENCOUNTER:
${encounterContext.narrative}

SITUATION: ${encounterContext.situationSummary}
STORY THEME: "${storyTheme}"
NPC: ${encounterContext.npcName}
PROTAGONIST NAME: ${protagonistName}
${bookCtx ? `\nBOOK OF WORDS (story so far):\n${bookCtx}\n` : ''}
PLAYER'S RESPONSE: "${playerResponse}"

Determine whether the player's response reflects the spirit of the Elelem and is meaningful for the theme "${storyTheme}".
A response succeeds if it shows genuine engagement, creativity, honesty, or wisdom — not necessarily the "right" answer.
A response fails if it is dismissive, nonsensical in context, or works against the spirit of the theme.

If successful, also provide a chapter title for Chapter ${chapterNumber} of the Book of Words (4–8 words, evocative, reflecting what transpired), and a chapter story (3–4 sentences of storybook prose expanding on what happened — warm and slightly mythic, intermediate reading level, like a good children's book).

Respond with JSON:
{
  "success": true or false,
  "resolution": "string (narrative resolution of the encounter, 2–4 sentences, second person, present tense — works for both pass and fail)",
  "chapterTitle": "string (only if success — 4–8 word chapter title for Book of Words)",
  "chapterStory": "string (only if success — 3–4 sentence storybook prose for Book of Words, third person past tense — always refer to the protagonist as ${protagonistName})",
  "failureReason": "string (only if failure — one sentence, in-world reason the Elelem did not accept the response)"
}`
}

/**
 * Builds the end-game child NPC generation prompt.
 * @param {import('../game/models.js').Player} player
 * @param {{ chapter1Title: string|null, chapters: { number: number, title: string|null }[] }} bookOfWords
 * @returns {string}
 */
export function buildEndGamePrompt(player, bookOfWords) {
  const chapterList = [
    `Chapter One: ${bookOfWords.chapter1Title || 'untitled'}`,
    ...bookOfWords.chapters.map(c => `Chapter ${c.number}: ${c.title || 'untitled'}`),
  ].join('\n')

  return `The player has completed the Book of Words in Word World. Generate the end-game child NPC.

PLAYER:
  Name: ${player.name || 'a wanderer'}
  Appearance: ${player.appearance || 'unknown'}

BOOK OF WORDS — TABLE OF CONTENTS:
${chapterList}

Generate a child NPC who is a younger mirror of the player — sharing their appearance but smaller, younger, and wide-eyed with wonder. The child has arrived at the starting location, drawn by the completed story, and wants to be read the Book of Words.

The child should feel like a vision of the player's past self, or perhaps the future. Their name should be a diminutive or echo of the player's name if known, or something poetic if not.

Respond with JSON:
{
  "childName": "string (the child's name)",
  "childDescription": "string (1–2 sentence description of the child, echoing the player's appearance)",
  "arrivalNarrative": "string (2–4 sentence narrative of the child's appearance in the starting room, second person, present tense)"
}`
}

/**
 * @param {string} noticedThing
 * @param {import('../game/models.js').GameState} gameState
 * @param {import('../game/models.js').Cell} currentCell
 * @returns {string}
 */
export function buildNoticePrompt(noticedThing, gameState, currentCell) {
  const { player } = gameState
  const roomItems = currentCell.items.length
    ? currentCell.items.map(i => `${i.name}: ${i.description}`).join('; ')
    : 'none'

  const holding = player.holding ? player.holding.name : 'nothing'
  const wearing = player.wearing.length ? player.wearing.map(i => i.name).join(', ') : 'nothing'

  return `The player used the NOTICE command: "notice ${noticedThing}"

The NOTICE mechanic allows the player to bring things into reality through focused attention.
Whatever they notice becomes real — it was always there, just unobserved.

CURRENT STATE:
Room: ${currentCell.name || 'Unnamed'} — ${currentCell.description || '(no description)'}
Items already in room: ${roomItems}
Player inventory: ${player.inventory.map(i => i.name).join(', ') || 'nothing'}
Player is holding: ${holding}
Player is wearing: ${wearing}

Interpret what the player noticed and respond with JSON:
{
  "narrative": "string (1-3 sentences describing the noticed thing coming into focus, present tense, second person)",
  "actions": []
}

AVAILABLE ACTIONS:
{ "type": "ADD_ITEM_TO_ROOM", "itemId": "string", "item": { id, name, description, takeable, wearable } }
{ "type": "ADD_ITEM_TO_INVENTORY", "itemId": "string", "item": { id, name, description, takeable, wearable } }
{ "type": "ADD_ITEM_TO_WEARING", "itemId": "string", "item": { id, name, description, takeable: false, wearable: true } }
{ "type": "SPAWN_NPC", "npc": { id, name, description } }
{ "type": "ADD_EXIT", "direction": "north"|"south"|"east"|"west" }
{ "type": "UPDATE_ROOM_DESCRIPTION", "description": "string" }

RULES:
- The noticed thing should feel like it was always subtly present — not conjured, but revealed.
- Be creative. "notice a key" → a tarnished key catches the light. "notice a door" → a hairline crack resolves into a door frame.
- If the noticed thing is something the player would be carrying or holding (e.g. "notice I'm holding a sword"), use ADD_ITEM_TO_INVENTORY.
- If the noticed thing is something the player would be wearing (e.g. "notice I'm wearing flippers"), use ADD_ITEM_TO_WEARING.
- Otherwise, use ADD_ITEM_TO_ROOM.
- Items created by NOTICE should have plausible IDs (snake_case).
- If the noticed thing already exists (matches an existing item, NPC, or inventory item), describe it in more detail instead of creating a duplicate.
- Keep it grounded in the existing room's atmosphere.`
}

/**
 * @param {import('../game/models.js').NPC} npc
 * @param {string} playerInput
 * @param {import('../game/models.js').GameState} gameState
 * @param {import('../game/models.js').Cell} currentCell
 * @returns {string}
 */
export function buildDialoguePrompt(npc, playerInput, gameState, currentCell) {
  const { player } = gameState
  const MAX_HISTORY = 20
  const recentHistory = npc.dialogueHistory.slice(-MAX_HISTORY)
  const historyText = recentHistory.length
    ? recentHistory.join('\n')
    : '(no prior conversation)'

  const isChild = npc.id === 'child_wanderer'
  const bookSection = isChild && gameState.bookOfWords
    ? `\nBOOK OF WORDS (the completed story — the child has come to hear this read aloud):\n${buildBookContext(gameState.bookOfWords)}\n`
    : ''

  const librarianNote = npc.id === 'librarian' && !player.name
    ? `\nNOTE: The Librarian does not yet know the Traveller's name. Ask for it naturally and warmly early in this conversation.\n`
    : ''

  const nameKnownNote = player.name
    ? `\nNOTE: The Traveller's name is already known to be "${player.name}". Do not ask for it.\n`
    : ''

  return `You are playing the role of "${npc.name}" in a text-based adventure game.

NPC DESCRIPTION: ${npc.description}
CURRENT ROOM: ${currentCell.name || 'Unnamed'} — ${currentCell.description || ''}
PLAYER NAME: ${player.name || 'a stranger'}
PLAYER APPEARANCE: ${player.appearance || 'unknown'}${bookSection}${librarianNote}${nameKnownNote}

CONVERSATION SO FAR:
${historyText}

PLAYER SAYS: "${playerInput}"

Respond with JSON:
{
  "dialogue": "string (what ${npc.name} says, 1-4 sentences, in character)",
  "askingForName": true or false,
  "actions": []
}

RULES:
- Stay completely in character. Do not break the fourth wall.
- Set "askingForName": true ONLY if ${npc.name} is currently asking what the player's name is.
- Available actions (same types as the command interpreter — use sparingly):
  SPAWN_NPC, REMOVE_NPC, ADD_ITEM_TO_ROOM, REMOVE_ITEM_FROM_ROOM, ADD_EXIT, REMOVE_EXIT
- The NPC may give items, open doors, reveal secrets, or simply talk.
- NPCs may be cryptic, hostile, friendly, bizarre, or poetic.`
}

/**
 * @param {{ name: string, description: string, examineText?: string }} target
 * @param {'item'|'npc'} targetType
 * @param {import('../game/models.js').Cell} currentCell
 * @param {import('../game/models.js').Player} player
 * @returns {string}
 */
export function buildExaminePrompt(target, targetType, currentCell, player) {
  return `The player is examining: "${target.name}"
Type: ${targetType}
Brief description: ${target.description}
Room context: ${currentCell.name || 'Unnamed'} — ${currentCell.description || ''}
Player is holding: ${player.holding?.name || 'nothing'}

Respond with JSON:
{
  "examineText": "string (detailed examination, 2-5 sentences, present tense, second person)",
  "reflectiveItem": false,
  "actions": []
}

RULES:
- Make the examination atmospheric and specific. Reveal aspects such as texture, weight, inscriptions, damage, history, or even other sense descriptions.
- For items: hint at potential uses, hidden compartments, or strangeness.
- For NPCs: describe their reaction to being observed, their posture, eyes, clothing details.
- Available actions (use only if examination has consequences): SPAWN_NPC, ADD_ITEM_TO_ROOM, REMOVE_ITEM_FROM_ROOM
- Do not simply repeat the brief description. Add new information.
- If the thing being examined is a mirror, reflective pool, still water, glass, or any surface that clearly shows a reflection, set "reflectiveItem": true.`
}

/**
 * Builds the prompt for interpreting and polishing a player's appearance description.
 * Used both for first-time setup and for corrections/updates.
 * @param {string} rawDescription - What the player typed
 * @param {string|null} existingAppearance - Current stored appearance (null if first time)
 * @returns {string}
 */
export function buildAppearancePrompt(rawDescription, existingAppearance = null) {
  const context = existingAppearance
    ? `CURRENT APPEARANCE: "${existingAppearance}"\n\nThe player is describing a change or correction.`
    : `This is the player's first time describing their appearance.`

  return `The player is looking at their reflection in a mirror in Word World.
${context}
PLAYER'S INPUT: "${rawDescription}"

Write a polished appearance description for this character — 1-2 sentences, second person, present tense ("You have...", "You wear...", "You appear..."). Capture distinctive features, clothing, and mood. Stay faithful to what the player described. If updating an existing appearance, blend the change with any unchanged details.

Respond with JSON:
{
  "appearance": "string (1-2 sentence appearance description, second person, present tense)"
}`
}
