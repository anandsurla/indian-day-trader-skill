/**
 * SriKari TradeBot — Per-Day & Per-Week Consolidated Reporter + GitHub Auto-Sync
 *
 * Automatically generates:
 *   1. reports/daily/YYYY-MM-DD.md                     — Separate daily report file named by exact date (each day strictly isolated)
 *   2. reports/weekly/WEEKLY_CONSOLIDATED_YYYY-MM-DD.md — Separate weekly consolidated report named by week's Friday (last day of week)
 *   3. reports/DAILY_PAPER_TRADES.md                   — Today's live paper/real trade report mirror
 *   4. reports/WEEKLY_CONSOLIDATED_REPORT.md           — Current week's consolidated report mirror
 *   5. reports/PAPER_TRADES_AUDIT.csv                  — Excel CSV with exact Entry & Exit Dates and Times
 *   6. trader/daily_summary.json & trader/weekly_summary.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TRADER_DIR = __dirname;
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const DAILY_REPORTS_DIR = path.join(REPORTS_DIR, 'daily');
const WEEKLY_REPORTS_DIR = path.join(REPORTS_DIR, 'weekly');

const FILES = {
    portfolio: path.join(TRADER_DIR, 'portfolio.json'),
    history: path.join(TRADER_DIR, 'trade_history.json'),
    dailyJson: path.join(TRADER_DIR, 'daily_summary.json'),
    weeklyJson: path.join(TRADER_DIR, 'weekly_summary.json'),
    dailyMd: path.join(REPORTS_DIR, 'DAILY_PAPER_TRADES.md'),
    weeklyMd: path.join(REPORTS_DIR, 'WEEKLY_CONSOLIDATED_REPORT.md'),
    csvFile: path.join(REPORTS_DIR, 'PAPER_TRADES_AUDIT.csv')
};

function ensureDirs() {
    if (!fs.existsSync(TRADER_DIR)) fs.mkdirSync(TRADER_DIR, { recursive: true });
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    if (!fs.existsSync(DAILY_REPORTS_DIR)) fs.mkdirSync(DAILY_REPORTS_DIR, { recursive: true });
    if (!fs.existsSync(WEEKLY_REPORTS_DIR)) fs.mkdirSync(WEEKLY_REPORTS_DIR, { recursive: true });
}

function readJson(filePath, fallback = null) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {}
    return fallback;
}

function writeJson(filePath, data) {
    ensureDirs();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function formatISTParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        hour12: false
    });
    const parts = {};
    for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
    const hh = parts.hour === '24' ? '00' : parts.hour;
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${hh}:${parts.minute}:${parts.second} IST`,
        iso: `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}:${parts.second}+05:30`,
        dayOfWeek: dayMap[parts.weekday] !== undefined ? dayMap[parts.weekday] : date.getUTCDay()
    };
}

function extractDateFromIso(str, fallbackDate) {
    if (!str) return fallbackDate;
    const m = String(str).match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : fallbackDate;
}

function extractTimeIst(isoOrTimeStr, fallback = '-') {
    if (!isoOrTimeStr || isoOrTimeStr === '-') return fallback;
    const s = String(isoOrTimeStr).trim();
    const m = s.match(/(\d{2}:\d{2}:\d{2})/);
    if (m) return `${m[1]} IST`;
    return s.includes('IST') ? s : `${s} IST`;
}

function getWeekBounds(dateStr) {
    const d = new Date(`${dateStr}T12:00:00+05:30`);
    const istDay = formatISTParts(d).dayOfWeek; // 0=Sun, 1=Mon..6=Sat
    const diffToMon = istDay === 0 ? -6 : 1 - istDay;
    const mon = new Date(d.getTime() + diffToMon * 86400000);
    const fri = new Date(mon.getTime() + 4 * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    return {
        weekStart: formatISTParts(mon).date,
        weekFriday: formatISTParts(fri).date,
        weekEnd: formatISTParts(sun).date
    };
}

function formatSignInr(val) {
    const n = Number(val || 0);
    const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
    return `${sign}₹${Math.abs(n).toFixed(2)}`;
}

function formatBrokInr(val) {
    const n = Math.abs(Number(val || 0));
    return n > 0 ? `-₹${n.toFixed(2)}` : '₹0.00';
}

function buildDailyMarkdown(dayObj) {
    const netLabel = formatSignInr(dayObj.realized_net_pnl_excl_brokerage_inr);
    const grossLabel = formatSignInr(dayObj.realized_gross_pnl_inr);
    const brokLabel = formatBrokInr(dayObj.realized_brokerage_and_taxes_inr);

    const lines = [
        `# Daily Trade Report — ${dayObj.date}`,
        `**Week:** ${dayObj.week_start} (Mon) to ${dayObj.week_friday} (Fri) | **Capital:** ₹${Number(dayObj.account_budget_inr || 20000).toLocaleString('en-IN')}`,
        '',
        '## Day Summary (Strictly This Date Only)',
        `- **Daily Profit / Loss (Excl. Brokerage & Taxes):** **${netLabel}**`,
        `- **Daily Gross P&L:** ${grossLabel}`,
        `- **Total Brokerage & Govt Taxes (Today Only):** ${brokLabel}`,
        `- **Completed Trades:** ${dayObj.closed_trades} (${dayObj.wins} Wins / ${dayObj.losses} Losses) | **Active Trades:** ${dayObj.open_trades}`,
        ''
    ];

    const openTrades = dayObj.trades.filter(t => t.status !== 'CLOSED');
    const closedTrades = dayObj.trades.filter(t => t.status === 'CLOSED');

    if (openTrades.length > 0) {
        lines.push('## Active Trade');
        lines.push('| Stock | Side | Qty | Entry Date & Time (IST) | Entry Price | Live Price | Stop Loss | Target | Live P&L (Excl. Brokerage) |');
        lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
        for (const t of openTrades) {
            lines.push(`| **${t.symbol}** (${t.exchange}) | ${t.side} | ${t.qty} | ${t.entry_date_ist} ${t.entry_time_ist} | ₹${t.entry_price_inr} | ₹${t.live_price_inr || t.entry_price_inr} | ₹${t.strict_stop_loss_inr} | ₹${t.target_price_inr} | **${formatSignInr(t.live_net_pnl_inr)}** |`);
        }
        lines.push('');
    }

    lines.push('## Completed Trades');
    lines.push('| Stock | Side | Qty | Entry Date & Time (IST) | Entry ₹ | Exit Date & Time (IST) | Exit ₹ | Brokerage & Tax ₹ | Net P&L (Excl. Brokerage) | Reason |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    if (closedTrades.length === 0) {
        lines.push('| No completed trades recorded on this date | - | - | - | - | - | - | - | ₹0.00 | - |');
    } else {
        for (const t of closedTrades) {
            lines.push(`| **${t.symbol}** (${t.exchange}) | ${t.side} | ${t.qty} | ${t.entry_date_ist} ${t.entry_time_ist} | ₹${t.entry_price_inr} | ${t.exit_date_ist} ${t.exit_time_ist} | ₹${t.current_or_exit_price_inr} | -₹${Number(t.brokerage_and_taxes_inr).toFixed(2)} | **${formatSignInr(t.net_pnl_excl_brokerage_inr)}** | ${t.exit_reason} |`);
        }
    }
    lines.push('');
    return lines.join('\n');
}

function buildWeeklyMarkdown(weekObj) {
    const netLabel = formatSignInr(weekObj.realized_net_pnl_excl_brokerage_inr);
    const grossLabel = formatSignInr(weekObj.realized_gross_pnl_inr);
    const brokLabel = formatBrokInr(weekObj.realized_brokerage_and_taxes_inr);

    const lines = [
        `# Weekly Consolidated Trade Report — Week Ending ${weekObj.week_friday}`,
        `**Week Period:** ${weekObj.week_start} (Monday) to ${weekObj.week_friday} (Friday)`,
        '',
        '## Weekly Summary (Current Week Only)',
        `- **Total Weekly Profit / Loss (Excl. Brokerage & Taxes):** **${netLabel}**`,
        `- **Total Weekly Gross P&L:** ${grossLabel}`,
        `- **Total Weekly Brokerage & Govt Taxes:** ${brokLabel}`,
        `- **Completed Trades:** ${weekObj.closed_trades} (${weekObj.wins} Wins / ${weekObj.losses} Losses | Win Rate: ${weekObj.win_rate_pct}%)`,
        '',
        '## Day-by-Day Breakdown',
        '| Date | Trades Closed | Gross P&L | Brokerage & Tax | Net P&L (Excl. Brokerage) | Daily Report File |',
        '| :--- | :--- | :--- | :--- | :--- | :--- |'
    ];

    const sortedDays = [...(weekObj.days || [])].sort((a, b) => a.date.localeCompare(b.date));
    for (const d of sortedDays) {
        lines.push(`| **${d.date}** | ${d.closed_trades} | ${formatSignInr(d.realized_gross_pnl_inr)} | ${formatBrokInr(d.realized_brokerage_and_taxes_inr)} | **${formatSignInr(d.realized_net_pnl_excl_brokerage_inr)}** | [\`${d.date}.md\`](../daily/${d.date}.md) |`);
    }
    lines.push(`| **WEEK TOTAL** | **${weekObj.closed_trades}** | **${grossLabel}** | **${brokLabel}** | **${netLabel}** | - |`);
    lines.push('');

    const weekTrades = weekObj.all_closed_trades || [];
    lines.push('## All Completed Trades This Week');
    lines.push('| Stock | Side | Qty | Entry Date & Time (IST) | Entry ₹ | Exit Date & Time (IST) | Exit ₹ | Brokerage & Tax ₹ | Net P&L (Excl. Brokerage) | Reason |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    if (weekTrades.length === 0) {
        lines.push('| No completed trades recorded this week yet | - | - | - | - | - | - | - | ₹0.00 | - |');
    } else {
        for (const t of weekTrades) {
            lines.push(`| **${t.symbol}** (${t.exchange}) | ${t.side} | ${t.qty} | ${t.entry_date_ist} ${t.entry_time_ist} | ₹${t.entry_price_inr} | ${t.exit_date_ist} ${t.exit_time_ist} | ₹${t.current_or_exit_price_inr} | -₹${Number(t.brokerage_and_taxes_inr).toFixed(2)} | **${formatSignInr(t.net_pnl_excl_brokerage_inr)}** | ${t.exit_reason} |`);
        }
    }
    lines.push('');
    return lines.join('\n');
}

function generateAllReports() {
    ensureDirs();
    const nowIst = formatISTParts(new Date());
    const todayDate = nowIst.date;
    const currentWeekBounds = getWeekBounds(todayDate);

    const portfolio = readJson(FILES.portfolio, {
        account_budget_inr: 20000,
        mandatory_daily_profit_target_inr: 400,
        strict_max_loss_per_trade_inr: 100,
        active_position: null
    });
    const history = readJson(FILES.history, { closed_trades: [] });
    const closedTrades = history.closed_trades || [];
    const activePos = portfolio.active_position || null;

    const allTrades = [];
    if (activePos) {
        const entryDateStr = activePos.entry_date_ist || activePos.date || extractDateFromIso(activePos.opened_at_ist, todayDate);
        const wb = getWeekBounds(entryDateStr);
        const side = String(activePos.side || 'BUY').toUpperCase();
        const isShort = side === 'SELL';
        const livePrice = Number(activePos.live_price_inr || activePos.current_price_inr || activePos.entry_price_inr);
        const priceDiff = isShort ? (activePos.entry_price_inr - livePrice) : (livePrice - activePos.entry_price_inr);
        const liveGross = activePos.unrealized_gross_pnl_inr !== undefined
            ? Number(activePos.unrealized_gross_pnl_inr)
            : Number((priceDiff * activePos.qty).toFixed(2));
        const brok = Number(activePos.brokerage_and_taxes_inr || 30.0);
        const liveNet = activePos.unrealized_net_pnl_excl_brokerage_inr !== undefined
            ? Number(activePos.unrealized_net_pnl_excl_brokerage_inr)
            : Number((liveGross - brok).toFixed(2));
        const grossTarget = Number(activePos.gross_profit_at_target_inr || ((activePos.net_profit_at_target_inr || 400) + brok).toFixed(2));

        allTrades.push({
            id: activePos.id || 'ACTIVE_NOW',
            date: entryDateStr,
            entry_date_ist: entryDateStr,
            exit_date_ist: '-',
            week_start: wb.weekStart,
            week_friday: wb.weekFriday,
            week_end: wb.weekEnd,
            status: 'OPEN',
            symbol: activePos.symbol,
            name: activePos.name || activePos.symbol,
            exchange: activePos.exchange || 'NSE',
            side,
            qty: activePos.qty,
            entry_time_ist: extractTimeIst(activePos.entry_time_ist || activePos.opened_at_ist, nowIst.time),
            exit_time_ist: 'ACTIVE',
            entry_price_inr: Number(activePos.entry_price_inr),
            live_price_inr: livePrice,
            current_or_exit_price_inr: livePrice,
            strict_stop_loss_inr: Number(activePos.strict_stop_loss_inr),
            target_price_inr: Number(activePos.take_profit_target_inr || activePos.target_price_inr),
            max_loss_at_stop_inr: Number(activePos.max_loss_at_stop_inr || 100),
            live_gross_pnl_inr: liveGross,
            live_net_pnl_inr: liveNet,
            gross_pnl_inr: liveGross,
            target_gross_profit_inr: grossTarget,
            brokerage_and_taxes_inr: brok,
            net_pnl_excl_brokerage_inr: liveNet,
            target_net_profit_inr: Number(activePos.net_profit_at_target_inr || 400),
            exit_reason: 'ACTIVE',
            opened_at_ist: activePos.opened_at_ist || `${entryDateStr} ${extractTimeIst(activePos.entry_time_ist, nowIst.time)}`,
            closed_at_ist: '-'
        });
    }

    for (const t of closedTrades) {
        const entryDateStr = t.entry_date_ist || t.date || extractDateFromIso(t.opened_at_ist, extractDateFromIso(t.closed_at_ist, todayDate));
        const exitDateStr = t.exit_date_ist || extractDateFromIso(t.closed_at_ist, entryDateStr);
        const wb = getWeekBounds(exitDateStr);
        const side = String(t.side || 'BUY').toUpperCase();
        const brok = Number(t.brokerage_and_taxes_inr || 0);
        const netPnl = Number(t.net_pnl_excl_brokerage_inr || 0);
        const grossPnl = t.gross_pnl_inr !== undefined ? Number(t.gross_pnl_inr) : Number((netPnl + brok).toFixed(2));
        const entryTimeIst = extractTimeIst(t.entry_time_ist || t.opened_at_ist, '09:35:00 IST');
        const exitTimeIst = extractTimeIst(t.exit_time_ist || t.closed_at_ist, '15:15:00 IST');

        allTrades.push({
            id: t.id || `CLOSED_${exitDateStr}_${t.symbol}`,
            date: exitDateStr,
            entry_date_ist: entryDateStr,
            exit_date_ist: exitDateStr,
            week_start: wb.weekStart,
            week_friday: wb.weekFriday,
            week_end: wb.weekEnd,
            status: 'CLOSED',
            symbol: t.symbol,
            name: t.name || t.symbol,
            exchange: t.exchange || 'NSE',
            side,
            qty: t.qty,
            entry_time_ist: entryTimeIst,
            exit_time_ist: exitTimeIst,
            entry_price_inr: Number(t.entry_price_inr),
            current_or_exit_price_inr: Number(t.exit_price_inr),
            strict_stop_loss_inr: Number(t.strict_stop_loss_inr),
            target_price_inr: Number(t.take_profit_target_inr || t.target_price_inr),
            max_loss_at_stop_inr: Number(t.max_loss_at_stop_inr || 100),
            gross_pnl_inr: grossPnl,
            target_gross_profit_inr: grossPnl,
            brokerage_and_taxes_inr: brok,
            net_pnl_excl_brokerage_inr: netPnl,
            target_net_profit_inr: Number(t.net_profit_at_target_inr || netPnl),
            exit_reason: t.exit_reason || 'CLOSED',
            opened_at_ist: t.opened_at_ist || `${entryDateStr} ${entryTimeIst}`,
            closed_at_ist: t.closed_at_ist || `${exitDateStr} ${exitTimeIst}`
        });
    }

    // Ensure every trade date AND every weekday in current week up to today has a daily entry
    const daysMap = {};
    const ensureDay = (dateStr) => {
        if (!daysMap[dateStr]) {
            const wb = getWeekBounds(dateStr);
            daysMap[dateStr] = {
                date: dateStr,
                week_start: wb.weekStart,
                week_friday: wb.weekFriday,
                week_end: wb.weekEnd,
                account_budget_inr: portfolio.account_budget_inr || 20000,
                total_trades: 0,
                open_trades: 0,
                closed_trades: 0,
                wins: 0,
                losses: 0,
                realized_gross_pnl_inr: 0,
                realized_brokerage_and_taxes_inr: 0,
                realized_net_pnl_excl_brokerage_inr: 0,
                trades: []
            };
        }
        return daysMap[dateStr];
    };

    ensureDay(todayDate);
    // Ensure Mon..today weekdays of current week exist so missing days show 0 trades cleanly
    const monDate = new Date(`${currentWeekBounds.weekStart}T12:00:00+05:30`);
    for (let i = 0; i < 5; i++) {
        const dStr = formatISTParts(new Date(monDate.getTime() + i * 86400000)).date;
        if (dStr <= todayDate) ensureDay(dStr);
    }

    for (const tr of allTrades) {
        const d = ensureDay(tr.date);
        d.total_trades += 1;
        d.trades.push(tr);
        if (tr.status === 'CLOSED') {
            d.closed_trades += 1;
            if (tr.net_pnl_excl_brokerage_inr >= 0) d.wins += 1;
            else d.losses += 1;
            d.realized_gross_pnl_inr = Number((d.realized_gross_pnl_inr + tr.gross_pnl_inr).toFixed(2));
            d.realized_brokerage_and_taxes_inr = Number((d.realized_brokerage_and_taxes_inr + tr.brokerage_and_taxes_inr).toFixed(2));
            d.realized_net_pnl_excl_brokerage_inr = Number((d.realized_net_pnl_excl_brokerage_inr + tr.net_pnl_excl_brokerage_inr).toFixed(2));
        } else {
            d.open_trades += 1;
        }
    }

    const daysList = Object.values(daysMap).sort((a, b) => b.date.localeCompare(a.date));

    // Write each date's standalone report file: reports/daily/YYYY-MM-DD.md
    for (const dayObj of daysList) {
        const dayFile = path.join(DAILY_REPORTS_DIR, `${dayObj.date}.md`);
        fs.writeFileSync(dayFile, buildDailyMarkdown(dayObj), 'utf8');
    }

    // Group strictly by calendar week (Mon..Sun, filename uses Friday YYYY-MM-DD)
    const weeksMap = {};
    for (const d of daysList) {
        if (!weeksMap[d.week_start]) {
            weeksMap[d.week_start] = {
                week_start: d.week_start,
                week_friday: d.week_friday,
                week_end: d.week_end,
                weekly_target_net_inr: 2000,
                trading_days_active: 0,
                total_trades: 0,
                closed_trades: 0,
                open_trades: 0,
                wins: 0,
                losses: 0,
                win_rate_pct: 0,
                realized_gross_pnl_inr: 0,
                realized_brokerage_and_taxes_inr: 0,
                realized_net_pnl_excl_brokerage_inr: 0,
                days: [],
                all_closed_trades: []
            };
        }
        const w = weeksMap[d.week_start];
        if (d.total_trades > 0) w.trading_days_active += 1;
        w.total_trades += d.total_trades;
        w.closed_trades += d.closed_trades;
        w.open_trades += d.open_trades;
        w.wins += d.wins;
        w.losses += d.losses;
        w.realized_gross_pnl_inr = Number((w.realized_gross_pnl_inr + d.realized_gross_pnl_inr).toFixed(2));
        w.realized_brokerage_and_taxes_inr = Number((w.realized_brokerage_and_taxes_inr + d.realized_brokerage_and_taxes_inr).toFixed(2));
        w.realized_net_pnl_excl_brokerage_inr = Number((w.realized_net_pnl_excl_brokerage_inr + d.realized_net_pnl_excl_brokerage_inr).toFixed(2));
        w.win_rate_pct = w.closed_trades > 0 ? Number(((w.wins / w.closed_trades) * 100).toFixed(1)) : 0;
        w.days.push({
            date: d.date,
            total_trades: d.total_trades,
            open_trades: d.open_trades,
            closed_trades: d.closed_trades,
            realized_gross_pnl_inr: d.realized_gross_pnl_inr,
            realized_brokerage_and_taxes_inr: d.realized_brokerage_and_taxes_inr,
            realized_net_pnl_excl_brokerage_inr: d.realized_net_pnl_excl_brokerage_inr
        });
        for (const tr of d.trades) {
            if (tr.status === 'CLOSED') w.all_closed_trades.push(tr);
        }
    }

    const weeksList = Object.values(weeksMap).sort((a, b) => b.week_start.localeCompare(a.week_start));

    // Write each week's standalone consolidated report: reports/weekly/WEEKLY_CONSOLIDATED_YYYY-MM-DD.md
    for (const weekObj of weeksList) {
        const weeklyFile = path.join(WEEKLY_REPORTS_DIR, `WEEKLY_CONSOLIDATED_${weekObj.week_friday}.md`);
        fs.writeFileSync(weeklyFile, buildWeeklyMarkdown(weekObj), 'utf8');
    }

    // Current-day and Current-week ONLY summary metrics
    const todayObj = daysMap[todayDate];
    const currentWeekObj = weeksMap[currentWeekBounds.weekStart] || {
        week_start: currentWeekBounds.weekStart,
        week_friday: currentWeekBounds.weekFriday,
        week_end: currentWeekBounds.weekEnd,
        closed_trades: 0,
        realized_gross_pnl_inr: 0,
        realized_brokerage_and_taxes_inr: 0,
        realized_net_pnl_excl_brokerage_inr: 0,
        days: [],
        all_closed_trades: []
    };

    // Update top-level pointers (Today & Current Week ONLY!)
    fs.writeFileSync(FILES.dailyMd, buildDailyMarkdown(todayObj), 'utf8');
    fs.writeFileSync(FILES.weeklyMd, buildWeeklyMarkdown(currentWeekObj), 'utf8');

    const activeTradesList = allTrades.filter(t => t.status !== 'CLOSED');
    const closedTradesList = allTrades.filter(t => t.status === 'CLOSED');
    const currentWeekClosedList = closedTradesList.filter(t => t.week_start === currentWeekBounds.weekStart);

    const dailyPayload = {
        generated_at: nowIst.iso,
        today_date: todayDate,
        current_week_start: currentWeekBounds.weekStart,
        current_week_friday: currentWeekBounds.weekFriday,
        current_week_end: currentWeekBounds.weekEnd,
        account_budget_inr: portfolio.account_budget_inr || 20000,
        mandatory_daily_net_profit_inr: portfolio.mandatory_daily_profit_target_inr || 400,
        strict_max_loss_per_trade_inr: portfolio.strict_max_loss_per_trade_inr || 100,
        summary_totals: {
            today_date: todayDate,
            today_closed_count: todayObj.closed_trades,
            today_gross_pnl_inr: todayObj.realized_gross_pnl_inr,
            today_brokerage_and_taxes_inr: todayObj.realized_brokerage_and_taxes_inr,
            today_net_pnl_excl_brokerage_inr: todayObj.realized_net_pnl_excl_brokerage_inr,
            current_week_start: currentWeekBounds.weekStart,
            current_week_friday: currentWeekBounds.weekFriday,
            current_week_closed_count: currentWeekObj.closed_trades,
            current_week_gross_pnl_inr: currentWeekObj.realized_gross_pnl_inr,
            current_week_brokerage_and_taxes_inr: currentWeekObj.realized_brokerage_and_taxes_inr,
            current_week_net_pnl_excl_brokerage_inr: currentWeekObj.realized_net_pnl_excl_brokerage_inr,
            active_trades_count: activeTradesList.length
        },
        active_trades: activeTradesList,
        current_week_closed_trades: currentWeekClosedList,
        closed_trades: closedTradesList,
        days: daysList
    };

    const weeklyPayload = {
        generated_at: nowIst.iso,
        account_budget_inr: portfolio.account_budget_inr || 20000,
        current_week_start: currentWeekBounds.weekStart,
        current_week_friday: currentWeekBounds.weekFriday,
        summary_totals: dailyPayload.summary_totals,
        weeks: weeksList.map(w => ({
            week_start: w.week_start,
            week_friday: w.week_friday,
            week_end: w.week_end,
            weekly_target_net_inr: w.weekly_target_net_inr,
            trading_days_active: w.trading_days_active,
            total_trades: w.total_trades,
            closed_trades: w.closed_trades,
            open_trades: w.open_trades,
            wins: w.wins,
            losses: w.losses,
            win_rate_pct: w.win_rate_pct,
            realized_gross_pnl_inr: w.realized_gross_pnl_inr,
            realized_brokerage_and_taxes_inr: w.realized_brokerage_and_taxes_inr,
            realized_net_pnl_excl_brokerage_inr: w.realized_net_pnl_excl_brokerage_inr,
            days: w.days
        }))
    };

    writeJson(FILES.dailyJson, dailyPayload);
    writeJson(FILES.weeklyJson, weeklyPayload);

    // Write CSV Audit Spreadsheet with explicit Entry Date/Time & Exit Date/Time
    const csvRows = [
        'Status,Symbol,Exchange,Side,Qty,Entry_Date_IST,Entry_Time_IST,Entry_Price_INR,Exit_Date_IST,Exit_Time_IST,Exit_Or_Current_Price_INR,Strict_Stop_Loss_INR,Target_Price_INR,Gross_PnL_INR,Brokerage_And_Taxes_INR,Net_PnL_Excl_Brokerage_INR,Week_Start,Week_Friday,Exit_Reason'
    ];
    for (const tr of allTrades) {
        const netVal = tr.status === 'CLOSED' ? tr.net_pnl_excl_brokerage_inr : tr.live_net_pnl_inr;
        const grossVal = tr.status === 'CLOSED' ? tr.gross_pnl_inr : tr.live_gross_pnl_inr;
        csvRows.push([
            tr.status,
            tr.symbol,
            tr.exchange,
            tr.side,
            tr.qty,
            tr.entry_date_ist,
            `"${tr.entry_time_ist}"`,
            tr.entry_price_inr,
            tr.exit_date_ist,
            `"${tr.exit_time_ist}"`,
            tr.current_or_exit_price_inr,
            tr.strict_stop_loss_inr,
            tr.target_price_inr,
            grossVal,
            tr.brokerage_and_taxes_inr,
            netVal,
            tr.week_start,
            tr.week_friday,
            `"${String(tr.exit_reason).replace(/"/g, '""')}"`
        ].join(','));
    }
    fs.writeFileSync(FILES.csvFile, csvRows.join('\n') + '\n', 'utf8');

    return {
        daily: dailyPayload,
        weekly: weeklyPayload,
        files: {
            today_daily_md: path.join(DAILY_REPORTS_DIR, `${todayDate}.md`),
            current_weekly_md: path.join(WEEKLY_REPORTS_DIR, `WEEKLY_CONSOLIDATED_${currentWeekBounds.weekFriday}.md`),
            daily_md: FILES.dailyMd,
            weekly_md: FILES.weeklyMd,
            csv_file: FILES.csvFile
        }
    };
}

function syncReportsToGitHub(commitMsg = 'Auto-sync Daily & Weekly Paper Trade Reports to GitHub') {
    generateAllReports();
    try {
        execSync(`git -C "${ROOT_DIR}" add reports/ trader/`, { stdio: 'pipe' });
        const status = execSync(`git -C "${ROOT_DIR}" status --porcelain`, { encoding: 'utf8' }).trim();
        let committed = false;
        if (status.length > 0) {
            execSync(`git -C "${ROOT_DIR}" commit -m "${commitMsg}"`, { stdio: 'pipe' });
            committed = true;
        }
        const remotes = execSync(`git -C "${ROOT_DIR}" remote`, { encoding: 'utf8' }).trim();
        let pushed = false;
        let remoteUrl = null;
        if (remotes.includes('origin')) {
            remoteUrl = execSync(`git -C "${ROOT_DIR}" remote get-url origin`, { encoding: 'utf8' }).trim();
            execSync(`git -C "${ROOT_DIR}" pull --rebase -X ours origin main`, { stdio: 'pipe' });
            execSync(`git -C "${ROOT_DIR}" push -u origin main`, { stdio: 'pipe' });
            pushed = true;
        }
        return {
            success: true,
            committed,
            pushed,
            remote_url: remoteUrl,
            message: pushed
                ? `Daily & Weekly Reports saved & pushed to GitHub (${remoteUrl})`
                : 'Reports saved locally.'
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

module.exports = {
    FILES,
    DAILY_REPORTS_DIR,
    WEEKLY_REPORTS_DIR,
    generateAllReports,
    syncReportsToGitHub
};

if (require.main === module) {
    const out = generateAllReports();
    console.log('Generated Daily & Weekly Reports:', JSON.stringify(out.daily.summary_totals, null, 2));
}
