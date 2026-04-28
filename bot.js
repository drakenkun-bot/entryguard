require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const NodeCache = require('node-cache');
const birdeye = require('./birdeye');
const { analyzeEntry } = require('./analyzer');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const cache = new NodeCache({ stdTTL: 60 }); // 1 min cache

console.log('🛡️ Entry Guard bot started...');

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `🛡️ *Entry Guard* — Timing is everything.\n\n` +
    `I tell you if you're *early*, *risky*, or *late* on any Solana token — in seconds.\n\n` +
    `*Commands:*\n` +
    `🔍 /check \`<token_address>\` — Analyze a specific token\n` +
    `📈 /trending — Check top trending tokens right now\n` +
    `❓ /help — How this works\n\n` +
    `_Powered by Birdeye onchain data_`,
    { parse_mode: 'Markdown' }
  );
});

// /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `🛡️ *How Entry Guard Works*\n\n` +
    `I analyze 4 onchain signals for any token:\n\n` +
    `• *Price Momentum* — Is price accelerating or fading?\n` +
    `• *Volume Spike* — Is real money flowing in NOW?\n` +
    `• *Liquidity Health* — Can you actually exit?\n` +
    `• *Trade Activity* — Are buys outpacing sells?\n\n` +
    `*Verdict meanings:*\n` +
    `✅ *EARLY* — Momentum just starting, smart entry zone\n` +
    `⚠️ *RISKY* — Already moving, high volatility window\n` +
    `❌ *LATE* — Likely chasing, you may be exit liquidity\n\n` +
    `*Usage:*\n` +
    `/check \`<token_mint_address>\`\n` +
    `/trending — scan top tokens automatically`,
    { parse_mode: 'Markdown' }
  );
});

// /check command
bot.onText(/\/check(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const address = match[1]?.trim();

  if (!address) {
    return bot.sendMessage(chatId,
      `❗ Please provide a token address.\n\nExample:\n/check \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\``,
      { parse_mode: 'Markdown' }
    );
  }

  // Basic Solana address validation
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return bot.sendMessage(chatId, `❗ That doesn't look like a valid Solana token address. Please double-check it.`);
  }

  const thinking = await bot.sendMessage(chatId, `🔍 Scanning onchain data for \`${address.slice(0,8)}...\``, { parse_mode: 'Markdown' });

  try {
    // Check cache first
    const cached = cache.get(address);
    if (cached) {
      await bot.deleteMessage(chatId, thinking.message_id);
      return bot.sendMessage(chatId, cached, { parse_mode: 'Markdown' });
    }

    const data = await birdeye.getTokenData(address);
    const verdict = analyzeEntry(data);
    const message = formatVerdict(data.overview, verdict);

    cache.set(address, message);
    await bot.deleteMessage(chatId, thinking.message_id);
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (err) {
    await bot.deleteMessage(chatId, thinking.message_id);
    const errMsg = err.message.includes('not found') 
      ? `❗ Token not found on Birdeye. Make sure it's a valid Solana token.`
      : `⚠️ Error fetching data. Try again in a moment.\n\n_${err.message}_`;
    bot.sendMessage(chatId, errMsg, { parse_mode: 'Markdown' });
    console.error('Check error:', err.message);
  }
});

// /trending command
bot.onText(/\/trending/, async (msg) => {
  const chatId = msg.chat.id;
  const thinking = await bot.sendMessage(chatId, `📡 Scanning trending tokens...`);

  try {
    const cached = cache.get('trending_list');
    if (cached) {
      await bot.deleteMessage(chatId, thinking.message_id);
      return bot.sendMessage(chatId, cached, { parse_mode: 'Markdown' });
    }

    const trending = await birdeye.getTrending();
    if (!trending || trending.length === 0) {
      await bot.deleteMessage(chatId, thinking.message_id);
      return bot.sendMessage(chatId, `⚠️ No trending tokens found right now. Try again shortly.`);
    }

    // Analyze top 5 trending tokens
    const results = [];
    for (const token of trending.slice(0, 5)) {
      try {
        const data = await birdeye.getTokenData(token.address);
        const verdict = analyzeEntry(data);
        results.push({ token, verdict });
      } catch (e) {
        // skip failed tokens
      }
    }

    if (results.length === 0) {
      await bot.deleteMessage(chatId, thinking.message_id);
      return bot.sendMessage(chatId, `⚠️ Could not analyze trending tokens right now.`);
    }

    let message = `📈 *Trending Tokens — Entry Timing*\n_Updated just now_\n\n`;
    for (const { token, verdict } of results) {
      const icon = verdict.label === 'EARLY' ? '✅' : verdict.label === 'RISKY' ? '⚠️' : '❌';
      const name = token.name || token.symbol || token.address.slice(0,8);
      message += `${icon} *${name}* (${token.symbol || '—'})\n`;
      message += `   ${verdict.label} — ${verdict.reason}\n`;
      message += `   \`${token.address.slice(0,20)}...\`\n\n`;
    }
    message += `_Use /check <address> for deep analysis_`;

    cache.set('trending_list', message, 90);
    await bot.deleteMessage(chatId, thinking.message_id);
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (err) {
    await bot.deleteMessage(chatId, thinking.message_id);
    bot.sendMessage(chatId, `⚠️ Error fetching trending data.\n\n_${err.message}_`, { parse_mode: 'Markdown' });
    console.error('Trending error:', err.message);
  }
});

function formatVerdict(overview, verdict) {
  const icon = verdict.label === 'EARLY' ? '✅' : verdict.label === 'RISKY' ? '⚠️' : '❌';
  const name = overview?.name || 'Unknown Token';
  const symbol = overview?.symbol ? `(${overview.symbol})` : '';
  const price = overview?.price ? `$${formatNum(overview.price)}` : 'N/A';
  const mc = overview?.mc ? `$${formatLargeNum(overview.mc)}` : 'N/A';
  const v24h = overview?.v24hUSD ? `$${formatLargeNum(overview.v24hUSD)}` : 'N/A';
  const priceChange1h = overview?.priceChange1hPercent;
  const priceChange24h = overview?.priceChange24hPercent;

  const change1h = priceChange1h != null 
    ? `${priceChange1h > 0 ? '+' : ''}${priceChange1h.toFixed(1)}%` 
    : 'N/A';
  const change24h = priceChange24h != null 
    ? `${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(1)}%` 
    : 'N/A';

  return (
    `🛡️ *Entry Guard Analysis*\n\n` +
    `*${name}* ${symbol}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `${icon} *${verdict.label}*\n` +
    `_${verdict.reason}_\n\n` +
    `📊 *Onchain Snapshot*\n` +
    `• Price: ${price}\n` +
    `• 1h Change: ${change1h}\n` +
    `• 24h Change: ${change24h}\n` +
    `• Volume 24h: ${v24h}\n` +
    `• Market Cap: ${mc}\n\n` +
    `📡 *Signal Breakdown*\n` +
    `• Momentum: ${verdict.signals.momentum}\n` +
    `• Volume: ${verdict.signals.volume}\n` +
    `• Liquidity: ${verdict.signals.liquidity}\n` +
    `• Buy/Sell: ${verdict.signals.buySell}\n\n` +
    `_Data: Birdeye · Refresh in 60s_`
  );
}

function formatNum(n) {
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(6);
  if (n < 1000) return n.toFixed(4);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatLargeNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(2);
}

// Error handling
bot.on('polling_error', (err) => console.error('Polling error:', err.message));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err.message));
