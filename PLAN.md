# LifeLedger — Plan

Personal productivity + finance app for one user (Jerome, Dubai, base currency AED).
One codebase for Android, iOS and web, with data synced across devices.

## Tech stack
- npm workspaces monorepo:
  - `apps/mobile`: Expo (latest SDK), TypeScript, Expo Router, NativeWind
  - `apps/api`: Node.js + Express + TypeScript + Mongoose
  - `packages/shared`: types, Zod schemas, ISO 4217 currency table (code/name/symbol/minor digits), money maths
- Client: TanStack Query (server state), Zustand (UI/settings). Offline storage behind one repository interface: expo-sqlite on native, IndexedDB on web.
- DB: MongoDB (Atlas in prod, local in dev).
- Auth: email + password, bcrypt, JWT access token (15 min) + refresh token (30 d).
  - Refresh tokens rotate on every use and are stored hashed in a `sessions` collection; logout and log-out-all revoke them.
  - Native keeps tokens in expo-secure-store; web uses an httpOnly cookie.
  - Sign-in is rate-limited: 5 tries per 15 min, then a 15-min lock.
  - Password reset uses a 6-digit email code valid for 10 min.
- Optional app lock: None / PIN (4–6 digits, hashed on device) / Biometric with PIN backup.
  - The biometric option is hidden without hardware or enrollment.
  - 3 biometric failures fall back to the PIN; 5 wrong PINs require a password sign-in.
  - Auto-lock after: immediate / 1 min (default) / 5 / 15 / never.
- Charts: victory-native or react-native-gifted-charts (web-compatible). Notifications: expo-notifications.
- Zod validation on client and server, from the shared package.

## Money & rate rules
- Store integer `amountMinor` + currency code. Do all multiplication and division with decimal.js; never floats.
- Each transaction stores `fxRateToBase`, `amountBaseMinor`, `rateDate` and `rateSource`. History never changes when rates move.
- Showing an amount in another currency uses the latest rate and is labelled "approx."
- A `RateProvider` interface in the API.
  - Primary: the ExchangeRate-API open endpoint (with its attribution).
  - Fallback and history: Frankfurter.
  - Cache in `fxRates` for 6 h; refresh daily at 06:00 Asia/Dubai.
  - Fetch with a USD base: rate(A→B) = rate(USD→B) / rate(USD→A).
- Offline: show the cached rates with "Rates as of <date>".
- Endpoints: `GET /api/v1/fx/currencies`, `/fx/latest?base=`, `/fx/convert?from=&to=&amount=`, `/fx/history?from=&to=&start=&end=`.

## Sync
- Every record has clientId (UUID), userId, createdAt, updatedAt, deletedAt (soft delete).
- Offline queue. `POST /api/v1/sync` sends the pending changes + `lastSyncedAt` and returns the server changes since then. The latest `updatedAt` wins.

## UI
- 5 tabs: Home, Work, Habits, Wallet, Converter. Bottom tabs on mobile; a left sidebar on web wider than 768 px. Settings sits behind the avatar.
- A floating "+" on Work, Habits and Wallet. Light/dark theme, responsive, 44 px tap targets, en-AE formatting.

---

## Phase 1 — Foundation + auth ✅
- [x] Monorepo, strict TS, ESLint + Prettier
- [x] shared: currency table, money helpers (toMinor/fromMinor/format), auth Zod schemas
- [x] API: User + Session models, register/login/refresh(rotating)/logout/logout-all/me, lockout, forgot/reset code (console mailer)
- [x] App: Welcome, Sign in, Create account (base currency), Forgot password, App lock, Settings > Security
- [x] Five-tab shell with placeholder screens, bottom tabs on phones and a sidebar on wide web, light/dark theme
- [x] Tests: money rounding per currency, auth flows
- [x] .env.example files, seed (demo user), README

## Phase 2 — Daily Work ✅
- [x] Tasks CRUD:
  - title, notes, project
  - priority: Low / Medium / High / Urgent
  - status: To do / In progress / Blocked / Done
  - due date + optional time, estimate
  - recurrence: daily / weekly on chosen days / monthly, every N
- [x] API: generic synced collections (`/tasks`, `/time-sessions`, `/daily-logs`)
  - PUT by clientId, latest updatedAt wins, soft delete
- [x] Optional task alarms, phone side (expo-notifications):
  - exact time or N minutes before due; more than one per task
  - Reminder or Alarm style (Alarm: max-priority channel, re-fires every minute up to 2 times)
  - Done / Snooze 5-10-15 / Open (Android shows the first three: Done, Snooze 10, Open)
  - recurring tasks re-arm on the next occurrence; completing or deleting a task cancels its alarms (all alarms are rescheduled from the task list)
- [ ] → Phase 6: Web Push via an API scheduler; Android exact alarms + full-screen ringing alarm (needs a dev build); handling Done/Snooze while the app is fully closed
- [x] Start/stop timer → time sessions (one at a time)
- [x] Today view (overdue + today + carried over), daily log (done / blockers / tomorrow)
- [x] Reports: tasks done and hours per day/week/month, by project
- [x] Seed: 5 tasks
- [x] Tests: dates/time zones/DST, recurrence, today grouping, report maths, synced API

## Phase 3 — Habits ✅
- [x] Habit types: yes-no / count / duration (minutes), with a daily target
- [x] Schedules: daily / chosen weekdays / X per week (Monday-start weeks)
- [x] One-tap check-in, edit past days, archive/unarchive, delete
  - yes/no toggles; count +1; duration +5
  - past days via the 7-day strip, the heatmap, or the day editor
- [x] Current and best streak, 30-day completion %, 17-week heatmap
  - local dates in the user's time zone
  - a pending today (or running week) never breaks a streak
- [x] Reminder per habit (repeating local notification on scheduled days; web in Phase 6)
- [x] Day notes (added on request):
  - an optional note per habit per day, up to 500 characters, e.g. "Pages 45–72"
  - editable for any day; "Recent notes" list on the habit screen; today's note shown on the habit card
- [x] API: `/habits`, `/habit-entries` (same synced router)
- [x] Home: habits to tick today
- [x] Tests: streaks across month/year boundaries, time zones, weekday and X-per-week schedules, back-filled days, latest edit wins
- [x] Seed: 3 habits + 2 weeks of check-ins

## Phase 4 — Wallet + rates service ✅ (current)
- [x] Accounts (cash/bank/card/savings), each with its own currency + opening balance; archive
- [x] Transactions in any currency: income / expense / transfer
  - paying in a foreign currency moves the account by its own-currency equivalent
  - cross-currency transfers store both amounts + the effective rate (editable to match the bank)
  - each transaction freezes `fxRateToBase`, `amountBaseMinor`, `rateDate`, `rateSource` (+ `baseCurrency`); the server rejects mismatches
- [x] Categories with monthly budgets: 80% / 100% alerts (in-app toast + phone notification), bars on Wallet and Home
- [x] Recurring entries: weekly/monthly; due ones are posted when the app opens, with a deterministic id per date (no double-posting across devices); pause/stop
- [x] Rates service:
  - RateProvider: ExchangeRate-API primary, Frankfurter fallback (merged over the last snapshot, since Frankfurter has no AED)
  - `fxRates` cache for 6 h, stale copy served if both providers fail, daily refresh at 06:00 Asia/Dubai
  - endpoints: `/fx/currencies`, `/fx/latest?base=`, `/fx/convert`
- [x] Add Transaction screen: amount pad, currency picker (favourites first), live "≈ AED x", category chips
- [x] Display currency switch in the header (latest rates, labelled "approx."); "Rates as of …" + attribution
- [x] Home: total balance + this month's spend vs budget
- [x] Tests: cross rates, rounding per currency (JPY/KWD), budget % + alert crossing, balances, transfers, recurring dates, rates cache/fallback/stale/503, fx endpoints
- [x] Seed: Cash AED, Bank AED, Bank INR, 8 categories (4 with budgets), 7 sample transactions
- [ ] → Phase 5: `/fx/history` (with the converter's history chart); → Phase 6: rates persisted on the device for offline use

## Phase 5 — Converter + reports + export
- [ ] Converter:
  - amount, From/To, swap, live result
  - rate both ways, last-updated time
  - favourite pairs, multi-convert to all favourites
  - rate history chart (7d/30d/1y)
- [ ] Wallet reports: income vs expense, by category, net trend, top expenses
- [ ] CSV export
- [ ] Home dashboard: today's tasks, habits to tick, month spend vs budget, total balance

## Phase 6 — Offline sync + notifications + PWA + builds
- [ ] Repository interface: expo-sqlite (native) / IndexedDB (web)
- [ ] Offline queue + `POST /api/v1/sync`, latest-updatedAt-wins merge (with tests)
- [ ] Notifications:
  - Android: exact alarms + an alarm channel
  - iOS: time-sensitive notifications
  - web: Web Push through an API scheduler
  - each device re-schedules its local alarms after sync
- [ ] PWA manifest + service worker
- [ ] EAS builds (APK), deploy the API + Atlas
