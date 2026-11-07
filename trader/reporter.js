/**
 * Indian Day-Trader Skill — Day-Wise & Weekly Consolidated Paper Trade Reporter + GitHub Auto-Sync
 *
 * Automatically generates:
 *   1. reports/DAILY_PAPER_TRADES.md      — Day-wise paper trade details (Gross, Brokerage/Taxes, Pure Net Profit)
 *   2. reports/WEEKLY_CONSOLIDATED_REPORT.md — Week-by-week consolidated performance & daily table
 *   3. reports/PAPER_TRADES_AUDIT.csv     — Excel-ready audit spreadsheet
 *   4. trader/daily_summary.json          — JSON backing the Day-Wise UI tab
 *   5. trader/weekly_summary.json         — JSON backing the Weekly Consolidated UI tab
 *   6. Auto-commits & pushes to GitHub repository (if remote 'origin' is configured)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TRADER_DIR = __dirname;
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');

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

function getWeekMonday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00+05:30');
    const day = d.getDay(); // 0=Sun, 1=Mon...
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function generateAllReports() {
    ensureDirs();
    const portfolio = readJson(FILES.portfolio, {
        account_budget_inr: 20000,
        mandatory_daily_profit_target_inr: 400,
        strict_max_loss_per_trade_inr: 100,
        active_position: null
    });
    const history = readJson(FILES.history, { closed_trades: [] });
    const closedTrades = history.closed_trades || [];
    const activePos = portfolio.active_position || null;

    // Combine active trade + closed trades into a unified list for Day-Wise & Weekly reporting
    const allTrades = [];
    if (activePos) {
        const dateStr = (activePos.opened_at_ist || new Date().toISOString()).slice(0, 10);
        allTrades.push({
            id: activePos.id || 'ACTIVE_NOW',
            date: dateStr,
            week_start: getWeekMonday(dateStr),
            status: 'OPEN (ACTIVE)',
            symbol: activePos.symbol,
            exchange: activePos.exchange || 'NSE',
            side: activePos.side || 'BUY',
            qty: activePos.qty,
            entry_price_inr: activePos.entry_price_inr,
            current_or_exit_price_inr: activePos.current_price_inr || activePos.entry_price_inr,
            strict_stop_loss_inr: activePos.strict_stop_loss_inr,
            target_price_inr: activePos.take_profit_target_inr,
            max_loss_at_stop_inr: activePos.max_loss_at_stop_inr,
            gross_pnl_inr: activePos.unrealized_gross_pnl_inr || 0,
            brokerage_and_taxes_inr: activePos.brokerage_and_taxes_inr || 0,
            net_pnl_excl_brokerage_inr: activePos.unrealized_net_pnl_excl_brokerage_inr || 0,
            target_net_profit_inr: activePos.net_profit_at_target_inr || 400,
            exit_reason: 'ACTIVE_MONITORING (Auto-Exit Armed for Target ₹' + activePos.take_profit_target_inr + ' / SL ₹' + activePos.strict_stop_loss_inr + ')',
            opened_at_ist: activePos.opened_at_ist,
            closed_at_ist: '-'
        });
    }

    for (const t of closedTrades) {
        const dateStr = (t.closed_at_ist || t.opened_at_ist || new Date().toISOString()).slice(0, 10);
        allTrades.push({
            id: t.id || 'CLOSED',
            date: dateStr,
            week_start: getWeekMonday(dateStr),
            status: 'CLOSED',
            symbol: t.symbol,
            exchange: t.exchange || 'NSE',
            side: t.side || 'BUY',
            qty: t.qty,
            entry_price_inr: t.entry_price_inr,
            current_or_exit_price_inr: t.exit_price_inr,
            strict_stop_loss_inr: t.strict_stop_loss_inr,
            target_price_inr: t.take_profit_target_inr,
            max_loss_at_stop_inr: t.max_loss_at_stop_inr,
            gross_pnl_inr: t.gross_pnl_inr || 0,
            brokerage_and_taxes_inr: t.brokerage_and_taxes_inr || 0,
            net_pnl_excl_brokerage_inr: t.net_pnl_excl_brokerage_inr || 0,
            target_net_profit_inr: t.net_profit_at_target_inr || 400,
            exit_reason: t.exit_reason || 'CLOSED',
            opened_at_ist: t.opened_at_ist || '-',
            closed_at_ist: t.closed_at_ist || '-'
        });
    }

    // Group by Day (YYYY-MM-DD)
    const daysMap = {};
    for (const tr of allTrades) {
        if (!daysMap[tr.date]) {
            daysMap[tr.date] = {
                date: tr.date,
                week_start: tr.week_start,
                daily_target_net_inr: 400,
                strict_daily_loss_limit_inr: 100,
                total_trades: 0,
                open_trades: 0,
                closed_trades: 0,
                wins: 0,
                losses: 0,
                realized_gross_pnl_inr: 0,
                realized_brokerage_and_taxes_inr: 0,
                realized_net_pnl_excl_brokerage_inr: 0,
                projected_net_pnl_at_target_inr: 0,
                trades: []
            };
        }
        const d = daysMap[tr.date];
        d.total_trades += 1;
        d.trades.push(tr);
        if (tr.status === 'CLOSED') {
            d.closed_trades += 1;
            if (tr.net_pnl_excl_brokerage_inr > 0) d.wins += 1;
            else d.losses += 1;
            d.realized_gross_pnl_inr = Number((d.realized_gross_pnl_inr + tr.gross_pnl_inr).toFixed(2));
            d.realized_brokerage_and_taxes_inr = Number((d.realized_brokerage_and_taxes_inr + tr.brokerage_and_taxes_inr).toFixed(2));
            d.realized_net_pnl_excl_brokerage_inr = Number((d.realized_net_pnl_excl_brokerage_inr + tr.net_pnl_excl_brokerage_inr).toFixed(2));
            d.projected_net_pnl_at_target_inr = Number((d.projected_net_pnl_at_target_inr + tr.net_pnl_excl_brokerage_inr).toFixed(2));
        } else {
            d.open_trades += 1;
            d.projected_net_pnl_at_target_inr = Number((d.projected_net_pnl_at_target_inr + tr.target_net_profit_inr).toFixed(2));
        }
    }

    const daysList = Object.values(daysMap).sort((a, b) => b.date.localeCompare(a.date));

    // Group by Week (Week Starting Monday YYYY-MM-DD)
    const weeksMap = {};
    for (const d of daysList) {
        if (!weeksMap[d.week_start]) {
            weeksMap[d.week_start] = {
                week_start: d.week_start,
                weekly_target_net_inr: 2000, // 5 trading days x ₹400/day
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
                projected_net_pnl_with_active_target_inr: 0,
                days: []
            };
        }
        const w = weeksMap[d.week_start];
        w.trading_days_active += 1;
        w.total_trades += d.total_trades;
        w.closed_trades += d.closed_trades;
        w.open_trades += d.open_trades;
        w.wins += d.wins;
        w.losses += d.losses;
        w.realized_gross_pnl_inr = Number((w.realized_gross_pnl_inr + d.realized_gross_pnl_inr).toFixed(2));
        w.realized_brokerage_and_taxes_inr = Number((w.realized_brokerage_and_taxes_inr + d.realized_brokerage_and_taxes_inr).toFixed(2));
        w.realized_net_pnl_excl_brokerage_inr = Number((w.realized_net_pnl_excl_brokerage_inr + d.realized_net_pnl_excl_brokerage_inr).toFixed(2));
        w.projected_net_pnl_with_active_target_inr = Number((w.projected_net_pnl_with_active_target_inr + d.projected_net_pnl_at_target_inr).toFixed(2));
        w.win_rate_pct = w.closed_trades > 0 ? Number(((w.wins / w.closed_trades) * 100).toFixed(1)) : 100;
        w.days.push({
            date: d.date,
            total_trades: d.total_trades,
            open_trades: d.open_trades,
            closed_trades: d.closed_trades,
            realized_gross_pnl_inr: d.realized_gross_pnl_inr,
            realized_brokerage_and_taxes_inr: d.realized_brokerage_and_taxes_inr,
            realized_net_pnl_excl_brokerage_inr: d.realized_net_pnl_excl_brokerage_inr,
            projected_net_pnl_at_target_inr: d.projected_net_pnl_at_target_inr
        });
    }

    const weeksList = Object.values(weeksMap).sort((a, b) => b.week_start.localeCompare(a.week_start));

    const dailyPayload = {
        generated_at: new Date().toISOString(),
        account_budget_inr: 20000,
        mandatory_daily_net_profit_inr: 400,
        strict_max_loss_per_trade_inr: 100,
        days: daysList
    };

    const weeklyPayload = {
        generated_at: new Date().toISOString(),
        account_budget_inr: 20000,
        weekly_net_profit_goal_inr: 2000,
        weeks: weeksList
    };

    writeJson(FILES.dailyJson, dailyPayload);
    writeJson(FILES.weeklyJson, weeklyPayload);

    // Write Markdown: reports/DAILY_PAPER_TRADES.md
    const dailyMdLines = [
        '# 📅 Day-Wise Paper Trade Audit Report (NSE & BSE)',
        `**Account Size:** ₹20,000 | **Mandatory Daily Target:** ₹400/day (Pure Net Profit Excluding Brokerage) | **Strict Stop-Loss:** Max ₹100/trade`,
        ''
    ];
    for (const d of daysList) {
        dailyMdLines.push(`## 🗓️ Date: ${d.date} (Week of ${d.week_start})`);
        dailyMdLines.push(`- **Trades Taken:** ${d.total_trades} (${d.open_trades} Open, ${d.closed_trades} Closed)`);
        dailyMdLines.push(`- **Realized Net Profit (Excl. Brokerage):** ₹${d.realized_net_pnl_excl_brokerage_inr} | **Brokerage & Govt Taxes Deducted:** ₹${d.realized_brokerage_and_taxes_inr}`);
        dailyMdLines.push(`- **Projected Net Profit (Including Active Target):** **+₹${d.projected_net_pnl_at_target_inr}** (Goal: ₹400/day)`);
        dailyMdLines.push('');
        dailyMdLines.push('| Status | Stock | Exch | Qty | Entry (₹) | Stop-Loss (₹) | Target (₹) | Max Loss (<=₹100) | Brokerage & Tax (₹) | Pure Net Profit at Target / Exit (₹) | Exit / Status Note |');
        dailyMdLines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
        for (const t of d.trades) {
            const netDisp = t.status === 'CLOSED' ? `₹${t.net_pnl_excl_brokerage_inr}` : `+₹${t.target_net_profit_inr} (Target)`;
            dailyMdLines.push(`| **${t.status}** | **${t.symbol}** | ${t.exchange} | ${t.qty} | ₹${t.entry_price_inr} | ₹${t.strict_stop_loss_inr} | ₹${t.target_price_inr} | ₹${t.max_loss_at_stop_inr} | ₹${t.brokerage_and_taxes_inr} | **${netDisp}** | ${t.exit_reason} |`);
        }
        dailyMdLines.push('');
    }
    fs.writeFileSync(FILES.dailyMd, dailyMdLines.join('\n') + '\n', 'utf8');

    // Write Markdown: reports/WEEKLY_CONSOLIDATED_REPORT.md
    const weeklyMdLines = [
        '# 📊 Weekly Consolidated Paper Trade Report (NSE & BSE)',
        `**Account Size:** ₹20,000 | **Weekly Net Target (5 Days × ₹400):** ₹2,000/week (100% Excluding Brokerage & Taxes)`,
        ''
    ];
    for (const w of weeksList) {
        weeklyMdLines.push(`## 📈 Week Starting Monday: ${w.week_start}`);
        weeklyMdLines.push(`- **Active Trading Days:** ${w.trading_days_active} | **Total Trades:** ${w.total_trades} (${w.open_trades} Open, ${w.closed_trades} Closed)`);
        weeklyMdLines.push(`- **Realized Gross Profit:** ₹${w.realized_gross_pnl_inr} | **Total Brokerage & Taxes Deducted:** ₹${w.realized_brokerage_and_taxes_inr}`);
        weeklyMdLines.push(`- **Realized Pure Net Profit:** **₹${w.realized_net_pnl_excl_brokerage_inr}** | **Projected Net Profit (with Active Trade Target):** **+₹${w.projected_net_pnl_with_active_target_inr}**`);
        weeklyMdLines.push('');
        weeklyMdLines.push('| Date | Total Trades | Open | Closed | Realized Gross (₹) | Brokerage & Taxes (₹) | Realized Net Profit (₹) | Projected Net Profit with Active Target (₹) |');
        weeklyMdLines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
        for (const dayRow of w.days) {
            weeklyMdLines.push(`| **${dayRow.date}** | ${dayRow.total_trades} | ${dayRow.open_trades} | ${dayRow.closed_trades} | ₹${dayRow.realized_gross_pnl_inr} | ₹${dayRow.realized_brokerage_and_taxes_inr} | ₹${dayRow.realized_net_pnl_excl_brokerage_inr} | **+₹${dayRow.projected_net_pnl_at_target_inr}** |`);
        }
        weeklyMdLines.push('');
    }
    fs.writeFileSync(FILES.weeklyMd, weeklyMdLines.join('\n') + '\n', 'utf8');

    // Write Excel CSV: reports/PAPER_TRADES_AUDIT.csv
    const csvRows = [
        'Date,Week_Start,Status,Symbol,Exchange,Side,Shares,Entry_Price_INR,Strict_Stop_Loss_INR,Target_Price_INR,Max_Loss_At_Stop_INR,Brokerage_And_Taxes_INR,Net_Profit_At_Target_Or_Exit_INR,Exit_Or_Status_Reason'
    ];
    for (const tr of allTrades) {
        const netVal = tr.status === 'CLOSED' ? tr.net_pnl_excl_brokerage_inr : tr.target_net_profit_inr;
        csvRows.push([
            tr.date,
            tr.week_start,
            tr.status,
            tr.symbol,
            tr.exchange,
            tr.side,
            tr.qty,
            tr.entry_price_inr,
            tr.strict_stop_loss_inr,
            tr.target_price_inr,
            tr.max_loss_at_stop_inr,
            tr.brokerage_and_taxes_inr,
            netVal,
            `"${String(tr.exit_reason).replace(/"/g, '""')}"`
        ].join(','));
    }
    fs.writeFileSync(FILES.csvFile, csvRows.join('\n') + '\n', 'utf8');

    return {
        daily: dailyPayload,
        weekly: weeklyPayload,
        files: {
            daily_md: FILES.dailyMd,
            weekly_md: FILES.weeklyMd,
            csv_file: FILES.csvFile
        }
    };
}

/**
 * Commit and push Day-Wise & Weekly Consolidated Reports to GitHub repository
 */
function syncReportsToGitHub(commitMsg = 'Auto-sync Day-Wise & Weekly Consolidated Paper Trade Reports') {
    generateAllReports();
    try {
        execSync(`git -C "${ROOT_DIR}" add reports/ trader/`, { stdio: 'pipe' });
        const status = execSync(`git -C "${ROOT_DIR}" status --porcelain`, { encoding: 'utf8' }).trim();
        let committed = false;
        if (status.length > 0) {
            execSync(`git -C "${ROOT_DIR}" commit -m "${commitMsg}"`, { stdio: 'pipe' });
            committed = true;
        }
        // Check if remote origin exists and push
        const remotes = execSync(`git -C "${ROOT_DIR}" remote`, { encoding: 'utf8' }).trim();
        let pushed = false;
        let remoteUrl = null;
        if (remotes.includes('origin')) {
            remoteUrl = execSync(`git -C "${ROOT_DIR}" remote get-url origin`, { encoding: 'utf8' }).trim();
            execSync(`git -C "${ROOT_DIR}" push -u origin main`, { stdio: 'pipe' });
            pushed = true;
        }
        return {
            success: true,
            committed,
            pushed,
            remote_url: remoteUrl,
            message: pushed
                ? `Saved Day-Wise & Weekly reports, committed to Git, and pushed to ${remoteUrl}`
                : 'Saved Day-Wise & Weekly reports and committed to local Git repository (add remote origin to push to GitHub).'
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
    generateAllReports,
    syncReportsToGitHub
};
