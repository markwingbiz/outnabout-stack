# outnabout-stack

One repo for the whole ecosystem: three Expo apps, each with its own
`app.json`, EAS config, and build. Nothing is shared across apps except this
repo — each app is self-contained in its own directory.

| App | Directory | Package | Backend |
| --- | --- | --- | --- |
| Bownd (consumer events, venues, rewards) | `bownd/` | `com.vibekc.app` | Firebase Auth + Firestore |
| Livework (venue/business dashboard) | `livework/` | `com.livework.app` | Supabase |
| Livework+ (Control Center, Dates, Monfun Insights) | `livework-plus/` | `com.liveworkplus.app` | Supabase |

## Run one app

```bash
cd bownd          # or livework, or livework-plus
npm install
npx expo start
```

## Install note

Plain `npm ci` / `npm install` fails in these apps with an ERESOLVE peer
conflict (`react-dom@19.3.0` wants `react@^19.3.0`, the SDK 54 matrix pins
`react@19.1.0`). Install with:

```bash
npm ci --legacy-peer-deps
```

This installs the exact versions in the committed lockfiles; it does not
change any dependency.

## Environment

Each app has a `.env.example`. Copy it to `.env` in that app's directory and
fill in real values. `.env` is gitignored — never commit secrets.

- `bownd/`: Firebase client config (`EXPO_PUBLIC_FIREBASE_*`)
- `livework/`, `livework-plus/`: Supabase URL + anon key
  (`EXPO_PUBLIC_SUPABASE_*`)

## Builds

Build from inside the app directory, e.g. `cd bownd && eas build --platform
android --profile preview`. Each app keeps its own EAS project ID in its own
`app.json` / `eas.json`.

## History note

Bownd was previously developed in the `markwingbiz/vibekc` repo (branch
`muse/vibekc-recovery` + backend work). That repo is now archival — Bownd
lives here under `bownd/`, with its recovery fixes, mockup alignment, and
Firebase backend included.
