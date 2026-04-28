# 🛡️ Entry Guard — Telegram Bot

> **Are you early, or exit liquidity?**

Entry Guard is a Telegram bot that analyzes Solana tokens in real-time using Birdeye onchain data and tells you whether you're entering at the *right time* — or too late.

Built for the **Birdeye BIP Competition Sprint 2** (April–May 2026).

---

## 🎯 What It Does

Instead of dumping raw data at you, Entry Guard gives you a clear verdict:

| Verdict | Meaning |
|---------|---------|
| ✅ **EARLY** | Momentum just starting — smart entry zone |
| ⚠️ **RISKY** | Already moving, high volatility window |
| ❌ **LATE** | Likely chasing — you may be exit liquidity |

Plus a 1-line reason so you actually trust it.

---

## 📡 Birdeye Endpoints Used

| Endpoint | Used For |
|----------|----------|
| `/defi/token_overview` | Price, volume, market cap, buy/sell counts |
| `/defi/token_security` | Honeypot detection, freeze authority, top holders |
| `/defi/ohlcv` | Recent candle data for momentum acceleration |
| `/defi/token_trending` | Trending token discovery |

---

## 🧠 How Signals Work

Entry Guard scores **4 signals** (each 0–3):

1. **Price Momentum** — Is 1h price rising? Is it accelerating vs 24h?
2. **Volume Spike** — Is volume spiking vs recent candles? Vol/MC ratio healthy?
3. **Liquidity Health** — Is liquidity strong vs market cap? No honeypot flags?
4. **Buy/Sell Pressure** — Are buyers dominating? Volume-weighted buy ratio?

**Total score → Verdict:**
- 70%+ = EARLY
- 40–70% = RISKY  
- Below 40% = LATE

---

## 🚀 Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd entry-guard
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Fill in:
```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
BIRDEYE_API_KEY=your_birdeye_api_key
```

**Get your Telegram bot token:**  
Message [@BotFather](https://t.me/BotFather) → `/newbot` → follow prompts

**Get your Birdeye API key:**  
Sign up at [bds.birdeye.so](https://bds.birdeye.so) (free tier available)

### 3. Run the bot

```bash
node bot.js
```

---

## 💬 Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + intro |
| `/check <address>` | Deep analyze a specific token |
| `/trending` | Scan top 5 trending tokens with verdicts |
| `/help` | Explain how the bot works |

---

## 🏗️ Project Structure

```
entry-guard/
├── bot.js          # Telegram bot logic & message formatting
├── birdeye.js      # Birdeye API wrapper (all API calls)
├── analyzer.js     # Core scoring & verdict engine
├── .env.example    # Environment variable template
└── package.json
```

---

## 🌐 Deployment (Optional)

To run 24/7, deploy to a VPS or use Railway/Render:

```bash
# Install PM2 for process management
npm install -g pm2
pm2 start bot.js --name entry-guard
pm2 save
```

Or deploy to Railway:
1. Push to GitHub
2. Connect repo on [railway.app](https://railway.app)
3. Add environment variables in Railway dashboard
4. Deploy ✅

---

## 🏆 Hackathon Submission

**Competition:** Birdeye BIP Competition Sprint 2  
**Tags:** `@birdeye_data` `#BirdeyeAPI`  
**Birdeye endpoints:** `/defi/token_overview`, `/defi/token_security`, `/defi/ohlcv`, `/defi/token_trending`

---

Built with ❤️ using [Birdeye Data API](https://bds.birdeye.so)
