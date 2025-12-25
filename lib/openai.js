// lib/openai.js
/**
 * OpenAI integration with support for custom voices/personas
 */
import OpenAI from 'openai';

import { fetchWithRetry, readJsonResponse } from './http-client.js';

export class OpenAiRequestError extends Error {
  constructor(message, { status = null, body = null } = {}) {
    super(message);
    this.name = 'OpenAiRequestError';
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2000;
const OPENAI_API_BASE = 'https://api.openai.com/v1';

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
 * @param {Function} [options.fetch] - Fetch implementation override
 * @param {Object} [options.logger] - Logger for warnings
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
  fetch: fetchOverride,
  logger = console,
}) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  const fetchImpl =
    typeof fetchOverride === 'function'
      ? fetchOverride
      : typeof globalThis.fetch === 'function'
        ? globalThis.fetch.bind(globalThis)
        : null;

  if (!fetchImpl) {
    throw new Error('A fetch implementation is required to call the OpenAI API.');
  }

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

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const parseErrorMessage = (payload) => {
    if (payload && typeof payload.error?.message === 'string') {
      return payload.error.message;
    }
    return null;
  };

  const extractContentFromSegments = (segments) => {
    if (!Array.isArray(segments)) {
      return null;
    }

    const jsonSegment = segments.find((segment) => segment?.type === 'output_json' && segment.json);
    if (jsonSegment) {
      return JSON.stringify(jsonSegment.json);
    }

    const textSegment = segments.find(
      (segment) => segment?.type === 'output_text' && typeof segment.text === 'string'
    );
    if (textSegment) {
      return textSegment.text;
    }

    const anyText = segments.find((segment) => typeof segment?.text === 'string');
    if (anyText) {
      return anyText.text;
    }

    return null;
  };

  const extractChatContent = (payload) => {
    const message = payload?.choices?.[0]?.message;
    if (!message) {
      return null;
    }

    if (typeof message.content === 'string') {
      return message.content;
    }

    return extractContentFromSegments(message.content);
  };

  const extractResponsesContent = (payload) => {
    if (typeof payload?.output_text === 'string') {
      return payload.output_text;
    }

    if (Array.isArray(payload?.output)) {
      for (const output of payload.output) {
        const content = extractContentFromSegments(output?.content);
        if (content) {
          return content;
        }
      }
    }

    return null;
  };

  const shouldFallbackToResponses = (status, message) => {
    if (status === 405) {
      return true;
    }
    if (status === 400 && typeof message === 'string') {
      return /responses api/i.test(message);
    }
    return false;
  };

  try {
    const response = await fetchWithRetry(
      `${OPENAI_API_BASE}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
      },
      {
        timeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? '8000'),
        retries: Number(process.env.HTTP_MAX_RETRIES ?? '3'),
        fetch: fetchImpl,
      }
    );
    const payload = await readJsonResponse(response);

    if (response.ok) {
      const content = extractChatContent(payload);
      if (!content) {
        throw new Error('No content generated by OpenAI');
      }
      return content;
    }

    const errorMessage = parseErrorMessage(payload) || `Request failed with status ${response.status}`;

    if (shouldFallbackToResponses(response.status, errorMessage)) {
      logger?.warn?.('Chat completions unavailable; falling back to Responses API.');
      const responsePayload = {
        model,
        input: [
          { role: 'system', content: finalSystemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_output_tokens: maxTokens,
      };

      if (responseFormat === 'json_object') {
        responsePayload.response_format = { type: 'json_object' };
      }

      const fallbackResponse = await fetchWithRetry(
        `${OPENAI_API_BASE}/responses`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(responsePayload),
        },
        {
          timeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? '8000'),
          retries: Number(process.env.HTTP_MAX_RETRIES ?? '3'),
          fetch: fetchImpl,
        }
      );

      const fallbackPayload = await readJsonResponse(fallbackResponse);
      if (!fallbackResponse.ok) {
        const fallbackMessage =
          parseErrorMessage(fallbackPayload) ||
          `Request failed with status ${fallbackResponse.status}`;
        throw new Error(`Responses call failed: ${fallbackMessage}`);
      }

      const content = extractResponsesContent(fallbackPayload);
      if (!content) {
        throw new Error('Responses call failed: No content generated by OpenAI.');
      }

      return content.trim();
    }

    throw new OpenAiRequestError(errorMessage, { status: response.status, body: payload });
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
  fetch: fetchOverride,
  model = DEFAULT_MODEL,
  temperature = DEFAULT_TEMPERATURE,
  maxTokens = DEFAULT_MAX_TOKENS,
  logger = console,
}) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const client = new OpenAI({ apiKey });
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  const fetchImpl =
    typeof fetchOverride === 'function'
      ? fetchOverride
      : typeof globalThis.fetch === 'function'
        ? globalThis.fetch.bind(globalThis)
        : null;

  if (!fetchImpl) {
    throw new Error('A fetch implementation is required to call the OpenAI API.');
  }

  const persona = voiceId ? VOICE_PERSONAS[voiceId] : null;
  const systemPrompt = persona ? persona.systemPrompt : 'You are a helpful assistant.';

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const parseErrorMessage = (payload) => {
    if (payload && typeof payload.error?.message === 'string') {
      return payload.error.message;
    }
    return null;
  };

  const shouldFallbackToResponses = (status, message) => {
    if (status === 405) {
      return true;
    }
    if (status === 400 && typeof message === 'string') {
      return /responses api/i.test(message);
    }
    return false;
  };

  const readStream = async (response, getChunkContent) => {
    if (!response.body) {
      throw new Error('Streaming response body is unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) {
          continue;
        }

        const payload = trimmed.replace(/^data:\s*/, '');
        if (payload === '[DONE]') {
          return fullContent;
        }

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch (error) {
          logger?.warn?.('Unable to parse streaming payload chunk.', error);
          continue;
        }

        const content = getChunkContent(parsed);
        if (content) {
          fullContent += content;
          if (onChunk && typeof onChunk === 'function') {
            onChunk(content);
          }
        }
      }
    }

    return fullContent;
  };

  const requestPayload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  const chatChunkContent = (payload) => payload?.choices?.[0]?.delta?.content || '';
  const responsesChunkContent = (payload) => {
    if (payload?.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
      return payload.delta;
    }
    if (payload?.type === 'response.output_text.done' && typeof payload.text === 'string') {
      return payload.text;
    }
    return '';
  };

  try {
    const response = await fetchImpl(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
    });

    if (response.ok) {
      return await readStream(response, chatChunkContent);
    }

    const payload = await response.json().catch(() => null);
    const errorMessage = parseErrorMessage(payload) || `Request failed with status ${response.status}`;

    if (shouldFallbackToResponses(response.status, errorMessage)) {
      logger?.warn?.('Chat completions unavailable; falling back to Responses API.');
      const responsePayload = {
        model,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_output_tokens: maxTokens,
        stream: true,
      };

      const fallbackResponse = await fetchImpl(`${OPENAI_API_BASE}/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify(responsePayload),
      });

      if (!fallbackResponse.ok) {
        const fallbackPayload = await fallbackResponse.json().catch(() => null);
        const fallbackMessage =
          parseErrorMessage(fallbackPayload) ||
          `Request failed with status ${fallbackResponse.status}`;
        throw new Error(`Responses call failed: ${fallbackMessage}`);
      }

      return await readStream(fallbackResponse, responsesChunkContent);
    }

    throw new OpenAiRequestError(errorMessage, { status: response.status, body: payload });
  } catch (error) {
    console.error('[ERROR] OpenAI API call failed:', error);

    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
      throw new Error('OpenAI rate limit exceeded. Please try again later.');
    }

    if (error.status === 401 || error.code === 'invalid_request_error') {
      throw new Error('Invalid OpenAI API key or request.');
    }

    throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
  }
}

export default {
  VOICE_PERSONAS,
  generateContentWithFallback,
  generateWithVoice,
  getAvailableVoices,
  validateContentForVoice,
  generateContentStream,
};
