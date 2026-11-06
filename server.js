#!/usr/bin/env node
/**
 * Standalone Web Dashboard & Autonomous Loop for Indian-Day-Trader-Skill (NSE & BSE)
 * Runs on Port 3001 (completely separate from SriKari Stock Invest on Port 3000)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const indianTrader = require('./trader/indian_trader');

const PORT = process.env.PORT || 3001;
const TRADER_DIR = path.join(__dirname, 'trader');

let latestRun = null;

function readJsonSafe(file) {
  try {
    const p = path.join(TRADER_DIR, file);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/state') {
    if (!latestRun) latestRun = await indianTrader.runAutonomousPipeline();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      summary: latestRun,
      watchlist: readJsonSafe('watchlist.json'),
      entry: readJsonSafe('entry.json'),
      plan: readJsonSafe('plan.json'),
      timemachine: readJsonSafe('timemachine.json'),
      orders: readJsonSafe('orders.json'),
      risk: readJsonSafe('state/risk.json'),
      broker: readJsonSafe('state/broker.json'),
      alerts: readJsonSafe('alerts.json')
    }, null, 2));
    return;
  }

  if (url.pathname === '/api/run' && req.method === 'POST') {
    latestRun = await indianTrader.runAutonomousPipeline();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(latestRun, null, 2));
    return;
  }

  // Standalone HTML Dashboard on Port 3001
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Indian Day-Trader Skill (NSE & BSE) — Port ${PORT}</title>
  <style>
    body { background:#0b0f19; color:#e2e8f0; font-family:system-ui,-apple-system,sans-serif; margin:0; padding:24px; }
    .header { display:flex; justify-content:space-between; align-items:center; background:#111827; padding:18px 24px; border-radius:12px; border:1px solid #1f2937; margin-bottom:20px; }
    .badge { background:#065f46; color:#34d399; padding:6px 12px; border-radius:999px; font-weight:700; font-size:0.82rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; margin-bottom:20px; }
    .card { background:#111827; border:1px solid #1f2937; border-radius:10px; padding:18px; }
    .label { color:#94a3b8; font-size:0.78rem; text-transform:uppercase; font-weight:600; }
    .val { font-size:1.45rem; font-weight:700; margin-top:6px; }
    .green { color:#34d399; } .red { color:#f87171; } .blue { color:#60a5fa; }
    table { width:100%; border-collapse:collapse; margin-top:12px; font-size:0.9rem; }
    th, td { padding:10px 12px; border-bottom:1px solid #1f2937; text-align:left; }
    th { color:#94a3b8; }
    button { background:#2563eb; color:#fff; border:none; padding:10px 18px; border-radius:8px; font-weight:600; cursor:pointer; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2 style="margin:0;">🇮🇳 Indian Day-Trader Skill (NSE & BSE Standalone Engine)</h2>
      <div style="color:#93c5fd; font-size:0.85rem; margin-top:4px;">Account: ₹20,000 | Daily Profit Goal: ₹400/day (+2.0%) | Strict Stop-Loss: Max ₹100 | Daily Loss Limit: ₹100</div>
    </div>
    <div>
      <span class="badge">PORT ${PORT} • PAPER MODE</span>
      <button onclick="reRun()" style="margin-left:12px;">⚡ Run 9-Skill Pipeline</button>
    </div>
  </div>
  <div id="content">Loading autonomous NSE/BSE pipeline...</div>
  <script>
    async function load() {
      const r = await fetch('/api/state');
      const d = await r.json();
      const s = d.summary.selected_trade;
      const tm = d.summary.timemachine_10k;
      document.getElementById('content').innerHTML = \`
        <div class="grid">
          <div class="card"><div class="label">Selected NSE/BSE Trade</div><div class="val blue">\${s.ticker} (\${s.exchange})</div><div>BUY \${s.shares} sh @ ₹\${s.entry_price_inr}</div></div>
          <div class="card"><div class="label">Strict Stop-Loss (Max ₹100)</div><div class="val red">₹\${s.strict_stop_loss_inr}</div><div>Max Loss at Stop: ₹\${s.max_loss_at_stop_inr} (<= ₹100)</div></div>
          <div class="card"><div class="label">Daily Target (Net >= ₹400)</div><div class="val green">₹\${s.target_price_inr}</div><div>Net Profit: +₹\${s.net_profit_at_target_inr} (after ₹\${s.indian_charges_inr} tax)</div></div>
          <div class="card"><div class="label">Time Machine (10,000 Replays)</div><div class="val green">\${(tm.p_win_combined*100).toFixed(1)}% Win</div><div>Expected: +\${tm.expected_r}R | Verdict: \${d.summary.risk_verdict}</div></div>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Top 5 NSE & BSE Watchlist Candidates</h3>
          <table>
            <thead><tr><th>Ticker</th><th>Exchange</th><th>Score</th><th>Entry (₹)</th><th>Shares</th><th>Strict Max Loss (<= ₹100)</th><th>4R Target Profit (₹)</th></tr></thead>
            <tbody>
              \${d.summary.top_watchlist.map(w => \`<tr><td><strong>\${w.ticker}</strong></td><td>\${w.exchange}</td><td>\${w.score}</td><td>₹\${w.close}</td><td>\${w.shares}</td><td class="red">₹\${w.max_loss_inr}</td><td class="green">₹\${w.target_profit_inr}</td></tr>\`).join('')}
            </tbody>
          </table>
        </div>
      \`;
    }
    async function reRun() {
      await fetch('/api/run', { method: 'POST' });
      await load();
    }
    load();
    setInterval(load, 30000);
  </script>
</body>
</html>`);
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log('====================================================================');
  console.log('🇮🇳 Indian Day-Trader Skill (Standalone Project) is ACTIVE!');
  console.log('📍 Standalone Web Dashboard: http://localhost:' + PORT);
  console.log('💰 Rules: ₹20,000 Budget | ₹400/day Target | Strict ₹100 Stop-Loss');
  console.log('====================================================================');
  latestRun = await indianTrader.runAutonomousPipeline();
  setInterval(async () => {
    latestRun = await indianTrader.runAutonomousPipeline();
  }, 60000);
});
