// app/lib/firebase.ts
// Firebase configuration + initialization for Bownd.
//
// Config comes ONLY from EXPO_PUBLIC_FIREBASE_* environment variables
// (see .env.example). No secrets are embedded in source.
// If the variables are missing, Firebase is NOT initialized and `db` /
// `auth` are null — the app falls back to bundled local data and shows a
// clear "backend not configured" state instead of crashing at launch.
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  type Auth,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const REQUIRED_VARS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

export const firebaseMissingVars: string[] = REQUIRED_VARS.filter(
  (k) => !process.env[k]
);

export const firebaseConfigured = firebaseMissingVars.length === 0;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (firebaseConfigured) {
  const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: process.env
      .EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
  };

  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);

  try {
    // React Native persistence keeps the session across app restarts.
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialized (e.g. dev hot reload) — reuse the instance.
    auth = getAuth(app);
  }
} else {
  console.warn(
    "[firebase] Missing EXPO_PUBLIC_FIREBASE_* vars: " +
      firebaseMissingVars.join(", ") +
      ". Running with local fallback data; auth disabled."
  );
}

export { app, db, auth };

/** Throw a clear, actionable error when Auth is used without configuration. */
export function requireAuth(): Auth {
  if (!auth) {
    throw new Error(
      "Firebase Auth is not configured. Add the EXPO_PUBLIC_FIREBASE_* values to your .env and restart."
    );
  }
  return auth;
}

/** Throw a clear, actionable error when Firestore is used without configuration. */
export function requireDb(): Firestore {
  if (!db) {
    throw new Error(
      "Firestore is not configured. Add the EXPO_PUBLIC_FIREBASE_* values to your .env and restart."
    );
  }
  return db;
}
