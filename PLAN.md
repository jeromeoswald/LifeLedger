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

## Phase 4 — Wallet + rates service ✅
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
- [x] `/fx/history` (done in Phase 5); → Phase 6: rates persisted on the device for offline use

## Phase 5 — Converter + reports + export ✅
- [x] Converter:
  - amount, From/To, swap, live result (computed on-device from the cached snapshot)
  - rate both ways, last-updated time, attribution
  - favourite pairs (default AED→INR, AED→USD, USD→INR; star to add/remove, saved per device)
  - multi-convert: the amount in every favourite currency
  - rate history chart (7d/30d/1y) with low/high/% change
- [x] `/fx/history`:
  - Frankfurter time series with fixed USD pegs (AED, SAR, QAR, OMR, BHD), since Frankfurter has no Gulf currencies
  - falls back to our stored daily snapshots; 6 h in-memory cache; max 370 days
- [x] Wallet reports (base currency, frozen amounts): income vs expense + net, spending by category, 6-month net trend, top 5 expenses; month navigation
- [x] CSV export of all transactions, including the frozen FX fields
  - web downloads a file (UTF-8 BOM, CRLF)
  - phones use the share sheet (as text)
  - formula-injection safe
- [x] Home dashboard: today's tasks, habits to tick, month spend vs budget, total balance (done in Phases 2–4)
- [x] Charts: plain-View column charts (web + native, no chart dependency)
- [x] Tests: month report, net trend across a year boundary, CSV escaping/injection, history (pegs, cache, snapshot fallback, range validation, endpoint)

## Phase 6 — Attendance & Man-hours ✅ (current, awaiting review)
- [x] Work tab: a segmented "Tasks | Attendance"; Home: a "Today's attendance" card with the 4 status buttons (one-tap)
- [x] Daily entry:
  - date picker (default today, Asia/Dubai), ‹ › arrows, tap for a calendar
  - past dates editable; future dates allow only Off and Sick Leave
- [x] Status: Present / Off / Absent / Sick Leave (green / gray / red / orange, with icons)
  - Off/Absent/Sick auto-save (0 h), with a "Saved" toast and Undo for 5 s
  - Present auto-saves 8 h (the default) + 0 OT
  - working hours 0–24 and OT 0–16 in 0.5 h steps, auto-saved after 600 ms ("Saving…" → "Saved")
  - working + OT ≤ 24 h: an inline error, and it isn't saved
  - switching away from Present asks to confirm, then clears the hours
  - an optional one-line note (auto-saved); unmarked days show "Not marked"
- [x] Week | Month views with ‹ ›; the week start is configurable (Monday by default)
  - month: a calendar grid coloured by status, with "8+2" on Present days; tap a day to open it
  - week: 7 rows (status, working h, OT h)
- [x] Summary:
  - days Present / Off / Absent / Sick / Not marked
  - total working h, total OT h, man-hours (working + OT), average working h per Present day
- [x] Stacked bar chart (working + OT): per day for the week, per week for the month
- [x] Month export to CSV and Excel (.xlsx): Date, Day, Status, Working h, OT h, Total h, Note
- [x] Settings (on the account): default working hours (8; affects new entries only), week start, show the Home card
- [x] API:
  - `attendance` collection (time stored as integer minutes, unique `{userId, date}`)
  - `GET /attendance?from&to`, `PUT /attendance/:date` (idempotent upsert), `DELETE /attendance/:date` (soft)
  - `GET /attendance/summary?period=week|month&date=`, `GET /export/attendance.csv|.xlsx?month=`
- [x] Optimistic updates (TanStack Query) with rollback + an error toast
- [x] Tests: summary maths (totals, averages, counts, Monday vs Sunday weeks, month boundaries), validation limits and future dates, idempotent upsert, leaving Present clears hours
- [x] New dependencies (approved): exceljs (API), expo-file-system + expo-sharing (real .csv/.xlsx files on the phone)

## Phase 7 — Offline sync & Release (after "Continue with Phase 7")
- [ ] Offline-first sync for all modules: tasks, time sessions, daily logs, habits, check-ins, accounts, categories, transactions, attendance, settings
  - one repository interface: expo-sqlite (Android/iOS) / IndexedDB (web)
  - every write goes to the local store first, then to a sync queue (create/update/delete with clientId + updatedAt)
  - `POST /api/v1/sync`: queued changes + lastSyncedAt in, server changes since then out
  - runs on app start, on reconnect, on return to the foreground, and every 5 min while open
  - conflicts: the latest updatedAt wins; deletes are soft
  - a header indicator: Synced / Syncing… / Offline (n pending)
  - cached exchange rates offline, labelled "Rates as of <date>"
- [ ] Notifications:
  - task alarms, habit reminders and budget alerts all verified
  - rescheduled after every sync; cancelled for deleted or completed items
  - Android: exact alarms + an alarm channel; iOS: time-sensitive
  - web: Web Push from an API scheduler (BullMQ or Agenda)
- [ ] PWA: manifest, icons, theme colour, an offline service worker, an "Install app" prompt
- [ ] Builds:
  - EAS: an Android APK (preview), then an AAB for the Play Store; an iOS profile ready
  - app icon, splash, name "LifeLedger", version 1.0.0
- [ ] Deploy:
  - API on Render or Railway + MongoDB Atlas: env vars from .env.example, CORS for the web domain, HTTPS only, helmet, rate limiting, `/health`
  - web: the Expo web export on Vercel or Netlify, with API_URL pointing at production
- [ ] GitHub Actions: lint + type-check + tests on every push
- [ ] Tests:
  - offline create → reconnect → appears on another device
  - two devices edit the same record → the latest wins
  - a delete propagates
  - README manual checklist: airplane mode, PWA install, APK install
- [ ] Hand-over: the EAS APK link, the live web URL, the API URL, and a release checklist
