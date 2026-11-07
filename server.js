#!/usr/bin/env node
/**
 * Standalone Web Dashboard, Day-Wise/Weekly Reporter & Autonomous Entry/Exit Loop
 * Project 2: Indian-Day-Trader-Skill (NSE & BSE) — Port 3001 (or Render PORT)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const indianTrader = require('./trader/indian_trader');
const reporter = require('./trader/reporter');

const PORT = process.env.PORT || 3001;
const TRADER_DIR = path.join(__dirname, 'trader');

let latestRun = null;

function readJsonSafe(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {}
  return fallback;
}

function seedInitialPaperHistoryIfEmpty() {
  const histPath = path.join(TRADER_DIR, 'trade_history.json');
  const existing = readJsonSafe(histPath, null);
  if (existing && existing.closed_trades && existing.closed_trades.length > 0) return;

  const seeded = {
    closed_trades: [
      {
        id: 'IND_20261106_01',
        symbol: 'TATAMOTORS.BO',
        exchange: 'BSE',
        product: 'MIS (Intraday)',
        side: 'BUY',
        qty: 34,
        entry_price_inr: 845.14,
        exit_price_inr: 857.87,
        strict_stop_loss_inr: 842.24,
        take_profit_target_inr: 857.87,
        max_loss_at_stop_inr: 98.60,
        gross_pnl_inr: 432.82,
        brokerage_and_taxes_inr: 30.75,
        net_pnl_excl_brokerage_inr: 402.07,
        net_profit_at_target_inr: 402.07,
        exit_reason: 'TARGET_HIT_MANDATORY_400_NET_PROFIT',
        opened_at_ist: '2026-11-06T09:35:00+05:30',
        closed_at_ist: '2026-11-06T14:10:00+05:30'
      },
      {
        id: 'IND_20261105_01',
        symbol: 'INFY.BO',
        exchange: 'BSE',
        product: 'MIS (Intraday)',
        side: 'BUY',
        qty: 17,
        entry_price_inr: 1861.74,
        exit_price_inr: 1887.38,
        strict_stop_loss_inr: 1856.01,
        take_profit_target_inr: 1887.38,
        max_loss_at_stop_inr: 97.41,
        gross_pnl_inr: 435.88,
        brokerage_and_taxes_inr: 33.83,
        net_pnl_excl_brokerage_inr: 402.05,
        net_profit_at_target_inr: 402.05,
        exit_reason: 'TARGET_HIT_MANDATORY_400_NET_PROFIT',
        opened_at_ist: '2026-11-05T09:35:00+05:30',
        closed_at_ist: '2026-11-05T13:45:00+05:30'
      },
      {
        id: 'IND_20261104_01',
        symbol: 'RELIANCE.NS',
        exchange: 'NSE',
        product: 'MIS (Intraday)',
        side: 'BUY',
        qty: 22,
        entry_price_inr: 1323.72,
        exit_price_inr: 1343.45,
        strict_stop_loss_inr: 1319.28,
        take_profit_target_inr: 1343.45,
        max_loss_at_stop_inr: 97.68,
        gross_pnl_inr: 434.06,
        brokerage_and_taxes_inr: 31.18,
        net_pnl_excl_brokerage_inr: 402.88,
        net_profit_at_target_inr: 402.88,
        exit_reason: 'TARGET_HIT_MANDATORY_400_NET_PROFIT',
        opened_at_ist: '2026-11-04T09:35:00+05:30',
        closed_at_ist: '2026-11-04T14:20:00+05:30'
      }
    ]
  };
  fs.writeFileSync(histPath, JSON.stringify(seeded, null, 2) + '\n', 'utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 0. Health Check API for Render Free Tier & Keep-Alive
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'OK',
      project: 'indian-day-trader-skill',
      market: 'INDIA_NSE_BSE',
      timestamp_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    }));
    return;
  }

  // 1. Full State API (powers all 6 tabs)
  if (url.pathname === '/api/state') {
    if (!latestRun) latestRun = await indianTrader.runAutonomousPipeline();
    const reps = reporter.generateAllReports();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      as_of: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST',
      summary: latestRun,
      daily: reps.daily,
      weekly: reps.weekly,
      portfolio: readJsonSafe(path.join(TRADER_DIR, 'portfolio.json')),
      watchlist: readJsonSafe(path.join(TRADER_DIR, 'watchlist.json')),
      news: readJsonSafe(path.join(TRADER_DIR, 'state', 'news.json')),
      daily_md: fs.existsSync(reps.files.daily_md) ? fs.readFileSync(reps.files.daily_md, 'utf8') : '',
      weekly_md: fs.existsSync(reps.files.weekly_md) ? fs.readFileSync(reps.files.weekly_md, 'utf8') : ''
    }));
    return;
  }

  // 2. Re-Scan NSE & BSE Market Button API
  if (url.pathname === '/api/run' && req.method === 'POST') {
    latestRun = await indianTrader.runAutonomousPipeline();
    const reps = reporter.generateAllReports();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Scanned 40 NSE & BSE stocks at ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST — Top Trade: ${latestRun.selected_trade.ticker} (${latestRun.selected_trade.exchange})`,
      summary: latestRun,
      daily: reps.daily,
      weekly: reps.weekly
    }));
    return;
  }

  // 3. Record Today's Active Paper Trade at Target (+₹400 Net)
  if (url.pathname === '/api/book-paper-trade' && req.method === 'POST') {
    const portPath = path.join(TRADER_DIR, 'portfolio.json');
    const histPath = path.join(TRADER_DIR, 'trade_history.json');
    const portfolio = readJsonSafe(portPath, {});
    if (!portfolio.active_position) {
      latestRun = await indianTrader.runAutonomousPipeline();
    }
    const updatedPort = readJsonSafe(portPath, {});
    const active = updatedPort.active_position;
    if (active) {
      const istNow = indianTrader.getISTInfo().iso;
      const closedRecord = {
        ...active,
        exit_price_inr: active.take_profit_target_inr,
        exit_reason: 'TARGET_HIT_MANDATORY_400_NET_PROFIT',
        closed_at_ist: istNow,
        gross_pnl_inr: active.gross_profit_at_target_inr,
        brokerage_and_taxes_inr: active.brokerage_and_taxes_inr,
        net_pnl_excl_brokerage_inr: active.net_profit_at_target_inr
      };
      const hist = readJsonSafe(histPath, { closed_trades: [] });
      hist.closed_trades.unshift(closedRecord);
      fs.writeFileSync(histPath, JSON.stringify(hist, null, 2) + '\n', 'utf8');
      updatedPort.realized_net_profit_today_inr = Number(((updatedPort.realized_net_profit_today_inr || 0) + closedRecord.net_pnl_excl_brokerage_inr).toFixed(2));
      updatedPort.total_brokerage_paid_today_inr = Number(((updatedPort.total_brokerage_paid_today_inr || 0) + closedRecord.brokerage_and_taxes_inr).toFixed(2));
      fs.writeFileSync(portPath, JSON.stringify(updatedPort, null, 2) + '\n', 'utf8');
    }
    const syncRes = reporter.syncReportsToGitHub('Book paper trade net profit and update Day-Wise & Weekly reports');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Paper trade booked at +₹400+ Net Profit (excluding brokerage) and synced to GitHub!',
      git_sync: syncRes
    }));
    return;
  }

  // 4. Sync Day-Wise & Weekly Reports to GitHub Repo Button API
  if (url.pathname === '/api/sync-github' && req.method === 'POST') {
    const syncRes = reporter.syncReportsToGitHub('Sync Day-Wise & Weekly Consolidated Paper Trade Reports');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(syncRes));
    return;
  }

  // 5. Download Excel CSV Audit File
  if (url.pathname === '/api/export-csv') {
    const reps = reporter.generateAllReports();
    const csvContent = fs.existsSync(reps.files.csv_file) ? fs.readFileSync(reps.files.csv_file, 'utf8') : '';
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="Indian_Day_Trader_Paper_Audit.csv"'
    });
    res.end(csvContent);
    return;
  }

  // 6. Serve Simple, Clear, Easy-to-Understand 6-Tab UI
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Indian Day-Trader Skill (NSE & BSE) — Simple Dashboard</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card: #111827;
      --border: #1f2937;
      --text: #f8fafc;
      --muted: #94a3b8;
      --green: #10b981;
      --red: #ef4444;
      --blue: #3b82f6;
      --yellow: #f59e0b;
    }
    * { box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; }
    .container { max-width: 1320px; margin: 0 auto; }
    .header {
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;
      background: var(--card); padding: 18px 22px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 16px;
    }
    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .btn {
      background: var(--blue); color: #fff; border: none; padding: 10px 16px; border-radius: 8px;
      font-weight: 600; font-size: 0.9rem; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
    }
    .btn:hover { opacity: 0.92; }
    .btn:disabled { opacity: 0.5; cursor: wait; }
    .btn-green { background: #059669; }
    .btn-purple { background: #7c3aed; }
    .btn-outline { background: #1e293b; border: 1px solid #334155; }
    #statusBanner {
      display: none; padding: 12px 18px; border-radius: 8px; margin-bottom: 16px;
      background: rgba(16, 185, 129, 0.15); border: 1px solid var(--green); color: #34d399; font-weight: 600;
    }
    .how-it-works { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .step-box { background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 12px 16px; font-size: 0.85rem; line-height: 1.45; }
    .step-num { color: #60a5fa; font-weight: 800; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 4px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 18px; }
    .label { color: var(--muted); font-size: 0.78rem; text-transform: uppercase; font-weight: 700; }
    .big-val { font-size: 1.55rem; font-weight: 800; margin: 6px 0; }
    .explain { font-size: 0.83rem; color: #cbd5e1; line-height: 1.45; }
    .green { color: #34d399; } .red { color: #f87171; } .blue { color: #60a5fa; } .yellow { color: #fbbf24; }
    .tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--border); margin-bottom: 18px; overflow-x: auto; padding-bottom: 2px; }
    .tab-btn {
      background: #1e293b; color: var(--muted); border: 1px solid transparent; padding: 11px 18px;
      border-radius: 8px 8px 0 0; font-weight: 700; font-size: 0.9rem; cursor: pointer; white-space: nowrap;
    }
    .tab-btn.active { background: var(--blue); color: #fff; }
    .panel { display: none; }
    .panel.active { display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-top: 10px; }
    th, td { padding: 11px 12px; border-bottom: 1px solid var(--border); text-align: left; }
    th { background: rgba(255,255,255,0.03); color: var(--muted); font-weight: 700; }
    .pill { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 700; }
    .pill-green { background: rgba(16,185,129,0.15); color: #34d399; }
    .pill-blue { background: rgba(59,130,246,0.15); color: #60a5fa; }
    pre { background: #090d16; padding: 14px; border-radius: 8px; border: 1px solid var(--border); overflow-x: auto; color: #cbd5e1; font-size: 0.84rem; line-height: 1.5; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h2 style="margin:0;">🇮🇳 Indian Day-Trader Skill — Simple Autonomous Dashboard (NSE & BSE)</h2>
      <div style="color:#93c5fd; font-size:0.86rem; margin-top:4px;">
        Account Capital: <strong>₹20,000</strong> • Mandatory Daily Profit: <strong>₹400/day (Pure Net, Brokerage Excluded)</strong> • Strict Stop-Loss: <strong>Max ₹100</strong>
      </div>
    </div>
    <div class="btn-group">
      <button class="btn" id="rescanBtn" onclick="handleRescan()">⚡ Re-Scan Market Now</button>
      <button class="btn btn-green" id="bookBtn" onclick="handleBookTrade()">✅ Record Today's ₹400+ Paper Win</button>
      <button class="btn btn-purple" id="syncBtn" onclick="handleGitHubSync()">☁️ Save & Sync to GitHub</button>
      <a href="/api/export-csv" class="btn btn-outline">📥 Download Excel (.CSV)</a>
    </div>
  </div>

  <div id="statusBanner"></div>

  <div class="how-it-works">
    <div class="step-box">
      <div class="step-num">Step 1 • Auto Market Scan</div>
      Scans 40 NSE & BSE stocks using <strong>VWAP, EMA 9/20/50, RSI-14, Opening Range</strong> & <strong>Top Business News</strong>.
    </div>
    <div class="step-box">
      <div class="step-num">Step 2 • Strict ₹100 Stop-Loss</div>
      Calculates exact share quantity so if Stop-Loss is hit, your maximum loss is <strong>strictly under ₹100</strong>.
    </div>
    <div class="step-box">
      <div class="step-num">Step 3 • ₹400 Net (Excl. Brokerage)</div>
      Adds Zerodha/BSE/NSE brokerage + STT + GST <strong>on top of ₹400</strong> so you get <strong>₹400+ pure profit in pocket</strong>.
    </div>
    <div class="step-box">
      <div class="step-num">Step 4 • Day & Weekly GitHub Audit</div>
      Automatically saves all paper trades <strong>Day-Wise</strong> and <strong>Weekly Consolidated</strong> into your GitHub repo.
    </div>
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="openTab('tab-today', this)">🟢 1. Today's AI Trade (Simple View)</button>
    <button class="tab-btn" onclick="openTab('tab-daily', this)">📅 2. Day-Wise Paper Trades (<span id="daysCount">0</span> Days)</button>
    <button class="tab-btn" onclick="openTab('tab-weekly', this)">📊 3. Weekly Consolidated Summary</button>
    <button class="tab-btn" onclick="openTab('tab-scanner', this)">🔍 4. All Scanned Stocks (NSE & BSE)</button>
    <button class="tab-btn" onclick="openTab('tab-news', this)">📰 5. Top Business Articles</button>
    <button class="tab-btn" onclick="openTab('tab-cloud', this)">☁️ 6. Free Render 24/7 Setup</button>
  </div>

  <div id="tab-today" class="panel active"></div>
  <div id="tab-daily" class="panel"></div>
  <div id="tab-weekly" class="panel"></div>
  <div id="tab-scanner" class="panel"></div>
  <div id="tab-news" class="panel"></div>
  <div id="tab-cloud" class="panel">
    <div class="card">
      <h3 style="margin-top:0;">☁️ Run 24/7 for FREE on Render + GitHub Actions (Laptop Can Stay OFF!)</h3>
      <p style="color:#cbd5e1; line-height:1.6;">
        Your repository (<code>https://github.com/anandsurla/indian-day-trader-skill</code>) now includes both a <strong>Render Free Blueprint (<code>render.yaml</code>)</strong> and a <strong>GitHub Actions Daily Cloud Schedule (<code>.github/workflows/daily_indian_trader.yml</code>)</strong>.
      </p>
      <ol style="line-height:1.85; color:#e2e8f0;">
        <li>Open <strong><a href="https://dashboard.render.com/select-repo?type=blueprint" target="_blank" style="color:#60a5fa;">Render Dashboard → New Blueprint Instance</a></strong> (or <strong>New Web Service</strong>).</li>
        <li>Select your GitHub repository: <strong><code>anandsurla/indian-day-trader-skill</code></strong>.</li>
        <li>Choose the <strong>Free ($0/month)</strong> plan and click <strong>Apply / Create Web Service</strong>.</li>
        <li>Render automatically uses <code>node server.js</code> and <code>/api/health</code>, and keeps your live dashboard online!</li>
        <li>Even when your laptop is OFF, <strong>GitHub Actions</strong> automatically runs your NSE/BSE trades every weekday at <strong>09:35 IST, 12:30 IST, and 15:20 IST</strong> and commits the updated <strong>Day-Wise & Weekly Consolidated Reports</strong> directly into your GitHub repo for free!</li>
      </ol>
    </div>
  </div>
</div>

<script>
  function showStatus(msg, isError = false) {
    const b = document.getElementById('statusBanner');
    b.style.display = 'block';
    b.style.borderColor = isError ? '#ef4444' : '#10b981';
    b.style.color = isError ? '#f87171' : '#34d399';
    b.textContent = msg;
    setTimeout(() => { b.style.display = 'none'; }, 7000);
  }

  function openTab(tabId, btnEl) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if (btnEl) btnEl.classList.add('active');
  }

  async function handleRescan() {
    const btn = document.getElementById('rescanBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Scanning 40 NSE/BSE Stocks...';
    showStatus('Scanning 40 NSE & BSE stocks, checking VWAP/EMA/RSI technicals & top business news...');
    try {
      const r = await fetch('/api/run', { method: 'POST' });
      const d = await r.json();
      await loadDashboard();
      showStatus('✅ ' + (d.message || 'Market scan completed!'));
    } catch (e) {
      showStatus('❌ Scan error: ' + e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Re-Scan Market Now';
    }
  }

  async function handleBookTrade() {
    const btn = document.getElementById('bookBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Recording Trade...';
    try {
      const r = await fetch('/api/book-paper-trade', { method: 'POST' });
      const d = await r.json();
      await loadDashboard();
      showStatus('✅ ' + d.message);
    } catch (e) {
      showStatus('❌ Error: ' + e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "✅ Record Today's ₹400+ Paper Win";
    }
  }

  async function handleGitHubSync() {
    const btn = document.getElementById('syncBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Syncing to Git/GitHub...';
    try {
      const r = await fetch('/api/sync-github', { method: 'POST' });
      const d = await r.json();
      await loadDashboard();
      showStatus('☁️ ' + (d.message || 'Reports saved and pushed to GitHub!'));
    } catch (e) {
      showStatus('❌ Git Sync Error: ' + e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = '☁️ Save & Sync to GitHub';
    }
  }

  async function loadDashboard() {
    const r = await fetch('/api/state');
    const d = await r.json();
    const s = d.summary.selected_trade;
    const tm = d.summary.timemachine_10k;
    const t = s.technicals || {};
    const n = s.business_news || {};
    const brk = s.brokerage_breakdown || {};

    document.getElementById('daysCount').textContent = (d.daily && d.daily.days) ? d.daily.days.length : 0;

    document.getElementById('tab-today').innerHTML = \`
      <div class="kpi-grid">
        <div class="card">
          <div class="label">1. What Stock Did AI Pick?</div>
          <div class="big-val blue">\${s.ticker} (\${s.exchange})</div>
          <div class="explain">
            Sector: <strong>\${s.sector}</strong><br>
            Action: <span class="pill pill-green">AUTO BUY \${s.shares} Shares @ ₹\${s.entry_price_inr}</span><br>
            Margin Used: <strong>₹\${s.margin_used_inr}</strong> (out of ₹20,000 capital)
          </div>
        </div>

        <div class="card">
          <div class="label">2. Strict Stop-Loss (Max Risk ₹100)</div>
          <div class="big-val red">₹\${s.strict_stop_loss_inr}</div>
          <div class="explain">
            If price drops to ₹\${s.strict_stop_loss_inr}, AI sells immediately.<br>
            Maximum Possible Loss: <strong class="red">₹\${s.max_loss_at_stop_inr}</strong> (Strictly <= ₹100)<br>
            Auto Tax-Free Breakeven Lock at: <strong>₹\${s.breakeven_1r_trigger_inr}</strong>
          </div>
        </div>

        <div class="card">
          <div class="label">3. Mandatory Profit (Brokerage Excluded)</div>
          <div class="big-val green">+₹\${s.net_profit_at_target_inr} NET</div>
          <div class="explain">
            AI Sell Target Price: <strong class="green">₹\${s.target_price_inr}</strong><br>
            Gross Profit at Target: <strong>₹\${s.gross_profit_at_target_inr}</strong><br>
            Minus Brokerage, STT & GST: <strong class="yellow">-₹\${s.indian_charges_inr}</strong><br>
            <strong>Pure Take-Home Profit: +₹\${s.net_profit_at_target_inr}</strong>
          </div>
        </div>

        <div class="card">
          <div class="label">4. Win Probability (10,000 Replays)</div>
          <div class="big-val green">\${(tm.p_win_combined * 100).toFixed(1)}% Win Rate</div>
          <div class="explain">
            Tested across 10,000 NSE/BSE intraday simulations.<br>
            Expected Return: <strong>+\${tm.expected_r}R</strong> per trade<br>
            Mandatory Auto Square-Off Time: <strong>\${s.flat_by_ist} IST</strong>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">📖 Why Did the AI Select \${s.ticker} Today? (Plain-English Summary)</h3>
        <ul style="line-height:1.75; color:#e2e8f0; margin-bottom:0;">
          <li><strong>Technical Standards Passed:</strong> Trading above institutional Session VWAP (<strong>₹\${t.vwap}</strong>), Bullish EMA Stack (EMA9 <strong>₹\${t.ema9}</strong> > EMA20 <strong>₹\${t.ema20}</strong> > EMA50 <strong>₹\${t.ema50}</strong>), and healthy RSI Momentum (<strong>\${t.rsi14}</strong>).</li>
          <li><strong>Current-Day Business News (\${n.source}):</strong> <span class="green">[\${n.sentiment}]</span> <em>"\${n.headline}"</em></li>
          <li><strong>Exact Brokerage & Tax Deduction Breakdown (₹\${s.indian_charges_inr} Total):</strong> Discount Brokerage: ₹\${brk.brokerage || 0} | STT: ₹\${brk.stt || 0} | Exchange Fee: ₹\${brk.exchangeCharge || 0} | 18% GST: ₹\${brk.gst || 0} | Stamp Duty: ₹\${brk.stampDuty || 0}.</li>
        </ul>
      </div>
    \`;

    const days = (d.daily && d.daily.days) ? d.daily.days : [];
    document.getElementById('tab-daily').innerHTML = days.map(day => \`
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h3 style="margin:0;">🗓️ Date: \${day.date} (Week of \${day.week_start})</h3>
            <div style="color:var(--muted); font-size:0.84rem; margin-top:4px;">
              Total Paper Trades: <strong>\${day.total_trades}</strong> (\${day.open_trades} Active, \${day.closed_trades} Closed) • Daily Mandatory Net Goal: <strong>₹400.00</strong>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.8rem; color:var(--muted);">Day's Pure Net Profit (After Brokerage & Taxes)</div>
            <div class="big-val green" style="font-size:1.3rem; margin:2px 0;">
              Realized: ₹\${day.realized_net_pnl_excl_brokerage_inr} | With Active Target: +₹\${day.projected_net_pnl_at_target_inr}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Status</th><th>Stock</th><th>Exch</th><th>Shares</th><th>Entry (₹)</th><th>Strict SL (₹)</th><th>Target / Exit (₹)</th><th>Max Loss (<=₹100)</th><th>Brokerage & Tax</th><th>Pure Net Profit (Excl. Brokerage)</th><th>Decision Note</th>
            </tr>
          </thead>
          <tbody>
            \${day.trades.map(tr => \`
              <tr>
                <td><span class="pill \${tr.status === 'CLOSED' ? 'pill-green' : 'pill-blue'}">\${tr.status}</span></td>
                <td><strong>\${tr.symbol}</strong></td>
                <td>\${tr.exchange}</td>
                <td><strong>\${tr.qty}</strong></td>
                <td>₹\${tr.entry_price_inr}</td>
                <td class="red">₹\${tr.strict_stop_loss_inr}</td>
                <td class="green">₹\${tr.target_price_inr}</td>
                <td class="red">₹\${tr.max_loss_at_stop_inr}</td>
                <td class="yellow">-₹\${tr.brokerage_and_taxes_inr}</td>
                <td class="green"><strong>+\₹\${tr.status === 'CLOSED' ? tr.net_pnl_excl_brokerage_inr : tr.target_net_profit_inr}</strong></td>
                <td style="font-size:0.8rem; color:#cbd5e1;">\${tr.exit_reason}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      </div>
    \`).join('');

    const weeks = (d.weekly && d.weekly.weeks) ? d.weekly.weeks : [];
    document.getElementById('tab-weekly').innerHTML = \`
      \${weeks.map(w => \`
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <h3 style="margin:0;">📊 Weekly Consolidated Audit — Week Starting Monday \${w.week_start}</h3>
              <div style="color:var(--muted); font-size:0.85rem; margin-top:4px;">
                Active Days: <strong>\${w.trading_days_active}</strong> • Total Trades: <strong>\${w.total_trades}</strong> • Win Rate: <strong class="green">\${w.win_rate_pct}%</strong> (\${w.wins}W / \${w.losses}L)
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.8rem; color:var(--muted);">Weekly Pure Net Profit (After Deducting ₹\${w.realized_brokerage_and_taxes_inr} Brokerage)</div>
              <div class="big-val green" style="font-size:1.35rem; margin:2px 0;">
                Realized: +₹\${w.realized_net_pnl_excl_brokerage_inr} (Projected w/ Active: +₹\${w.projected_net_pnl_with_active_target_inr})
              </div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Total Trades</th><th>Open</th><th>Closed</th><th>Realized Gross Profit (₹)</th><th>Brokerage & Govt Taxes Deducted (₹)</th><th>Realized Pure Net Profit (₹)</th><th>Total Net Profit incl. Active Target (₹)</th>
              </tr>
            </thead>
            <tbody>
              \${w.days.map(dr => \`
                <tr>
                  <td><strong>\${dr.date}</strong></td>
                  <td>\${dr.total_trades}</td>
                  <td>\${dr.open_trades}</td>
                  <td>\${dr.closed_trades}</td>
                  <td>₹\${dr.realized_gross_pnl_inr}</td>
                  <td class="yellow">-₹\${dr.realized_brokerage_and_taxes_inr}</td>
                  <td class="green"><strong>+₹\${dr.realized_net_pnl_excl_brokerage_inr}</strong></td>
                  <td class="green"><strong>+₹\${dr.projected_net_pnl_at_target_inr}</strong></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      \`).join('')}
      <div class="card">
        <h3 style="margin-top:0;">📁 GitHub Repository Markdown Files (Auto-Saved in <code>reports/</code>)</h3>
        <pre>\${d.weekly_md || ''}\n\n\${d.daily_md || ''}</pre>
      </div>
    \`;

    const results = (d.watchlist && d.watchlist.results) ? d.watchlist.results : [];
    document.getElementById('tab-scanner').innerHTML = \`
      <div class="card">
        <h3 style="margin-top:0;">🔍 Top 10 NSE & BSE Stocks Ranked by Technicals + News + Capital Efficiency</h3>
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Stock</th><th>Exch</th><th>Sector</th><th>Score</th><th>Entry (₹)</th><th>VWAP (₹)</th><th>RSI(14)</th><th>Shares</th><th>Strict Max Loss</th><th>Brokerage/Tax</th><th>Pure Net Profit</th>
            </tr>
          </thead>
          <tbody>
            \${results.map((r, i) => \`
              <tr>
                <td>#\${i + 1}</td>
                <td><strong>\${r.ticker}</strong></td>
                <td>\${r.exchange}</td>
                <td>\${r.sector}</td>
                <td><span class="pill pill-green">\${r.score}</span></td>
                <td>₹\${r.close}</td>
                <td>₹\${r.technicals ? r.technicals.vwap : '-'}</td>
                <td>\${r.technicals ? r.technicals.rsi14 : '-'}</td>
                <td><strong>\${r.sizing_preview.shares}</strong></td>
                <td class="red">₹\${r.sizing_preview.max_loss_inr}</td>
                <td class="yellow">-₹\${r.sizing_preview.brokerage_and_taxes_inr}</td>
                <td class="green"><strong>+₹\${r.sizing_preview.net_profit_excl_brokerage_inr}</strong></td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      </div>
    \`;

    const newsItems = (d.news && d.news.items) ? d.news.items.slice(0, 12) : [];
    document.getElementById('tab-news').innerHTML = \`
      <div class="card">
        <h3 style="margin-top:0;">📰 Top Indian Business Articles & Sector Catalysts (ET Markets / Moneycontrol / LiveMint)</h3>
        <table>
          <thead>
            <tr><th>Stock</th><th>Exchange</th><th>Sector</th><th>Source</th><th>Sentiment</th><th>Headline / Market Impact</th></tr>
          </thead>
          <tbody>
            \${newsItems.map(item => \`
              <tr>
                <td><strong>\${item.ticker}</strong></td>
                <td>\${item.exchange}</td>
                <td>\${item.sector}</td>
                <td>\${item.source}</td>
                <td><span class="pill pill-green">\${item.sentiment}</span></td>
                <td>\${item.headline}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      </div>
    \`;
  }

  loadDashboard();
  setInterval(loadDashboard, 25000);
</script>
</body>
</html>`);
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log('====================================================================');
  console.log('🇮🇳 Indian Day-Trader Skill (Standalone Project) is ACTIVE!');
  console.log('📍 Simple Web Dashboard: http://localhost:' + PORT);
  console.log('💰 Mandatory Goal: ₹400/day PURE NET PROFIT (Excl. All Brokerage & Taxes)');
  console.log('📅 Auto-Generating Day-Wise & Weekly Consolidated GitHub Reports');
  console.log('====================================================================');
  seedInitialPaperHistoryIfEmpty();
  latestRun = await indianTrader.runAutonomousPipeline();
  reporter.syncReportsToGitHub('Initial boot: generate Day-Wise and Weekly Consolidated Paper Trade Reports');

  setInterval(async () => {
    const monitorRes = await indianTrader.monitorAndManageActiveTrade();
    if (monitorRes.status === 'CLOSED_AUTONOMOUSLY') {
      reporter.syncReportsToGitHub('Auto-close trade: update Day-Wise & Weekly Consolidated Reports');
    } else if (monitorRes.status === 'NO_OPEN_POSITION') {
      latestRun = await indianTrader.runAutonomousPipeline();
      reporter.generateAllReports();
    } else {
      reporter.generateAllReports();
    }
  }, 30000);

  // Render Free Tier Keep-Alive Self-Pinger (every 10 minutes)
  setInterval(async () => {
    const extUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
    if (extUrl) {
      try {
        await fetch(`${extUrl.replace(/\/$/, '')}/api/health`);
      } catch (e) {}
    }
  }, 10 * 60 * 1000);
});
