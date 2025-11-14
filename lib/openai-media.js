import { OpenAiRequestError } from './openai.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_VIDEO_TIMEOUT_MS = 120_000;
const DEFAULT_IMAGE_TIMEOUT_MS = 30_000;

function ensureApiKey(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('OPEN_API_KEY not configured on server. Provide OPEN_API_KEY or OPEN_AI_KEY.');
  }
}

function createTimeoutSignal(timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timeout),
  };
}

function pickDefined(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== '' && !Number.isNaN(value))
  );
}

async function parseJsonResponse(response) {
  const rawBody = await response.text().catch(() => '');

  if (!response.ok) {
    throw new OpenAiRequestError(`OpenAI request failed: ${response.status}`, {
      status: response.status,
      body: rawBody,
    });
  }

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new OpenAiRequestError('OpenAI returned malformed JSON response.', {
      status: response.status,
      body: rawBody,
    });
  }
}

function normaliseHeaders(response) {
  const headers = {};
  if (response?.headers && typeof response.headers.forEach === 'function') {
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  }
  return headers;
}

export async function createVideoJob({
  apiKey,
  prompt,
  model,
  seconds,
  size,
  quality,
  inputReference,
  timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  ensureApiKey(apiKey);
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation must be provided.');
  }

  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const hasFile = Boolean(inputReference && inputReference.buffer && inputReference.buffer.length > 0);
    let body;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
    };

    if (hasFile) {
      const formData = new FormData();
      formData.append('prompt', prompt);
      if (model) formData.append('model', model);
      if (seconds) formData.append('seconds', String(seconds));
      if (size) formData.append('size', size);
      if (quality) formData.append('quality', quality);

      const blob = new Blob([inputReference.buffer], {
        type: inputReference.mimetype || 'application/octet-stream',
      });
      formData.append('input_reference', blob, inputReference.filename || 'input-reference');
      body = formData;
    } else {
      body = JSON.stringify(
        pickDefined({
          prompt,
          model,
          seconds,
          size,
          quality,
        })
      );
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetchImpl(`${OPENAI_BASE_URL}/videos`, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    return await parseJsonResponse(response);
  } finally {
    dispose();
  }
}

export async function remixVideoJob({
  apiKey,
  videoId,
  prompt,
  timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  ensureApiKey(apiKey);
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(`${OPENAI_BASE_URL}/videos/${encodeURIComponent(videoId)}/remix`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
      signal,
    });

    return await parseJsonResponse(response);
  } finally {
    dispose();
  }
}

export async function listVideoJobs({
  apiKey,
  after,
  limit,
  order,
  timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  ensureApiKey(apiKey);
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const url = new URL(`${OPENAI_BASE_URL}/videos`);
    if (after) url.searchParams.set('after', after);
    if (typeof limit === 'number') url.searchParams.set('limit', String(limit));
    if (order) url.searchParams.set('order', order);

    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
    });

    return await parseJsonResponse(response);
  } finally {
    dispose();
  }
}

export async function retrieveVideoJob({ apiKey, videoId, timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS, fetchImpl = globalThis.fetch }) {
  ensureApiKey(apiKey);
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(`${OPENAI_BASE_URL}/videos/${encodeURIComponent(videoId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
    });

    return await parseJsonResponse(response);
  } finally {
    dispose();
  }
}

export async function deleteVideoJob({ apiKey, videoId, timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS, fetchImpl = globalThis.fetch }) {
  ensureApiKey(apiKey);
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(`${OPENAI_BASE_URL}/videos/${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
    });

    return await parseJsonResponse(response);
  } finally {
    dispose();
  }
}

export async function downloadVideoContent({
  apiKey,
  videoId,
  variant,
  timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  ensureApiKey(apiKey);
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const url = new URL(`${OPENAI_BASE_URL}/videos/${encodeURIComponent(videoId)}/content`);
    if (variant) {
      url.searchParams.set('variant', variant);
    }

    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
    });

    const headers = normaliseHeaders(response);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!response.ok) {
      throw new OpenAiRequestError(`OpenAI request failed: ${response.status}`, {
        status: response.status,
        body: buffer.toString('utf8'),
      });
    }

    return {
      status: response.status,
      headers,
      buffer,
    };
  } finally {
    dispose();
  }
}

export async function createImageGeneration({
  apiKey,
  payload,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  ensureApiKey(apiKey);
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(`${OPENAI_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    return await parseJsonResponse(response);
  } finally {
    dispose();
  }
}

function appendFiles(formData, files, field) {
  if (!Array.isArray(files)) {
    return;
  }

  for (const file of files) {
    if (!file || !file.buffer) {
      continue;
    }

    const blob = new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' });
    formData.append(field, blob, file.filename || field);
  }
}

export async function createImageEdit({
  apiKey,
  images,
  mask,
  options = {},
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  ensureApiKey(apiKey);
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const formData = new FormData();
    appendFiles(formData, images, 'image');

    if (mask && mask.buffer) {
      const blob = new Blob([mask.buffer], { type: mask.mimetype || 'image/png' });
      formData.append('mask', blob, mask.filename || 'mask.png');
    }

    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, typeof value === 'number' ? String(value) : value);
      }
    });

    const response = await fetchImpl(`${OPENAI_BASE_URL}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal,
    });

    return await parseJsonResponse(response);
  } finally {
    dispose();
  }
}

export async function createImageVariation({
  apiKey,
  image,
  options = {},
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  ensureApiKey(apiKey);
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const formData = new FormData();
    if (image && image.buffer) {
      const blob = new Blob([image.buffer], { type: image.mimetype || 'image/png' });
      formData.append('image', blob, image.filename || 'variation.png');
    }

    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, typeof value === 'number' ? String(value) : value);
      }
    });

    const response = await fetchImpl(`${OPENAI_BASE_URL}/images/variations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal,
    });

    return await parseJsonResponse(response);
  } finally {
    dispose();
  }
}
