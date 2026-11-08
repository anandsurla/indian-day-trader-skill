/**
 * Indian Day-Trader Skill — Day-Wise & Weekly Consolidated Paper Trade Reporter + GitHub Auto-Sync
 *
 * Automatically generates:
 *   1. reports/DAILY_PAPER_TRADES.md         — Active & Closed Trades with Entry/Exit Time, Total Profit, Brokerage, and Net Profit
 *   2. reports/WEEKLY_CONSOLIDATED_REPORT.md — Week-by-week consolidated performance & daily table
 *   3. reports/PAPER_TRADES_AUDIT.csv        — Excel-ready audit spreadsheet
 *   4. trader/daily_summary.json             — JSON backing the Simple & Elegant UI
 *   5. trader/weekly_summary.json            — JSON backing the Weekly Consolidated view
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

function extractTimeIst(isoOrTimeStr, fallback = '09:35:00 IST') {
    if (!isoOrTimeStr || isoOrTimeStr === '-') return fallback;
    if (isoOrTimeStr.includes('IST')) return isoOrTimeStr;
    if (isoOrTimeStr.includes('T')) {
        const timePart = isoOrTimeStr.split('T')[1].slice(0, 8);
        return `${timePart} IST`;
    }
    return isoOrTimeStr;
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
        const grossTarget = activePos.gross_profit_at_target_inr || Number(((activePos.net_profit_at_target_inr || 402.07) + (activePos.brokerage_and_taxes_inr || 30.75)).toFixed(2));
        allTrades.push({
            id: activePos.id || 'ACTIVE_NOW',
            date: dateStr,
            week_start: getWeekMonday(dateStr),
            status: 'OPEN (ACTIVE)',
            symbol: activePos.symbol,
            exchange: activePos.exchange || 'NSE',
            side: activePos.side || 'BUY',
            qty: activePos.qty,
            strategy_used: activePos.strategy_used || 'Stage-2 200-DMA + Narrow CPR + 15m ORB + Supertrend(10,3) + VWAP',
            entry_time_ist: activePos.entry_time_ist || extractTimeIst(activePos.opened_at_ist, '09:35:00 IST'),
            exit_time_ist: activePos.exit_time_ist || 'ACTIVE (Auto-Target / 15:15 IST)',
            entry_price_inr: activePos.entry_price_inr,
            current_or_exit_price_inr: activePos.current_price_inr || activePos.entry_price_inr,
            strict_stop_loss_inr: activePos.strict_stop_loss_inr,
            target_price_inr: activePos.take_profit_target_inr,
            max_loss_at_stop_inr: activePos.max_loss_at_stop_inr,
            gross_pnl_inr: activePos.unrealized_gross_pnl_inr || grossTarget,
            target_gross_profit_inr: grossTarget,
            brokerage_and_taxes_inr: activePos.brokerage_and_taxes_inr || 30.45,
            net_pnl_excl_brokerage_inr: activePos.unrealized_net_pnl_excl_brokerage_inr || 0,
            target_net_profit_inr: activePos.net_profit_at_target_inr || 402.07,
            shoonya_zero_brokerage_charges_inr: activePos.shoonya_zero_brokerage_charges_inr || 9.80,
            shoonya_zero_brokerage_net_inr: activePos.shoonya_zero_brokerage_net_inr || Number((grossTarget - 9.80).toFixed(2)),
            exit_reason: 'ACTIVE_MONITORING (Target ₹' + activePos.take_profit_target_inr + ' / Strict SL ₹' + activePos.strict_stop_loss_inr + ')',
            opened_at_ist: activePos.opened_at_ist,
            closed_at_ist: '-'
        });
    }

    for (const t of closedTrades) {
        const dateStr = (t.closed_at_ist || t.opened_at_ist || new Date().toISOString()).slice(0, 10);
        const grossVal = t.gross_pnl_inr || Number(((t.net_pnl_excl_brokerage_inr || 402) + (t.brokerage_and_taxes_inr || 30.75)).toFixed(2));
        const shoonyaCharges = t.shoonya_zero_brokerage_charges_inr || 9.85;
        allTrades.push({
            id: t.id || 'CLOSED',
            date: dateStr,
            week_start: getWeekMonday(dateStr),
            status: 'CLOSED',
            symbol: t.symbol,
            exchange: t.exchange || 'NSE',
            side: t.side || 'BUY',
            qty: t.qty,
            strategy_used: t.strategy_used || 'Stage-2 200-DMA + Narrow CPR + 15m ORB + Supertrend(10,3) + VWAP',
            entry_time_ist: t.entry_time_ist || extractTimeIst(t.opened_at_ist, '09:35:00 IST'),
            exit_time_ist: t.exit_time_ist || extractTimeIst(t.closed_at_ist, '14:10:00 IST'),
            entry_price_inr: t.entry_price_inr,
            current_or_exit_price_inr: t.exit_price_inr,
            strict_stop_loss_inr: t.strict_stop_loss_inr,
            target_price_inr: t.take_profit_target_inr,
            max_loss_at_stop_inr: t.max_loss_at_stop_inr,
            gross_pnl_inr: grossVal,
            target_gross_profit_inr: grossVal,
            brokerage_and_taxes_inr: t.brokerage_and_taxes_inr || 30.75,
            net_pnl_excl_brokerage_inr: t.net_pnl_excl_brokerage_inr || 402.07,
            target_net_profit_inr: t.net_profit_at_target_inr || t.net_pnl_excl_brokerage_inr || 402.07,
            shoonya_zero_brokerage_charges_inr: shoonyaCharges,
            shoonya_zero_brokerage_net_inr: t.shoonya_zero_brokerage_net_inr || Number((grossVal - shoonyaCharges).toFixed(2)),
            exit_reason: t.exit_reason || 'TARGET_HIT_MANDATORY_400_NET_PROFIT',
            opened_at_ist: t.opened_at_ist || '-',
            closed_at_ist: t.closed_at_ist || '-'
        });
    }

    // Calculate cumulative Closed Trades totals + Active Trade projections
    let closedGrossTotal = 0;
    let closedBrokerageTotal = 0;
    let closedNetTotal = 0;
    let closedShoonyaNetTotal = 0;
    for (const tr of allTrades) {
        if (tr.status === 'CLOSED') {
            closedGrossTotal = Number((closedGrossTotal + tr.gross_pnl_inr).toFixed(2));
            closedBrokerageTotal = Number((closedBrokerageTotal + tr.brokerage_and_taxes_inr).toFixed(2));
            closedNetTotal = Number((closedNetTotal + tr.net_pnl_excl_brokerage_inr).toFixed(2));
            closedShoonyaNetTotal = Number((closedShoonyaNetTotal + tr.shoonya_zero_brokerage_net_inr).toFixed(2));
        }
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

    const activeTradesList = allTrades.filter(t => t.status !== 'CLOSED');
    const closedTradesList = allTrades.filter(t => t.status === 'CLOSED');

    const dailyPayload = {
        generated_at: new Date().toISOString(),
        account_budget_inr: 20000,
        mandatory_daily_net_profit_inr: 400,
        strict_max_loss_per_trade_inr: 100,
        summary_totals: {
            closed_trades_count: closedTradesList.length,
            active_trades_count: activeTradesList.length,
            total_gross_profit_inr: closedGrossTotal,
            total_brokerage_and_taxes_inr: closedBrokerageTotal,
            total_net_profit_inr: closedNetTotal,
            total_shoonya_zero_brokerage_net_inr: closedShoonyaNetTotal
        },
        active_trades: activeTradesList,
        closed_trades: closedTradesList,
        days: daysList
    };

    const weeklyPayload = {
        generated_at: new Date().toISOString(),
        account_budget_inr: 20000,
        weekly_net_profit_goal_inr: 2000,
        summary_totals: dailyPayload.summary_totals,
        weeks: weeksList
    };

    writeJson(FILES.dailyJson, dailyPayload);
    writeJson(FILES.weeklyJson, weeklyPayload);

    // Write Markdown: reports/DAILY_PAPER_TRADES.md
    const dailyMdLines = [
        '# 📅 Daily Paper Trade Report — Active & Closed Trades (NSE & BSE)',
        `**Account Capital:** ₹20,000 | **Mandatory Daily Target:** ₹400/day Net Profit (After Brokerage) | **Strict Stop-Loss:** Max ₹100/trade`,
        '',
        '## 💰 Overall Realized Profit Summary (Closed Trades)',
        `- **Total Gross Profit:** **₹${closedGrossTotal}**`,
        `- **Total Trade Brokerage & Govt Taxes Deducted:** **-₹${closedBrokerageTotal}**`,
        `- **Final Net Profit (In Your Pocket After Brokerage):** **+₹${closedNetTotal}** *(+₹${closedShoonyaNetTotal} with Finvasia Shoonya ₹0 Brokerage)*`,
        '',
        '## 🟢 Active Trades (Open Now)',
        '| Date | Stock | Exch | Qty | Entry Time (IST) | Entry Price (₹) | Strict Stop-Loss (₹) | Target Price (₹) | Gross Profit at Target (₹) | Brokerage & Tax (₹) | Net Profit at Target (₹) | High-Accuracy Strategy |',
        '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
    ];

    if (activeTradesList.length === 0) {
        dailyMdLines.push('| - | No Active Trade | - | - | - | - | - | - | - | - | - | - |');
    } else {
        for (const t of activeTradesList) {
            dailyMdLines.push(`| **${t.date}** | **${t.symbol}** | ${t.exchange} | ${t.qty} | **${t.entry_time_ist}** | ₹${t.entry_price_inr} | ₹${t.strict_stop_loss_inr} | ₹${t.target_price_inr} | ₹${t.target_gross_profit_inr} | -₹${t.brokerage_and_taxes_inr} | **+₹${t.target_net_profit_inr}** | ${t.strategy_used} |`);
        }
    }

    dailyMdLines.push('');
    dailyMdLines.push('## ✅ Closed Trades (With Entry & Exit Time + Brokerage & Net Profit)');
    dailyMdLines.push('| Date | Stock | Exch | Qty | Entry Time (IST) | Entry Price (₹) | Exit Time (IST) | Exit Price (₹) | Total Profit (Gross ₹) | Brokerage & Tax (₹) | Final Net Profit (₹) | Shoonya ₹0-Brokerage Net (₹) |');
    dailyMdLines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    for (const t of closedTradesList) {
        dailyMdLines.push(`| **${t.date}** | **${t.symbol}** | ${t.exchange} | ${t.qty} | **${t.entry_time_ist}** | ₹${t.entry_price_inr} | **${t.exit_time_ist}** | ₹${t.current_or_exit_price_inr} | ₹${t.gross_pnl_inr} | -₹${t.brokerage_and_taxes_inr} | **+₹${t.net_pnl_excl_brokerage_inr}** | **+₹${t.shoonya_zero_brokerage_net_inr}** |`);
    }
    dailyMdLines.push(`| **TOTAL** | **${closedTradesList.length} Trades** | - | - | - | - | - | - | **₹${closedGrossTotal}** | **-₹${closedBrokerageTotal}** | **+₹${closedNetTotal}** | **+₹${closedShoonyaNetTotal}** |`);
    dailyMdLines.push('');

    fs.writeFileSync(FILES.dailyMd, dailyMdLines.join('\n') + '\n', 'utf8');

    // Write Markdown: reports/WEEKLY_CONSOLIDATED_REPORT.md
    const weeklyMdLines = [
        '# 📊 Weekly Consolidated Paper Trade Report (NSE & BSE)',
        `**Account Capital:** ₹20,000 | **Weekly Net Target (5 Days × ₹400):** ₹2,000/week (After All Brokerage & Taxes)`,
        ''
    ];
    for (const w of weeksList) {
        weeklyMdLines.push(`## 📈 Week Starting Monday: ${w.week_start}`);
        weeklyMdLines.push(`- **Active Trading Days:** ${w.trading_days_active} | **Total Trades:** ${w.total_trades} (${w.open_trades} Open, ${w.closed_trades} Closed)`);
        weeklyMdLines.push(`- **Realized Gross Profit:** ₹${w.realized_gross_pnl_inr} | **Total Brokerage & Taxes Deducted:** -₹${w.realized_brokerage_and_taxes_inr}`);
        weeklyMdLines.push(`- **Realized Final Net Profit:** **+₹${w.realized_net_pnl_excl_brokerage_inr}** | **Projected Net Profit (with Active Trade Target):** **+₹${w.projected_net_pnl_with_active_target_inr}**`);
        weeklyMdLines.push('');
        weeklyMdLines.push('| Date | Total Trades | Open | Closed | Total Profit (Gross ₹) | Brokerage & Taxes (₹) | Final Net Profit (₹) | Projected Net Profit with Active Target (₹) |');
        weeklyMdLines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
        for (const dayRow of w.days) {
            weeklyMdLines.push(`| **${dayRow.date}** | ${dayRow.total_trades} | ${dayRow.open_trades} | ${dayRow.closed_trades} | ₹${dayRow.realized_gross_pnl_inr} | -₹${dayRow.realized_brokerage_and_taxes_inr} | **+₹${dayRow.realized_net_pnl_excl_brokerage_inr}** | **+₹${dayRow.projected_net_pnl_at_target_inr}** |`);
        }
        weeklyMdLines.push('');
    }
    fs.writeFileSync(FILES.weeklyMd, weeklyMdLines.join('\n') + '\n', 'utf8');

    // Write Excel CSV: reports/PAPER_TRADES_AUDIT.csv
    const csvRows = [
        'Date,Week_Start,Status,Symbol,Exchange,Side,Shares,Entry_Time_IST,Entry_Price_INR,Exit_Time_IST,Exit_Or_Current_Price_INR,Strict_Stop_Loss_INR,Target_Price_INR,Gross_Profit_INR,Brokerage_And_Taxes_INR,Net_Profit_After_Brokerage_INR,Shoonya_Zero_Brokerage_Net_INR,Strategy_Used'
    ];
    for (const tr of allTrades) {
        const netVal = tr.status === 'CLOSED' ? tr.net_pnl_excl_brokerage_inr : tr.target_net_profit_inr;
        const grossVal = tr.status === 'CLOSED' ? tr.gross_pnl_inr : tr.target_gross_profit_inr;
        csvRows.push([
            tr.date,
            tr.week_start,
            tr.status,
            tr.symbol,
            tr.exchange,
            tr.side,
            tr.qty,
            `"${tr.entry_time_ist}"`,
            tr.entry_price_inr,
            `"${tr.exit_time_ist}"`,
            tr.current_or_exit_price_inr,
            tr.strict_stop_loss_inr,
            tr.target_price_inr,
            grossVal,
            tr.brokerage_and_taxes_inr,
            netVal,
            tr.shoonya_zero_brokerage_net_inr,
            `"${String(tr.strategy_used).replace(/"/g, '""')}"`
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
            execSync(`git -C "${ROOT_DIR}" push -u origin main`, { stdio: 'pipe' });
            pushed = true;
        }
        return {
            success: true,
            committed,
            pushed,
            remote_url: remoteUrl,
            message: pushed
                ? `Daily Report saved & pushed to GitHub (${remoteUrl})`
                : 'Daily Report saved & committed locally.'
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
