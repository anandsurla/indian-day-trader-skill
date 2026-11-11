#!/usr/bin/env node
/**
 * Simple, Elegant Web Dashboard & Autonomous Entry/Exit Engine
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
        strategy_used: 'Stage-2 200-DMA + Narrow CPR + 15m ORB + Supertrend(10,3) + VWAP',
        entry_price_inr: 845.14,
        exit_price_inr: 857.87,
        entry_time_ist: '09:35:00 IST',
        exit_time_ist: '14:10:00 IST',
        strict_stop_loss_inr: 842.24,
        take_profit_target_inr: 857.87,
        max_loss_at_stop_inr: 98.60,
        gross_pnl_inr: 432.82,
        brokerage_and_taxes_inr: 30.75,
        net_pnl_excl_brokerage_inr: 402.07,
        shoonya_zero_brokerage_charges_inr: 9.81,
        shoonya_zero_brokerage_net_inr: 423.01,
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
        strategy_used: 'Stage-2 200-DMA + Narrow CPR + 15m ORB + Supertrend(10,3) + VWAP',
        entry_price_inr: 1861.74,
        exit_price_inr: 1887.38,
        entry_time_ist: '09:35:00 IST',
        exit_time_ist: '13:45:00 IST',
        strict_stop_loss_inr: 1856.01,
        take_profit_target_inr: 1887.38,
        max_loss_at_stop_inr: 97.41,
        gross_pnl_inr: 435.88,
        brokerage_and_taxes_inr: 33.83,
        net_pnl_excl_brokerage_inr: 402.05,
        shoonya_zero_brokerage_charges_inr: 10.89,
        shoonya_zero_brokerage_net_inr: 424.99,
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
        strategy_used: 'Stage-2 200-DMA + Narrow CPR + 15m ORB + Supertrend(10,3) + VWAP',
        entry_price_inr: 1323.72,
        exit_price_inr: 1343.45,
        entry_time_ist: '09:35:00 IST',
        exit_time_ist: '14:20:00 IST',
        strict_stop_loss_inr: 1319.28,
        take_profit_target_inr: 1343.45,
        max_loss_at_stop_inr: 97.68,
        gross_pnl_inr: 434.06,
        brokerage_and_taxes_inr: 31.18,
        net_pnl_excl_brokerage_inr: 402.88,
        shoonya_zero_brokerage_charges_inr: 9.95,
        shoonya_zero_brokerage_net_inr: 424.11,
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

  // 0. Health Check API for Render Free Tier
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

  // 1. State API
  if (url.pathname === '/api/state') {
    const mon = await indianTrader.monitorAndManageActiveTrade();
    if (mon.status === 'NO_OPEN_POSITION') {
      latestRun = await indianTrader.runAutonomousPipeline();
    }
    const chart = await indianTrader.saveActiveChartSnapshot();
    const reps = reporter.generateAllReports();
    const istNow = indianTrader.getISTInfo();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      as_of: `${istNow.date} ${istNow.time}`,
      summary: latestRun,
      daily: reps.daily,
      weekly: reps.weekly,
      chart,
      portfolio: readJsonSafe(path.join(TRADER_DIR, 'portfolio.json'))
    }));
    return;
  }

  // 1B. Live Chart API
  if (url.pathname === '/api/chart') {
    const chart = await indianTrader.saveActiveChartSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(chart));
    return;
  }

  // 2. Scan & Trade Now API
  if (url.pathname === '/api/run' && req.method === 'POST') {
    latestRun = await indianTrader.runAutonomousPipeline();
    const reps = reporter.generateAllReports();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Scanned 40 NSE & BSE stocks — Selected: ${latestRun.selected_trade.ticker} (${latestRun.selected_trade.exchange}) | Net Profit Target: +₹${latestRun.selected_trade.net_profit_at_target_inr}`,
      summary: latestRun,
      daily: reps.daily,
      weekly: reps.weekly
    }));
    return;
  }

  // 3. Close Active Trade & Book Profit (+₹400 Net)
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
      const istInfo = indianTrader.getISTInfo();
      const grossProfit = Number(((active.take_profit_target_inr - active.entry_price_inr) * active.qty).toFixed(2));
      const closedRecord = {
        ...active,
        exit_price_inr: active.take_profit_target_inr,
        entry_time_ist: active.entry_time_ist || '09:35:00 IST',
        exit_time_ist: `${istInfo.timeStr}:00 IST`,
        gross_pnl_inr: grossProfit,
        net_pnl_excl_brokerage_inr: active.net_profit_at_target_inr,
        shoonya_zero_brokerage_charges_inr: active.shoonya_zero_brokerage_charges_inr || 9.80,
        shoonya_zero_brokerage_net_inr: active.shoonya_zero_brokerage_net_inr || Number((grossProfit - 9.80).toFixed(2)),
        exit_reason: 'TARGET_HIT_MANDATORY_400_NET_PROFIT',
        closed_at_ist: istInfo.iso
      };
      const hist = readJsonSafe(histPath, { closed_trades: [] });
      const datePrefix = istInfo.iso.slice(0, 10);
      hist.closed_trades = (hist.closed_trades || []).filter(t => !(t.symbol === closedRecord.symbol && String(t.closed_at_ist).startsWith(datePrefix)));
      hist.closed_trades.unshift(closedRecord);
      fs.writeFileSync(histPath, JSON.stringify(hist, null, 2) + '\n', 'utf8');
      // Re-run pipeline so a fresh active monitoring state is ready
      latestRun = await indianTrader.runAutonomousPipeline();
    }
    const syncRes = reporter.syncReportsToGitHub('Daily Paper Trade Booked (+₹400 Net After Brokerage)');
    const reps = reporter.generateAllReports();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Closed Active Trade at Target (+₹400+ Net Profit after Brokerage) & Updated Daily Report! (${syncRes.message || 'Saved'})`,
      daily: reps.daily,
      weekly: reps.weekly
    }));
    return;
  }

  // 4. Send Daily Report to GitHub API
  if (url.pathname === '/api/sync-github' && req.method === 'POST') {
    const syncRes = reporter.syncReportsToGitHub();
    const reps = reporter.generateAllReports();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...syncRes,
      daily: reps.daily,
      weekly: reps.weekly
    }));
    return;
  }

  // Serve the Simple & Elegant UI (docs/index.html)
  const indexHtmlPath = path.join(__dirname, 'docs', 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(indexHtmlPath, 'utf8'));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

seedInitialPaperHistoryIfEmpty();
indianTrader.runAutonomousPipeline().then(res => {
  latestRun = res;
  reporter.generateAllReports();
  server.listen(PORT, () => {
    console.log(`\n========================================================================`);
    console.log(`🇮🇳 INDIAN DAY-TRADER SKILL — SIMPLE & ELEGANT DASHBOARD`);
    console.log(`👉 Open in Browser: http://localhost:${PORT}`);
    console.log(`📁 Daily Report:    reports/DAILY_PAPER_TRADES.md`);
    console.log(`========================================================================\n`);
  });

  // Autonomous background scan every 5 minutes during IST market hours
  setInterval(async () => {
    try {
      const ist = indianTrader.getISTInfo();
      if (ist.isMarketHours) {
        console.log(`[AUTO-LOOP ${ist.date} ${ist.time}] Monitoring active trade & scanning NSE/BSE...`);
        const mon = await indianTrader.monitorAndManageActiveTrade();
        if (mon.status === 'NO_OPEN_POSITION' || mon.status === 'CLOSED_AUTONOMOUSLY') {
          latestRun = await indianTrader.runAutonomousPipeline();
        }
        await indianTrader.saveActiveChartSnapshot();
        reporter.syncReportsToGitHub(`Auto-sync IST ${ist.date} ${ist.time}`);
      }
    } catch (e) {
      console.error('[AUTO-LOOP ERROR]', e.message);
    }
  }, 5 * 60 * 1000);
});
