require('dotenv').config();

const KALSHI_API     = 'https://api.elections.kalshi.com/trade-api/v2';
const CERTAINTY_THRESH = 0.97;  // Sweep when YES hits 97%+
const BID_PRICE        = 0.95;  // Bid at 95¢ (5% profit margin on Kalshi)
const MAX_BET_SIZE     = 10;    // Max USDC per sweep
const MIN_BET_SIZE     = 1;
const SCAN_INTERVAL_MS = 5000;  // Every 5 seconds

// Series to watch
const WATCH_SERIES = [
  // Sports
  'KXNBAGAME',
  'KXNFLGAME',
  'KXMLBGAME',
  'KXNHLGAME',
  // Crypto
  'KXBTC15M',
  'KXETH15M',
  'KXBTCD',
  'KXETHD',
  // Economic data
  'KXFEDDECISION',
  'KXCPI',
  'KXPROLLS',
  'KXUSNFP',
  'KXISMPMI',
  'KXISMSERVICES',
  'KXUSRETAIL',
  'KXUSPPI',
];

// Known economic release times (ET)
const ECONOMIC_RELEASES = [
  { name: 'CPI',           time: '08:30', series: ['KXCPI', 'KXCPIYOY'] },
  { name: 'PPI',           time: '08:30', series: ['KXUSPPI'] },
  { name: 'Jobs/NFP',      time: '08:30', series: ['KXPROLLS', 'KXUSNFP'] },
  { name: 'Retail Sales',  time: '08:30', series: ['KXUSRETAIL'] },
  { name: 'ISM PMI',       time: '10:00', series: ['KXISMPMI', 'KXISMSERVICES'] },
  { name: 'Fed Decision',  time: '14:00', series: ['KXFEDDECISION', 'KXFED'] },
];

function isNearEconomicRelease() {
  const now  = new Date();
  const etOffset = -4; // EDT
  const etHour   = (now.getUTCHours() + etOffset + 24) % 24;
  const etMin    = now.getUTCMinutes();

  for (const release of ECONOMIC_RELEASES) {
    const [rHour, rMin] = release.time.split(':').map(Number);
    const releaseMinutes = rHour * 60 + rMin;
    const nowMinutes     = etHour * 60 + etMin;
    const diff           = Math.abs(nowMinutes - releaseMinutes);

    // Within 5 minutes of release time
    if (diff <= 5) {
      return release;
    }
  }
  return null;
}

// ─── Kalshi Auth ─────────────────────────────────────────────────────────────

let authToken = null;

async function getAuthHeaders() {
  if (authToken) return { 'Authorization': `Bearer ${authToken}` };

  const res = await fetch(KALSHI_API.replace('/trade-api/v2', '') + '/trade-api/v2/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      email:    process.env.KALSHI_EMAIL,
      password: process.env.KALSHI_PASSWORD,
    }),
  });

  const data = await res.json();
  authToken  = data.token;
  console.log('Kalshi auth:', authToken ? '✅' : '❌ failed');
  return { 'Authorization': `Bearer ${authToken}` };
}

// ─── Crypto Price Fetchers ───────────────────────────────────────────────────

let btcPrice = null;
let lastBtcFetch = 0;

async function getBtcPrice() {
  if (Date.now() - lastBtcFetch < 10000) return btcPrice;
  try {
    const res  = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'
    );
    const data = await res.json();
    btcPrice     = parseFloat(data.bitcoin.usd);
    lastBtcFetch = Date.now();
    return btcPrice;
  } catch {
    return btcPrice;
  }
}

async function getEthPrice() {
  try {
    if (btcPrice && Date.now() - lastBtcFetch < 10000) {
      // Already fetched both in getBtcPrice
      const res  = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      const data = await res.json();
      return parseFloat(data.ethereum.usd);
    }
    return null;
  } catch {
    return null;
  }
}

function getCryptoCertainty(marketTitle, currentPrice) {
  // Parse target from market title
  // Format: "BTC price up in next 15 mins?" or "BTC above $74,040?"
  const targetMatch = marketTitle.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!targetMatch) return null;

  const target = parseFloat(targetMatch[1].replace(/,/g, ''));
  if (!target || !currentPrice) return null;

  const pctAbove = (currentPrice - target) / target;
  const pctBelow = (target - currentPrice) / target;

  // If price is 2%+ above target = ~99% certain YES
  // If price is 2%+ below target = ~99% certain NO
  if (pctAbove > 0.02) return { side: 'YES', certainty: 0.99 };
  if (pctAbove > 0.01) return { side: 'YES', certainty: 0.97 };
  if (pctBelow > 0.02) return { side: 'NO',  certainty: 0.99 };
  if (pctBelow > 0.01) return { side: 'NO',  certainty: 0.97 };

  return null; // Too close to call
}

// ─── Market Fetching ─────────────────────────────────────────────────────────

async function getActiveGameMarkets() {
  const markets = [];

  for (const series of WATCH_SERIES) {
    try {
      const res  = await fetch(
        `${KALSHI_API}/events?series_ticker=${series}&limit=20&status=open`
      );
      const data = await res.json();

      for (const event of (data.events || [])) {
        const mres  = await fetch(
          `${KALSHI_API}/markets?event_ticker=${event.event_ticker}&limit=20`
        );
        const mdata = await mres.json();

        for (const m of (mdata.markets || [])) {
          if (m.status !== 'active') continue;
          markets.push({
            ticker:    m.ticker,
            title:     m.title,
            eventTitle: event.title,
            series,
            closeTime: m.close_time,
          });
        }
      }
    } catch {
      // Series doesn't exist, skip
    }
  }

  console.log(`[Kalshi Sweeper] ${markets.length} active markets loaded`);
  return markets;
}

// ─── Price Detection ─────────────────────────────────────────────────────────

async function getBestYesPrice(ticker) {
  try {
    const res  = await fetch(`${KALSHI_API}/markets/${ticker}/orderbook`);
    const data = await res.json();

    const yesBids = data.orderbook?.yes_dollars || data.yes_dollars || [];
    if (!yesBids.length) return null;

    // Best bid is highest price someone will pay for YES
    // Format: [price_cents, size]
    const bestBid = yesBids[yesBids.length - 1];
    if (!bestBid) return null;

    const priceCents = bestBid[0];
    return priceCents / 100;
  } catch {
    return null;
  }
}

// ─── Order Placement ─────────────────────────────────────────────────────────

const sweptMarkets = new Set();

async function sweepMarket(market, currentPrice, side = 'YES') {
  if (sweptMarkets.has(market.ticker + side)) return;

  try {
    const headers = await getAuthHeaders();
    const count   = Math.floor((MAX_BET_SIZE / BID_PRICE) * 100); // contracts

    console.log(`\n🧹 KALSHI SWEEP`);
    console.log(`  Market:  ${market.title}`);
    console.log(`  Side:    ${side} @ ${(BID_PRICE*100).toFixed(0)}¢ bid`);
    console.log(`  Count:   ${count} contracts`);
    console.log(`  Cost:    $${(count * BID_PRICE / 100).toFixed(2)}`);
    console.log(`  Profit:  $${(count * (1 - BID_PRICE) / 100).toFixed(2)}`);

    const res = await fetch(`${KALSHI_API}/portfolio/orders`, {
      method:  'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticker:        market.ticker,
        action:        'buy',
        side:          side.toLowerCase(),
        type:          'limit',
        yes_price:     side === 'YES' ? Math.round(BID_PRICE * 100) : Math.round((1 - BID_PRICE) * 100),
        count,
        time_in_force: 'gtc',
      }),
    });

    const order = await res.json();

    if (order.order?.order_id || order.order_id) {
      sweptMarkets.add(market.ticker + side);
      console.log(`  ✅ Order placed!`, order.order?.order_id || order.order_id);
      await sendAlert(market, currentPrice, count, side);
    } else {
      console.log(`  ❌ Failed:`, JSON.stringify(order).slice(0, 150));
    }
  } catch (err) {
    console.error(`  ❌ Error:`, err.message);
  }
}

// ─── Email Alert ─────────────────────────────────────────────────────────────

const nodemailer = require('nodemailer');
let transporter  = null;

async function sendAlert(market, price, count, side = 'YES') {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  const profit = (count * (1 - BID_PRICE) / 100).toFixed(2);

  await transporter.sendMail({
    from:    `"Kalshi Sweeper" <${process.env.GMAIL_USER}>`,
    to:      process.env.ALERT_EMAIL || process.env.GMAIL_USER,
    subject: `🧹 KALSHI SWEEP: ${side} ${market.title} — $${profit} profit`,
    html: `
<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:24px;border-radius:8px;">
  <h2 style="color:#00ff88">🧹 Kalshi Sweep Placed</h2>
  <p><strong>${market.eventTitle}</strong></p>
  <p>Market: ${market.title}</p>
  <p>Side: ${side} | Bid: ${(BID_PRICE*100).toFixed(0)}¢</p>
  <p>Contracts: ${count} | Expected profit: $${profit}</p>
</div>`,
  }).catch(() => {});
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

let markets      = [];
let lastFetch    = 0;
let scanCount    = 0;

async function scan() {
  try {
    if (Date.now() - lastFetch > 5 * 60 * 1000) {
      markets   = await getActiveGameMarkets();
      lastFetch = Date.now();
    }

    const btc = await getBtcPrice();
    const eth = await getEthPrice();

    // Check if we're near an economic release
    const econRelease = isNearEconomicRelease();
    if (econRelease) {
      console.log(`\n⚡ ECONOMIC RELEASE WINDOW: ${econRelease.name}`);
      console.log(`   Scanning ALL ${econRelease.series.join(', ')} markets aggressively...`);
    }

    for (const market of markets) {
      const isCrypto = market.series?.includes('BTC') ||
                       market.series?.includes('ETH');
      const isEcon   = ECONOMIC_RELEASES.some(r =>
        r.series.includes(market.series)
      );

      if (isEcon) {
        // During release window — sweep anything at 97%+
        const price = await getBestYesPrice(market.ticker);
        if (!price) continue;

        if (econRelease && price >= CERTAINTY_THRESH) {
          console.log(`  🎯 ECON: ${market.title} — YES @ ${(price*100).toFixed(0)}¢`);
          await sweepMarket(market, price, 'YES');
        } else if (price >= 0.90) {
          console.log(`  📊 ECON: ${market.title} — ${(price*100).toFixed(0)}¢`);
        }

      } else if (isCrypto) {
        const price     = market.series.includes('ETH') ? eth : btc;
        const certainty = getCryptoCertainty(market.title, price);
        if (!certainty) continue;

        const minsLeft = (new Date(market.closeTime) - Date.now()) / 60000;
        if (minsLeft < 0 || minsLeft > 15) continue;

        console.log(`  📊 ${market.title} — BTC @ $${btc?.toFixed(0)} | ${certainty.side} ${(certainty.certainty*100).toFixed(0)}% | ${minsLeft.toFixed(1)}min`);

        if (certainty.certainty >= CERTAINTY_THRESH) {
          await sweepMarket(market, certainty.certainty, certainty.side);
        }

      } else {
        // Sports
        const price = await getBestYesPrice(market.ticker);
        if (!price) continue;

        if (price >= CERTAINTY_THRESH) {
          console.log(`  🎯 ${market.title} — YES @ ${(price*100).toFixed(0)}¢`);
          await sweepMarket(market, price, 'YES');
        } else if (price >= 0.85) {
          console.log(`  📊 ${market.title} — YES @ ${(price*100).toFixed(0)}¢ (warming)`);
        }
      }
    }

    scanCount++;
    if (scanCount % 60 === 0) {
      console.log(`[Kalshi Sweeper] ${new Date().toLocaleTimeString()} — watching ${markets.length} markets | BTC: $${btc?.toFixed(0)}`);
    }

  } catch (err) {
    console.error('[Kalshi Sweeper] Error:', err.message);
  }
}

async function main() {
  console.log('🧹 Kalshi Sweeper Starting');
  console.log(`   Certainty threshold: >${(CERTAINTY_THRESH*100).toFixed(0)}%`);
  console.log(`   Bid price:           ${(BID_PRICE*100).toFixed(0)}¢`);
  console.log(`   Max bet:             $${MAX_BET_SIZE}`);
  console.log(`   Watching series:     ${WATCH_SERIES.join(', ')}`);
  console.log('   Scanning every 5 seconds...\n');

  // Load markets immediately
  markets   = await getActiveGameMarkets();
  lastFetch = Date.now();
  console.log(`[Kalshi Sweeper] ${markets.length} active markets loaded\n`);

  await scan();
  setInterval(scan, SCAN_INTERVAL_MS);
}

main().catch(console.error);
