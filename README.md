# 🇮🇳 Indian Day-Trader Skill (NSE & BSE Standalone Autonomous Engine)

100% standalone Indian Market (**NSE `.NS` & BSE `.BO`**) conversion of the 11-module `day-trader-skill` pack.
Runs completely independently from `SriKari Stock Invest` (`MOD`) on **Port `3001`**.

## Configured Rules (Anand Surla)
- **Budget (`budget`)**: `₹20,000` (`20000`)
- **Daily Net Profit Target**: `₹400 / day` (`+2.0%` after all Indian brokerage, STT, GST, SEBI & stamp duty)
- **Strict Stop-Loss (`max_loss_per_trade_usd` / `_inr`)**: `Max ₹100 / trade`
- **Strict Daily Loss Limit (`max_daily_loss_usd` / `_inr`)**: `Max ₹100 / day`
- **Paper Trading (`paper`)**: `true` (default)
- **SEC User-Agent (`sec_user_agent`)**: `"Anand Surla anand.bvc@gmail.com"`
- **Market Session**: `09:15–15:30 IST` (`Asia/Kolkata`), 15-min Opening Range `09:15–09:30 IST`, Mandatory MIS Square-Off `15:15 IST`

## Quick Start
```powershell
cd C:\Users\Anand\Desktop\Indian-Day-Trader-Skill
node trader/indian_trader.js auto
node server.js
```
Open **`http://localhost:3001`** in your browser.
