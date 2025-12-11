// lib/openai.js
/**
 * OpenAI integration with support for custom voices/personas
 */

import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2000;

/**
 * Predefined voice personas for content generation
 */
export const VOICE_PERSONAS = {
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'Formal, authoritative, corporate tone',
    systemPrompt: `You are a professional business writer. Write with clarity, precision, and authority. 
Use formal language, maintain a corporate tone, and focus on actionable insights.`,
  },
  casual: {
    id: 'casual',
    name: 'Casual',
    description: 'Friendly, conversational, approachable',
    systemPrompt: `You are a friendly content creator. Write like you're chatting with a friend.
Use conversational language, be relatable, and keep things light and engaging.`,
  },
  technical: {
    id: 'technical',
    name: 'Technical',
    description: 'Expert, precise, specification-focused',
    systemPrompt: `You are a technical writer. Write with precision and depth.
Explain concepts clearly, use proper terminology, and provide implementation details.`,
  },
  creative: {
    id: 'creative',
    name: 'Creative',
    description: 'Imaginative, vivid, storytelling-focused',
    systemPrompt: `You are a creative writer. Write with vivid imagery and compelling narratives.
Use storytelling techniques, create emotional connections, and surprise the reader.`,
  },
  ben_flowers: {
    id: 'ben_flowers',
    name: 'Ben Flowers / Mr.FLEN',
    description: 'High-density clarity, sharp operator, emotionally literate',
    systemPrompt: `You are writing in the voice of Ben Flowers / Mr.FLEN.

Core Voice
Write with high-density clarity: every line must earn its place. No waffle, no corporate filler.
Sound like an intense but grounded operator: sharp, self-aware, direct, emotionally literate, occasionally darkly funny.
Prioritise truth, precision, and usefulness over politeness or fluff.

Tone & Personality
Blend:
- colloquial UK / Essex energy (subtle, not parody)
- technical fluency (legal, product, crypto, systems, creative)
- emotionally honest undercurrent

Confident, no try-hard bravado. If mocking something, punch up, not down.
Use humour as a pressure valve, never to dodge reality.

Structure & Formatting
Default to Markdown with clean sections.
Think in systems: use headings, bullet points, schemas, labelled sections when helpful.
Make outputs immediately actionable: checklists, frameworks, flows, scripts, or concrete options.
Treat each answer like a mini spec or playbook, not a diary entry.

Cadence & Style
Write in spoken-intelligent cadence: it should read like a sharp person thinking out loud.
Use:
- short punchy lines for impact
- longer stacked sentences for complex logic
- deliberate rhythm and internal callbacks

Use emphasis sparingly (**bold**, spacing, repetition) to mark real signal, not decoration.

Cognitive Signature
Embrace fast associative thinking:
- connect ideas across domains (music, law, tech, product, branding) logically
- keep tangents relevant, always looping back to the core objective
- propose multiple angles but converge on clear recommendations

Content Priorities
Name mechanisms: specify tools, levers, risks, exact moves.
Where stakes are high (family, legal, money, reputation), shift into forensic mode: timelines, evidence, quotes-in-context.
Where creative (music, brand, product), lean into: vivid specificity, constraints, clever structural devices.

Do / Don't
DO: be direct, strategic, protective, practical, specific.
DO: undercut pretension with clean, dry humour when suitable.
DO: write like someone who can sell, design, and litigate the same idea.
DON'T: ramble, over-explain basics, or rely on generic clichés.
DON'T: soften clear truths to sound nice.

Goal
Every response should feel like a high-functioning, slightly overloaded strategist-creator.`,
    prohibitedWords: [
      'static', 'hum', 'echoes', 'whisper', 'neon', 'shadows', 'tapestry', 'maze',
      'intertwined', 'stand tall', 'stars', 'align', 'rise and fall', 'waves',
      'reflections', 'crimson', 'awaken', 'cascading', 'glowing', 'awash',
      'flicker', 'endless', 'glimmer', 'fading', 'embers', 'ethereal', 'infinite',
      'journey', 'mystery', 'serenade', 'vibrations', 'hue'
    ],
  },
};

/**
 * Create OpenAI client
 * @returns {OpenAI} Configured OpenAI client
 */
function createClient(apiKey) {
  return new OpenAI({
    apiKey,
  });
}

/**
 * Generate content with fallback and error handling
 * @param {Object} options
 * @param {string} options.apiKey - OpenAI API key
 * @param {string} options.prompt - Main prompt/input
 * @param {string} [options.voiceId] - Voice persona ID (from VOICE_PERSONAS)
 * @param {string} [options.systemPrompt] - Custom system prompt (overrides voiceId)
 * @param {string} [options.model] - Model name (default: gpt-4o)
 * @param {number} [options.temperature] - Temperature (0-2, default: 0.7)
 * @param {number} [options.maxTokens] - Max tokens (default: 2000)
 * @param {string} [options.responseFormat] - Response format ('text' or 'json_object')
 * @returns {Promise<string>} Generated content
 */
export async function generateContentWithFallback({
  apiKey,
  prompt,
  voiceId,
  systemPrompt,
  model = DEFAULT_MODEL,
  temperature = DEFAULT_TEMPERATURE,
  maxTokens = DEFAULT_MAX_TOKENS,
  responseFormat = 'text',
}) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  const client = createClient(apiKey);

  // Determine system prompt: custom > voice persona > default
  let finalSystemPrompt = 'You are a helpful assistant.';

  if (systemPrompt) {
    finalSystemPrompt = systemPrompt;
  } else if (voiceId && VOICE_PERSONAS[voiceId]) {
    finalSystemPrompt = VOICE_PERSONAS[voiceId].systemPrompt;
  }

  const requestPayload = {
    model,
    messages: [
      {
        role: 'system',
        content: finalSystemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  // Add response format if JSON is requested
  if (responseFormat === 'json_object') {
    requestPayload.response_format = { type: 'json_object' };
  }

  try {
    const response = await client.chat.completions.create(requestPayload);

    if (!response.choices || response.choices.length === 0) {
      throw new Error('No content generated by OpenAI');
    }

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('[ERROR] OpenAI API call failed:', error);

    // Fallback to a simpler request if the first one fails
    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
      throw new Error('OpenAI rate limit exceeded. Please try again later.');
    }

    if (error.status === 401 || error.code === 'invalid_request_error') {
      throw new Error('Invalid OpenAI API key or request.');
    }

    throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Generate content with a specific voice/persona
 * @param {Object} options
 * @param {string} options.apiKey - OpenAI API key
 * @param {string} options.prompt - Main prompt/input
 * @param {string} options.voiceId - Voice persona ID (from VOICE_PERSONAS)
 * @param {Object} [options.overrides] - Override persona settings
 * @returns {Promise<string>} Generated content
 */
export async function generateWithVoice({
  apiKey,
  prompt,
  voiceId,
  overrides = {},
}) {
  const persona = VOICE_PERSONAS[voiceId];

  if (!persona) {
    throw new Error(
      `Unknown voice ID: ${voiceId}. Available: ${Object.keys(VOICE_PERSONAS).join(', ')}`
    );
  }

  return generateContentWithFallback({
    apiKey,
    prompt,
    systemPrompt: persona.systemPrompt,
    model: overrides.model,
    temperature: overrides.temperature,
    maxTokens: overrides.maxTokens,
    responseFormat: overrides.responseFormat,
  });
}

/**
 * Get available voice personas
 * @returns {Object} Available personas metadata
 */
export function getAvailableVoices() {
  return Object.values(VOICE_PERSONAS).map(({ id, name, description, prohibitedWords }) => ({
    id,
    name,
    description,
    prohibitedWords: prohibitedWords || [],
  }));
}

/**
 * Validate content against voice's prohibited words
 * @param {string} content - Content to validate
 * @param {string} voiceId - Voice persona ID
 * @returns {Array<string>} Found prohibited words
 */
export function validateContentForVoice(content, voiceId) {
  const persona = VOICE_PERSONAS[voiceId];

  if (!persona || !persona.prohibitedWords) {
    return [];
  }

  const found = [];
  const contentLower = content.toLowerCase();

  for (const word of persona.prohibitedWords) {
    // Match whole words with word boundaries
    const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'gi');
    if (regex.test(contentLower)) {
      found.push(word);
    }
  }

  return found;
}

/**
 * Stream content generation (for real-time responses)
 * @param {Object} options
 * @param {string} options.apiKey - OpenAI API key
 * @param {string} options.prompt - Main prompt/input
 * @param {string} [options.voiceId] - Voice persona ID
 * @param {Function} [options.onChunk] - Callback for each streamed chunk
 * @returns {Promise<string>} Complete generated content
 */
export async function generateContentStream({
  apiKey,
  prompt,
  voiceId,
  onChunk = null,
}) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const client = createClient(apiKey);

  const persona = voiceId ? VOICE_PERSONAS[voiceId] : null;
  const systemPrompt = persona ? persona.systemPrompt : 'You are a helpful assistant.';

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
    stream: true,
  });

  let fullContent = '';

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullContent += content;

    if (onChunk && typeof onChunk === 'function') {
      onChunk(content);
    }
  }

  return fullContent;
}

export default {
  VOICE_PERSONAS,
  generateContentWithFallback,
  generateWithVoice,
  getAvailableVoices,
  validateContentForVoice,
  generateContentStream,
};
