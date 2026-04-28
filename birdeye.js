const axios = require('axios');

const BASE_URL = 'https://public-api.birdeye.so';
const CHAIN = 'solana';

// Startup Validation
function validateConfig() {
  if (!process.env.BIRDEYE_API_KEY || process.env.BIRDEYE_API_KEY === 'your_birdeye_api_key_here') {
    throw new Error('BIRDEYE_API_KEY is missing or not set in your .env file');
  }
  console.log('[Birdeye] API key loaded:', process.env.BIRDEYE_API_KEY.slice(0, 6) + '...');
}

validateConfig();

// Request Queue
// CRITICAL FIX: Each task gets an isolated promise slot. If one task fails,
// it does NOT poison the queue for subsequent tasks. This was the root cause
// of the 401 errors -- a failed request broke the chain, and subsequent calls
// never executed (axios was never called, so no API key was sent).

const QUEUE_INTERVAL_MS = 400;
let lastRequestTime = 0;
let requestQueue = Promise.resolve();

function enqueue(fn) {
  const tail = requestQueue;

  const slot = tail.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, lastRequestTime + QUEUE_INTERVAL_MS - now);
    if (wait > 0) await sleep(wait);
    lastRequestTime = Date.now();
    return fn();
  });

  // Keep queue alive even if this slot fails
  requestQueue = slot.catch(() => {});

  return slot;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Retry with Exponential Backoff
async function fetchWithRetry(config, retries = 3, baseDelay = 1200) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios(config);
      return res;
    } catch (err) {
      const status = err?.response?.status;
      const isRateLimit = status === 429;
      const isServerError = status >= 500;

      if ((isRateLimit || isServerError) && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`[Birdeye] ${status} on attempt ${attempt + 1}. Retrying in ${delay}ms...`);
        await sleep(delay);
        if (isRateLimit) lastRequestTime = Date.now() + delay;
        continue;
      }

      if (status === 429) throw new Error('Rate limit hit -- please wait a few seconds and try again.');
      if (status === 401) throw new Error('Invalid API key -- check your BIRDEYE_API_KEY in .env');
      if (status === 404) throw new Error('Token not found on Birdeye.');
      throw err;
    }
  }
}

function getHeaders() {
  return {
    'X-API-KEY': process.env.BIRDEYE_API_KEY,
    'x-chain': CHAIN,
    'accept': 'application/json',
  };
}

function get(path, params = {}) {
  return enqueue(() =>
    fetchWithRetry({
      method: 'GET',
      url: `${BASE_URL}${path}`,
      headers: getHeaders(),
      params,
      timeout: 12000,
    })
  );
}

async function getTokenOverview(address) {
  const res = await get('/defi/token_overview', { address });
  if (!res.data?.success || !res.data?.data) {
    throw new Error('Token not found or no data returned');
  }
  return res.data.data;
}

async function getTokenSecurity(address) {
  try {
    const res = await get('/defi/token_security', { address });
    return res.data?.data || null;
  } catch (err) {
    console.warn('[Birdeye] Security fetch skipped:', err.message);
    return null;
  }
}

async function getOHLCV(address) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 3600 * 2;
    const res = await get('/defi/ohlcv', {
      address,
      type: '15m',
      time_from: from,
      time_to: now,
    });
    return res.data?.data?.items || [];
  } catch (err) {
    console.warn('[Birdeye] OHLCV fetch skipped:', err.message);
    return [];
  }
}

async function getTrending() {
  const res = await get('/defi/token_trending', {
    sort_by: 'rank',
    sort_type: 'asc',
    offset: 0,
    limit: 10,
  });
  if (!res.data?.success) throw new Error('Failed to fetch trending tokens');
  return res.data?.data?.tokens || res.data?.data || [];
}

// Sequential fetch -- NOT parallel (Promise.all = instant 429)
async function getTokenData(address) {
  const overview = await getTokenOverview(address);
  const security = await getTokenSecurity(address);
  const ohlcv = await getOHLCV(address);
  return { overview, security, ohlcv };
}

module.exports = { getTokenData, getTrending };
