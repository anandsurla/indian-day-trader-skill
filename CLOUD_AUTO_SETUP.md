# 100% Cloud-Based Automatic Morning Runner (Laptop OFF)

Because GitHub's built-in `schedule` cron can be delayed or skipped during busy hours, pair [.github/workflows/daily_indian_trader.yml](.github/workflows/daily_indian_trader.yml) with **cron-job.org** (100% free) to trigger the workflow reliably every 5 minutes during market hours even when your laptop is OFF.

---

## Setup Steps on cron-job.org (~2 Minutes)

### Step 1: Create a Fine-Grained GitHub Token
1. Open **GitHub -> Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new token**
2. **Token name:** `SriKari-TradeBot-Scheduler`
3. **Repository access:** Only select repositories -> **`anandsurla/indian-day-trader-skill`**
4. **Permissions -> Repository permissions:**
   - **Actions:** `Read and write`
   - *(Everything else can stay `No access`)*
5. Click **Generate token** and copy the token (`github_pat_...`).

### Step 2: Create the 5-Minute Job on https://cron-job.org
1. Log in to **https://cron-job.org** -> **Create cronjob**
2. **Title:** `SriKari TradeBot 5m`
3. **URL:**
   ```
   https://api.github.com/repos/anandsurla/indian-day-trader-skill/actions/workflows/daily_indian_trader.yml/dispatches
   ```
4. **Execution schedule:** `Every 5 minutes`
   *(The workflow automatically skips in ~1 second outside Mon–Fri `09:15–15:40 IST` when no position is open, so leaving it on "Every 5 minutes" works cleanly with zero timezone errors.)*
5. Click **Advanced**:
   - **Request method:** `POST`
   - **Headers** *(add these exact 4 headers)*:
     - `Accept` : `application/vnd.github+json`
     - `Authorization` : `Bearer YOUR_GITHUB_PAT_HERE`
     - `X-GitHub-Api-Version` : `2022-11-28`
     - `User-Agent` : `SriKari-TradeBot-Scheduler`
   - **Request body:**
     ```json
     {"ref":"main"}
     ```
6. Click **Test run** (it should return `204 No Content` / Green Success) and click **Create**.

---

## Alternative: Render.com (`render.yaml`) + Pinger
If you deploy `anandsurla/indian-day-trader-skill` as a free Web Service on Render using `render.yaml`:
1. Add environment variable `GITHUB_TOKEN` (PAT with `Contents: Read and write`) on Render so trades push back to GitHub.
2. On `cron-job.org`, schedule `Every 5 minutes` (`GET`) to `https://<your-render-service>.onrender.com/api/tick`.
