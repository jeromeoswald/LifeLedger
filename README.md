# LifeLedger

Personal productivity and finance app: tasks, habits, wallet and a currency converter. One Expo codebase runs on Android, iOS and the web, backed by an Express + MongoDB API.

The full spec and phase checklist are in [PLAN.md](PLAN.md). **Phase 1 (foundation + auth) is done.**

```
apps/api         Express + Mongoose API (auth now; tasks/habits/wallet/fx/sync later)
apps/mobile      Expo app (Expo Router, NativeWind, TanStack Query, Zustand)
packages/shared  Types, Zod schemas, ISO 4217 currency table, money helpers
```

## Prerequisites
- Node.js 20+ (developed on Node 26).
- MongoDB:
  - **local**: `winget install MongoDB.Server` (runs as a Windows service on port 27017);
  - **or** a free MongoDB Atlas cluster (put its connection string in `MONGODB_URI`).
- On your phone: **Expo Go** from the Play Store or App Store.

## First-time setup
```bash
npm install
cp apps/api/.env.example apps/api/.env        # then put two long random strings in the JWT_* secrets
cp apps/mobile/.env.example apps/mobile/.env
npm run seed                                  # creates demo@lifeledger.app / Demo1234!
```
Generate each JWT secret with:
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

## Run the API
```bash
npm run dev:api          # http://localhost:4000  (health: /api/v1/health)
```
In development, password-reset codes are **printed in this terminal** instead of being emailed.

## Run the app in a browser
```bash
npm run dev:app          # then press  w
```
It opens at http://localhost:8081. Use a window wider than 768 px to see the sidebar.

## Run the app on your phone (Expo Go)
1. Phone and PC must be on the **same Wi-Fi**.
2. Find your PC's IP: run `ipconfig` and look for the IPv4 address of your Wi-Fi adapter, e.g. `192.168.1.20`.
3. Edit `apps/mobile/.env` to `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000`, using your IP.
4. Allow the API through Windows Firewall once, in an **admin** PowerShell:
   `New-NetFirewallRule -DisplayName "LifeLedger API" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow -Profile Private`
5. Start `npm run dev:api`, then `npm run dev:app`. Scan the QR code with Expo Go (Android), or with the Camera app on iPhone.
   - If the phone can't connect, run `npx expo start --tunnel` inside `apps/mobile`.

Note: in Expo Go, fingerprint unlock works on Android. **Face ID needs a development or EAS build on iPhone**; Expo Go cannot use it. The PIN works everywhere.

## Build an Android APK (EAS)
```bash
npm i -g eas-cli
cd apps/mobile
eas login                     # free Expo account
eas build -p android --profile preview
```
When it finishes, EAS prints a link and QR code to download and install the `.apk`.
The `preview` profile in `eas.json` points the APK at this PC over Wi-Fi (`EXPO_PUBLIC_API_URL=http://192.168.1.29:4000`). If your PC's IP changes, update it there and rebuild.
`expo-build-properties` allows plain http only for this; switch to the deployed https API in Phase 6.

## Checks
```bash
npm test          # Vitest: money maths + API auth (needs MongoDB running; uses the lifeledger_test DB)
npm run typecheck
npm run lint
```

## How auth works (Phase 1)
- **Access token**: a JWT valid for 15 min, kept in memory.
- **Refresh token**: random, valid for 30 days.
  - It rotates on every use. The server stores only an HMAC of it, in the `sessions` collection.
  - Replaying an already-rotated token signs out every device.
  - Native apps keep it in the Keychain/Keystore (expo-secure-store). The web keeps it in an `httpOnly` cookie. "Remember this device" off means a browser-session cookie and a 1-day session.
- **Sign-in lockout**: 5 wrong passwords within 15 min lock the account for 15 min.
- **Reset codes**: 6 digits, valid for 10 min. A code is burned after 5 wrong tries, and a successful reset signs out every device.
- **App lock** (optional, per device): None / PIN / Biometric with the PIN as backup.
  - The refresh token is read from secure storage only after a successful unlock.
  - 3 failed biometric tries fall back to the PIN. 5 wrong PINs require a full password sign-in.
  - On the web, the PIN is a convenience lock for that browser.
