/**
 * All LLM prompt builder functions.
 * Pure functions — no side effects. Take game state slices, return strings.
 */

export const SYSTEM_PROMPT = `You are the game engine for a text-based adventure game called Word World.
The world is a 7x7 grid of cells (columns A-G, rows 1-7). The player starts at D4 (center).
The world is imbued with life by the Elelem, an omnipresent life force. Be creative, surreal, and unpredictable. There is no fixed theme — rooms may be mundane, alien, fantastic, playful, absurd, dreamlike, or anything in between.
Maintain loose internal consistency within a single session, but don't be afraid to be strange.
Content should be written in Intermediate Reader or YA reading level.

CRITICAL RULES:
- Always respond with valid JSON matching the exact schema requested. No extra keys, no missing keys.
- Never break the fourth wall or mention that this is an AI or a language model.
- Never refuse to generate content. If uncertain, invent something strange.
- Descriptions must be vivid but concise (2-4 sentences maximum per description field).
- Item names: lowercase, 1-4 words. NPC names may be proper nouns. The Book of Words is a proper noun.
- Do not wrap your response in markdown code fences. Return raw JSON only.
- The PLAYER_DEATH action resets the player to D4. Use it when the player experiences a clear fatal outcome. Always include a dramatic narrative before triggering it.`

/**
 * @param {import('../game/models.js').Coord} coord
 * @param {string} neighborContext
 * @param {{ npcName: string|null, resolution: string|null }|null} [encounterContext]
 * @param {boolean} [forceMirror]
 * @returns {string}
 */
export function buildRoomPrompt(coord, neighborContext, encounterContext = null, forceMirror = false) {
  const { x, y } = coord
  const blocked = []
  if (y === 0) blocked.push('"north"')
  if (y === 6) blocked.push('"south"')
  if (x === 0) blocked.push('"west"')
  if (x === 6) blocked.push('"east"')

  const col = String.fromCharCode(65 + x)
  const row = y + 1

  return `Generate content for grid cell ${col}${row} (x=${x}, y=${y}).

NEIGHBORING CELLS (for loose thematic continuity — you don't have to match them):
${neighborContext}

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
  "npcs": [
    {
      "id": "string (snake_case, unique)",
      "name": "string",
      "description": "string (one sentence)"
    }
  ],
  "exits": ["north", "south", "east", "west"],
  "blockedExits": [
    { "direction": "north"|"south"|"east"|"west", "obstacle": "string (one sentence describing what physically blocks this exit, as seen from the room)" }
  ],
  "hasMirror": true or false
}

CONSTRAINTS:
- exits array: only include directions the player can walk through freely.${blocked.length ? `\n  Do NOT include: ${blocked.join(', ')}.` : ''}
- blockedExits: list directions that have a visible physical obstruction (locked door, rubble, sealed arch, etc.) that COULD potentially be cleared by player action. The description or narrative MUST mention every entry in blockedExits. Do NOT add a blockedExit for a direction that simply has no opening — only add it when a specific feature is blocking an otherwise plausible passage.
- Directions absent from both exits and blockedExits are assumed to have no opening at all (solid wall, room corner, etc.) and need not be mentioned.
- items: 0-4 items. Most rooms have 0-2 items. Empty rooms are fine and often more atmospheric.
- npcs: 0-2 NPCs. About 1 in 4 rooms should have an NPC. When one is present, describe them as curious or clearly open to conversation — the player should feel invited to approach them.
- hasMirror: ${forceMirror ? 'MUST be true for this room. The room contains a mirror — mention it explicitly in the description or narrative.' : 'set to true in approximately 1 out of 15 rooms.'}
- At least 2 exits in most rooms (the world should feel explorable).${encounterContext ? `

ENCOUNTER HISTORY: This location was the site of a special story encounter. Let this subtly flavor the room's atmosphere.
  NPC who appeared here: ${encounterContext.npcName || 'unknown'}
  What transpired: ${encounterContext.resolution || 'unknown'}
The NPC may still be present (as a regular NPC) or the room may bear traces of what happened.` : ''}`
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
    ? currentCell.items.map(i => `${i.name}: ${i.description}`).join('; ')
    : 'none'
  const roomNpcs = currentCell.npcs.length
    ? currentCell.npcs.map(n => n.name).join(', ')
    : 'none'
  const inventory = player.inventory.length
    ? player.inventory.map(i => i.name).join(', ')
    : 'nothing'
  const wearing = player.wearing.length
    ? player.wearing.map(i => i.name).join(', ')
    : 'nothing'
  const holding = player.holding ? player.holding.name : 'nothing'

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
{ "type": "DAMAGE_ITEM", "itemId": "string", "description": "string (new description)" }
{ "type": "TRANSFORM_ITEM", "itemId": "string", "newItem": { id, name, description, takeable, wearable } }
{ "type": "SPAWN_NPC", "npc": { id, name, description } }
{ "type": "REMOVE_NPC", "npcId": "string" }
{ "type": "ADD_EXIT", "direction": "north"|"south"|"east"|"west" }
{ "type": "REMOVE_EXIT", "direction": "north"|"south"|"east"|"west" }
{ "type": "PLAYER_DEATH" }

If the command cannot be meaningfully interpreted or is impossible in context, set "understood": false
and provide a narrative explaining in-world why nothing happened. Never say "I don't understand".`
}

/**
 * Builds the combined start-room + chapter-1 prompt (used only for D4 first generation).
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

ADDITIONAL REQUIREMENT — CHAPTER ONE TITLE:
Also provide a chapter title for Chapter One of the Book of Words.
Story circle theme: "A character is in a zone of comfort or familiarity."
The title should be 4–8 words, evocative, and subtly reflect the starting room's character — without spoiling its contents.

Wrap your entire response in this JSON shape instead of the plain room shape:
{
  "room": { ...the standard room JSON object... },
  "chapter1Title": "string (4–8 word chapter title)"
}`
}

/**
 * Builds the encounter setup prompt (stage 1 — NPC challenge).
 * @param {import('../game/models.js').Coord} coord
 * @param {string} storyTheme
 * @param {import('../game/models.js').Player} player
 * @returns {string}
 */
export function buildEncounterPrompt(coord, storyTheme, player) {
  const { x, y } = coord
  const col = String.fromCharCode(65 + x)
  const row = y + 1
  const inventory = player.inventory.map(i => i.name).join(', ') || 'nothing'

  return `Generate a special encounter at grid location ${col}${row} in Word World.

STORY CIRCLE THEME: "${storyTheme}"

PLAYER:
  Name: ${player.name || 'unknown'}
  Appearance: ${player.appearance || 'unknown'}
  Inventory: ${inventory}

This is a pivotal moment aligned with the theme above. The player meets an NPC who presents a situation or challenge that resonates with that theme. The encounter should:
- Be vivid and atmospheric, fitting the Word World aesthetic
- Feature a named NPC with a distinct voice and presence
- Present a clear situation or dilemma the player must respond to
- End with the NPC waiting for the player's response

Do NOT resolve the encounter — leave it open for the player to act.

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
 * @returns {string}
 */
export function buildEncounterJudgmentPrompt(playerResponse, encounterContext, storyTheme, chapterNumber) {
  return `You are judging the outcome of a special encounter in Word World.

ENCOUNTER:
${encounterContext.narrative}

SITUATION: ${encounterContext.situationSummary}
STORY THEME: "${storyTheme}"
NPC: ${encounterContext.npcName}

PLAYER'S RESPONSE: "${playerResponse}"

Determine whether the player's response reflects the spirit of the Elelem and is meaningful for the theme "${storyTheme}".
A response succeeds if it shows genuine engagement, creativity, honesty, or wisdom — not necessarily the "right" answer.
A response fails if it is dismissive, nonsensical in context, or works against the spirit of the theme.

If successful, also provide a chapter title for Chapter ${chapterNumber} of the Book of Words (4–8 words, evocative, reflecting what transpired).

Respond with JSON:
{
  "success": true or false,
  "resolution": "string (narrative resolution of the encounter, 2–4 sentences, second person, present tense — works for both pass and fail)",
  "chapterTitle": "string (only if success — 4–8 word chapter title for Book of Words)",
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

  return `The player used the NOTICE command: "notice ${noticedThing}"

The NOTICE mechanic allows the player to bring things into reality through focused attention.
Whatever they notice becomes real — it was always there, just unobserved.

CURRENT STATE:
Room: ${currentCell.name || 'Unnamed'} — ${currentCell.description || '(no description)'}
Items already in room: ${roomItems}
Player inventory: ${player.inventory.map(i => i.name).join(', ') || 'nothing'}

Interpret what the player noticed and respond with JSON:
{
  "narrative": "string (1-3 sentences describing the noticed thing coming into focus, present tense, second person)",
  "actions": []
}

AVAILABLE ACTIONS:
{ "type": "ADD_ITEM_TO_ROOM", "itemId": "string", "item": { id, name, description, takeable, wearable } }
{ "type": "SPAWN_NPC", "npc": { id, name, description } }
{ "type": "ADD_EXIT", "direction": "north"|"south"|"east"|"west" }
{ "type": "UPDATE_ROOM_DESCRIPTION", "description": "string" }

RULES:
- The noticed thing should feel like it was always subtly present — not conjured, but revealed.
- Be creative. "notice a key" → a tarnished key catches the light. "notice a door" → a hairline crack resolves into a door frame.
- Items created by NOTICE should have plausible IDs (snake_case).
- If the noticed thing already exists (matches an existing item or NPC), describe it in more detail instead of creating a duplicate.
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

  return `You are playing the role of "${npc.name}" in a text-based adventure game.

NPC DESCRIPTION: ${npc.description}
CURRENT ROOM: ${currentCell.name || 'Unnamed'} — ${currentCell.description || ''}
PLAYER NAME: ${player.name || 'a stranger'}
PLAYER APPEARANCE: ${player.appearance || 'unknown'}

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
  "actions": []
}

RULES:
- Make the examination atmospheric and specific. Reveal texture, smell, weight, inscriptions, damage, or history.
- For items: hint at potential uses, hidden compartments, or strangeness.
- For NPCs: describe their reaction to being observed, their posture, eyes, clothing details.
- Available actions (use only if examination has consequences): SPAWN_NPC, ADD_ITEM_TO_ROOM, REMOVE_ITEM_FROM_ROOM
- Do not simply repeat the brief description. Add new information.`
}
