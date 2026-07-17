/**
 * Gemini API Integration
 * Uses Google Generative AI SDK to power the conversational assistant.
 * Provides contextual, dynamic stadium navigation guidance.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_PROMPT = `You are the FIFA World Cup 2026 Stadium Assistant, an AI-powered guide helping fans navigate stadiums during the tournament. You provide real-time, actionable guidance based on current stadium conditions.

CORE RESPONSIBILITIES:
1. Help fans find gates, seats, restrooms, food/beverage stands, and exits
2. Recommend routes that avoid high-crowd areas and bottlenecks
3. Provide wait time estimates and suggest optimal timing for breaks
4. Alert fans to gate closures, overcrowding, or schedule changes
5. Give clear, concise directions that work in a noisy stadium environment

BEHAVIOR RULES:
- Always factor in the CURRENT STADIUM DATA provided in each message
- Prefer routes through LOW crowd density areas over shorter but congested paths
- If a gate is CLOSED, never direct fans there — suggest the nearest open alternative
- When crowd density is CRITICAL at any location, proactively warn the fan
- Keep responses concise (2-4 sentences max) — fans are reading on phones in a crowd
- Use landmark references (gate names, section numbers, level names) fans can see on signage
- If accessibility is mentioned, only suggest accessible routes (elevators, ramps)
- If you detect an anomaly (overcrowding, all restrooms busy), flag it with ⚠️
- Respond in the same language the fan uses (default English)
- Be friendly and enthusiastic — this is the World Cup! Use ⚽ sparingly

RESPONSE FORMAT:
- Lead with the direct answer/recommendation
- Include specific numbers (walk time, wait time, crowd level)
- End with a brief alternative option if relevant
- For navigation: use "Head to [Location] via [Route]" format`;

// --- Fallback Matching Keywords ---
const FALLBACK_KEYWORDS = {
  restrooms: ['restroom', 'bathroom', 'toilet', 'washroom'],
  food: ['food', 'eat', 'hungry', 'drink', 'beer', 'concession'],
  exits: ['exit', 'leave', 'way out', 'go out'],
  gates: ['gate', 'entrance', 'enter'],
  navigation: ['section', 'seat', 'navigate', 'how do i get', 'where'],
  crowds: ['crowd', 'busy', 'packed', 'wait'],
};

let genAI = null;
let model = null;

/**
 * Initializes the Gemini API client.
 * @param {string} apiKey - The Google Gemini API key.
 * @returns {boolean} True if successfully initialized, false otherwise.
 */
function initGemini(apiKey) {
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set — assistant will use fallback responses');
    return false;
  }
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
  });
  return true;
}

/**
 * Constructs the contextual prompt string for Gemini API.
 * @param {string} userMessage - The fan's question.
 * @param {string} stadiumContext - The current stadium condition context.
 * @param {string} alertsSummary - The summary of active alerts.
 * @returns {string} The formatted context prompt string.
 */
function buildContextPrompt(userMessage, stadiumContext, alertsSummary) {
  return `CURRENT STADIUM DATA:
${stadiumContext}

ACTIVE ALERTS:
${alertsSummary}

FAN'S QUESTION: ${userMessage}`;
}

/**
 * Generates a response using Gemini model, falling back to heuristics if it fails or is unconfigured.
 * @param {string} userMessage - The user's query.
 * @param {string} stadiumContext - Context containing current stadium conditions.
 * @param {string} alertsSummary - Summary of active alerts.
 * @returns {Promise<string>} The generated response.
 */
async function generateResponse(userMessage, stadiumContext, alertsSummary) {
  // If Gemini is not configured, use intelligent fallback
  if (!model) {
    return generateFallbackResponse(userMessage, stadiumContext);
  }

  const contextPrompt = buildContextPrompt(userMessage, stadiumContext, alertsSummary);

  try {
    const chat = model.startChat({
      history: [],
    });

    const result = await chat.sendMessage(contextPrompt);
    const response = result.response.text();
    return response;
  } catch (error) {
    console.error('Gemini API error:', error.message);
    return generateFallbackResponse(userMessage, stadiumContext);
  }
}

/**
 * Intelligent fallback when Gemini API is unavailable, using keyword matching and context parsing.
 * @param {string} userMessage - The user's query.
 * @param {string} stadiumContext - Context containing current stadium conditions.
 * @returns {string} The fallback response.
 */
function generateFallbackResponse(userMessage, stadiumContext) {
  const msg = userMessage.toLowerCase();

  // Parse context for data-driven fallback
  const lines = stadiumContext.split('\n');
  const restroomLines = [];
  const foodLines = [];
  const exitLines = [];
  const gateLines = [];
  let capturing = null;

  lines.forEach((line) => {
    if (line.includes('NEAREST RESTROOMS:')) capturing = 'restrooms';
    else if (line.includes('NEAREST FOOD')) capturing = 'food';
    else if (line.includes('NEAREST EXITS:')) capturing = 'exits';
    else if (line.includes('GATE STATUS:')) capturing = 'gates';
    else if (line.startsWith('  ') && capturing === 'restrooms') restroomLines.push(line.trim());
    else if (line.startsWith('  ') && capturing === 'food') foodLines.push(line.trim());
    else if (line.startsWith('  ') && capturing === 'exits') exitLines.push(line.trim());
    else if (line.startsWith('  ') && capturing === 'gates') gateLines.push(line.trim());
    else if (!line.startsWith('  ')) capturing = null;
  });

  if (FALLBACK_KEYWORDS.restrooms.some((kw) => msg.includes(kw))) {
    const best = restroomLines[0] || 'the nearest restroom';
    return `⚽ ${best}\n\nThis has the best combination of short wait and walking distance from your section. Check the crowd dashboard for real-time updates!`;
  }

  if (FALLBACK_KEYWORDS.food.some((kw) => msg.includes(kw))) {
    const best = foodLines[0] || 'the nearest concession stand';
    return `⚽ ${best}\n\nThis stand currently has the shortest queue near you. Pro tip: halftime rushes start 2 minutes before the whistle!`;
  }

  if (FALLBACK_KEYWORDS.exits.some((kw) => msg.includes(kw))) {
    const best = exitLines[0] || 'the nearest exit';
    return `⚽ ${best}\n\nThis exit has the lowest crowd density right now. If the match just ended, consider waiting 5-10 minutes to avoid the rush.`;
  }

  if (FALLBACK_KEYWORDS.gates.some((kw) => msg.includes(kw))) {
    const openGates = gateLines.filter((g) => g.includes('OPEN'));
    const leastCrowded = openGates.sort((a, b) => {
      const densityA = parseInt(a.match(/(\d+)%/)?.[1] || '100');
      const densityB = parseInt(b.match(/(\d+)%/)?.[1] || '100');
      return densityA - densityB;
    });
    const best = leastCrowded[0] || 'the main entrance';
    return `⚽ Recommended gate: ${best}\n\nThis gate currently has the lowest crowd density. Avoid gates with HIGH or CRITICAL crowd levels.`;
  }

  if (FALLBACK_KEYWORDS.navigation.some((kw) => msg.includes(kw))) {
    return `⚽ Based on current crowd conditions, I recommend using the concourse route through the lower-crowd zones. Check the gate status panel for real-time crowd levels. For specific section directions, mention your target section number!`;
  }

  if (FALLBACK_KEYWORDS.crowds.some((kw) => msg.includes(kw))) {
    return `⚽ Current crowd conditions are shown in the dashboard. I recommend avoiding areas marked HIGH or CRITICAL. The least congested zones are typically the upper levels and sections farthest from the main entrance.`;
  }

  return `⚽ I'm your FIFA World Cup 2026 Stadium Assistant! I can help you with:\n\n• Finding restrooms, food stands, or exits with the shortest wait\n• Navigating between gates and sections\n• Checking crowd density and avoiding bottlenecks\n• Getting real-time gate status updates\n\nJust ask me anything like "Where's the nearest restroom?" or "How do I get to Section 114?"`;
}

module.exports = {
  initGemini,
  generateResponse,
  generateFallbackResponse,
  SYSTEM_PROMPT,
};
