/**
 * Entry Guard — Core Analyzer
 * Outputs: EARLY / RISKY / LATE
 * Based on 4 onchain signals from Birdeye data
 */

function analyzeEntry({ overview, security, ohlcv }) {
  const scores = {
    momentum: scoreMomentum(overview, ohlcv),
    volume: scoreVolume(overview, ohlcv),
    liquidity: scoreLiquidity(overview, security),
    buySell: scoreBuySell(overview),
  };

  const total = Object.values(scores).reduce((a, b) => a + b.score, 0);
  const maxScore = Object.keys(scores).length * 3; // max 3 per signal

  const ratio = total / maxScore;

  let label, reason;

  if (ratio >= 0.70) {
    label = 'EARLY';
    reason = buildReason(scores, 'EARLY');
  } else if (ratio >= 0.40) {
    label = 'RISKY';
    reason = buildReason(scores, 'RISKY');
  } else {
    label = 'LATE';
    reason = buildReason(scores, 'LATE');
  }

  return {
    label,
    reason,
    signals: {
      momentum: scores.momentum.label,
      volume: scores.volume.label,
      liquidity: scores.liquidity.label,
      buySell: scores.buySell.label,
    },
    score: { total, max: maxScore, ratio: ratio.toFixed(2) },
  };
}

// --- Signal Scorers ---

function scoreMomentum(overview, ohlcv) {
  const p1h = overview?.priceChange1hPercent ?? 0;
  const p6h = overview?.priceChange6hPercent ?? 0;
  const p24h = overview?.priceChange24hPercent ?? 0;

  // Check OHLCV for acceleration (recent candles vs older)
  let acceleration = 0;
  if (ohlcv && ohlcv.length >= 4) {
    const recent = ohlcv.slice(-2);
    const older = ohlcv.slice(-6, -2);
    const recentVolAvg = avg(recent.map(c => c.v || 0));
    const olderVolAvg = avg(older.map(c => c.v || 0));
    if (olderVolAvg > 0) acceleration = recentVolAvg / olderVolAvg;
  }

  // Score: is momentum fresh and accelerating?
  // EARLY: 1h positive, 24h not yet blown up, acceleration rising
  // LATE: 24h huge, 1h flat/negative (fading)

  if (p1h > 5 && p24h < 100 && (acceleration > 1.3 || acceleration === 0)) {
    return { score: 3, label: '🟢 Building' };
  } else if (p1h > 2 && p24h < 200) {
    return { score: 2, label: '🟡 Active' };
  } else if (p1h > 0 && p24h >= 200) {
    return { score: 1, label: '🟠 Extended' };
  } else if (p1h <= 0 && p24h > 100) {
    return { score: 0, label: '🔴 Fading' };
  } else {
    return { score: 1, label: '🟡 Neutral' };
  }
}

function scoreVolume(overview, ohlcv) {
  const v24h = overview?.v24hUSD ?? 0;
  const v24hChange = overview?.v24hChangePercent ?? null;
  const mc = overview?.mc ?? 0;

  // Volume/MC ratio is key — healthy is > 0.1 (10% of MC daily)
  const volMcRatio = mc > 0 ? v24h / mc : 0;

  // Check if volume is spiking recently vs avg
  let recentSpike = 1;
  if (ohlcv && ohlcv.length >= 6) {
    const recent2 = avg(ohlcv.slice(-2).map(c => c.v || 0));
    const prev4 = avg(ohlcv.slice(-6, -2).map(c => c.v || 0));
    if (prev4 > 0) recentSpike = recent2 / prev4;
  }

  if (recentSpike > 2 && volMcRatio > 0.1) {
    return { score: 3, label: '🟢 Spiking' };
  } else if (volMcRatio > 0.2 || (v24hChange !== null && v24hChange > 50)) {
    return { score: 2, label: '🟡 Elevated' };
  } else if (volMcRatio > 0.05) {
    return { score: 1, label: '🟠 Moderate' };
  } else {
    return { score: 0, label: '🔴 Thin' };
  }
}

function scoreLiquidity(overview, security) {
  const liq = overview?.liquidity ?? 0;
  const mc = overview?.mc ?? 0;

  // Liquidity/MC ratio — <2% is danger zone
  const liqMcRatio = mc > 0 ? liq / mc : 0;

  // Security flags
  const isHoneypot = security?.isHoneypot === true;
  const hasFreeze = security?.freezeable === true || security?.freezeAuthority;
  const topHolder = security?.top10HolderPercent ?? 0;
  const isScam = security?.isScam === true;

  if (isHoneypot || isScam) {
    return { score: 0, label: '🔴 DANGER' };
  }

  if (liqMcRatio >= 0.05 && !hasFreeze && topHolder < 0.5) {
    return { score: 3, label: '🟢 Strong' };
  } else if (liqMcRatio >= 0.02 && !isHoneypot) {
    return { score: 2, label: '🟡 Okay' };
  } else if (liqMcRatio >= 0.01) {
    return { score: 1, label: '🟠 Weak' };
  } else {
    return { score: 0, label: '🔴 Danger' };
  }
}

function scoreBuySell(overview) {
  const buy24h = overview?.buy24h ?? 0;
  const sell24h = overview?.sell24h ?? 0;
  const uniqueWallets = overview?.uniqueWallet24h ?? 0;

  if (buy24h === 0 && sell24h === 0) {
    return { score: 1, label: '🟡 No data' };
  }

  const total = buy24h + sell24h;
  const buyRatio = total > 0 ? buy24h / total : 0.5;

  // Check wallet growth signal from vBuy/vSell if available
  const vBuy = overview?.vBuy24hUSD ?? 0;
  const vSell = overview?.vSell24hUSD ?? 0;
  const volBuyRatio = (vBuy + vSell) > 0 ? vBuy / (vBuy + vSell) : buyRatio;

  const combinedRatio = (buyRatio + volBuyRatio) / 2;

  if (combinedRatio >= 0.65 && uniqueWallets > 50) {
    return { score: 3, label: '🟢 Buy pressure' };
  } else if (combinedRatio >= 0.55) {
    return { score: 2, label: '🟡 Slight buyside' };
  } else if (combinedRatio >= 0.45) {
    return { score: 1, label: '🟠 Balanced' };
  } else {
    return { score: 0, label: '🔴 Sell pressure' };
  }
}

// --- Helpers ---

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function buildReason(scores, label) {
  const bestSignal = Object.entries(scores)
    .sort((a, b) => b[1].score - a[1].score)[0];
  const worstSignal = Object.entries(scores)
    .sort((a, b) => a[1].score - b[1].score)[0];

  const signalNames = {
    momentum: 'Price momentum',
    volume: 'Volume',
    liquidity: 'Liquidity',
    buySell: 'Buy pressure',
  };

  if (label === 'EARLY') {
    return `${signalNames[bestSignal[0]]} is strong — move may just be starting`;
  } else if (label === 'RISKY') {
    return `Mixed signals — ${signalNames[worstSignal[0]].toLowerCase()} is the weak point`;
  } else {
    return `${signalNames[worstSignal[0]]} has deteriorated — risk of being exit liquidity`;
  }
}

module.exports = { analyzeEntry };
