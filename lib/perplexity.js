// lib/perplexity.js
/**
 * Perplexity AI integration for deep research capabilities
 * Handles API calls to Perplexity's research endpoints
 */

import { fetchWithRetry, readJsonResponse } from './http-client.js';

const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';
const PERPLEXITY_MODEL = 'sonar-pro'; // High-accuracy research model

/**
 * Call Perplexity API for deep research
 * @param {Object} options
 * @param {string} options.apiKey - Perplexity API key
 * @param {string} options.query - Research query/prompt
 * @param {number} [options.temperature] - Creativity (0-2), default 0.3 for research
 * @param {number} [options.maxTokens] - Max response length, default 2000
 * @param {Array<string>} [options.searchDomains] - Optional domain restrictions
 * @returns {Promise<string>} Research response text
 */
export async function performDeepResearch({
  apiKey,
  query,
  temperature = 0.3,
  maxTokens = 2000,
  searchDomains = [],
}) {
  if (!apiKey) {
    throw new Error('Perplexity API key is required.');
  }

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Research query is required.');
  }

  const payload = {
    model: PERPLEXITY_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are an expert research assistant. Provide comprehensive, well-sourced answers with citations.',
      },
      {
        role: 'user',
        content: query.trim(),
      },
    ],
    temperature,
    max_tokens: maxTokens,
    top_p: 0.9,
    return_citations: true,
  };

  // Add search domain restrictions if provided
  if (Array.isArray(searchDomains) && searchDomains.length > 0) {
    payload.search_domain_filter = searchDomains;
  }

  try {
    const response = await fetchWithRetry(
      `${PERPLEXITY_API_BASE}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      {
        timeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? '8000'),
        retries: Number(process.env.HTTP_MAX_RETRIES ?? '3'),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(
        `Perplexity API error (${response.status}): ${errorBody.slice(0, 200)}`
      );
      error.status = response.status;
      error.body = errorBody;
      throw error;
    }

    const data = await readJsonResponse(response);

    // Extract content from response
    if (data?.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }

    throw new Error('Unexpected Perplexity API response structure.');
  } catch (error) {
    if (error.status) {
      throw error; // Re-throw API errors as-is
    }
    throw new Error(`Perplexity API request failed: ${error.message}`);
  }
}

/**
 * Build a research prompt for content creator use cases
 * @param {string} topic - Topic to research
 * @param {string} [purpose] - Purpose (e.g., "content strategy", "audience insights")
 * @param {string} [platform] - Target platform (e.g., "TikTok", "LinkedIn")
 * @returns {string} Formatted research prompt
 */
export function buildResearchPrompt(topic, purpose = 'general research', platform = null) {
  const platformText = platform ? `for ${platform}` : '';
  return `Conduct deep research on: ${topic}
  
Purpose: ${purpose}
${platformText ? `Platform context: ${platformText}` : ''}

Provide:
1. Key findings with sources
2. Latest trends and insights
3. Expert perspectives
4. Data and statistics (with citations)
5. Actionable recommendations

Format with clear sections and cite all sources.`;
}

/**
 * Analyze content competitively using Perplexity research
 * @param {Object} options
 * @param {string} options.apiKey - Perplexity API key
 * @param {string} options.contentTopic - Topic of the content
 * @param {string} [options.competitor] - Specific competitor to research
 * @param {string} [options.platform] - Platform context
 * @returns {Promise<string>} Competitive analysis
 */
export async function analyzeCompetitiveContent({ apiKey, contentTopic, competitor, platform }) {
  const competitorText = competitor ? `especially by ${competitor}` : 'in this space';
  const platformText = platform ? ` on ${platform}` : '';
  const prompt = `Research how content creators are currently approaching: "${contentTopic}" ${competitorText}${platformText}.
  
Include:
- Top-performing content formats and hooks
- Engagement patterns and audience response
- Messaging strategies
- Emerging trends
- Content gaps and opportunities

Provide citations for all data and examples.`;

  return performDeepResearch({
    apiKey,
    query: prompt,
    temperature: 0.4,
    maxTokens: 2500,
  });
}

/**
 * Research audience insights using Perplexity
 * @param {Object} options
 * @param {string} options.apiKey - Perplexity API key
 * @param {string} options.audience - Description of target audience
 * @param {string} [options.platform] - Platform context
 * @param {string} [options.niche] - Content niche
 * @returns {Promise<string>} Audience insights
 */
export async function getAudienceInsights({ apiKey, audience, platform, niche }) {
  const platformText = platform ? ` on ${platform}` : '';
  const nicheText = niche ? ` in the ${niche} space` : '';
  const prompt = `Research the ${audience} audience${platformText}${nicheText}.

Provide insights on:
- Demographics and psychographics
- Content preferences and consumption habits
- Pain points and motivations
- Language and communication style
- Trending topics and interests
- Engagement patterns

Include current data and expert perspectives with citations.`;

  return performDeepResearch({
    apiKey,
    query: prompt,
    temperature: 0.35,
    maxTokens: 2500,
  });
}

export default {
  performDeepResearch,
  buildResearchPrompt,
  analyzeCompetitiveContent,
  getAudienceInsights,
};
