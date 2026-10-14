import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";

import { auth, requireAuth, firebaseConfigured } from "./firebase";
import {
  ensureUserProfile,
  getUserProfile,
  seedEventsIfEmpty,
  type UserProfile,
} from "./store";

export type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          await ensureUserProfile(u.uid, u.email, u.displayName);
          const p = await getUserProfile(u.uid);
          setProfile(p);
          // Seed demo events/venues on first signed-in launch (no-op if seeded).
          seedEventsIfEmpty().catch(() => {});
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signIn(email: string, password: string) {
    const a = requireAuth();
    await signInWithEmailAndPassword(a, email.trim(), password);
  }

  async function signUp(email: string, password: string, displayName: string) {
    const a = requireAuth();
    const cred = await createUserWithEmailAndPassword(a, email.trim(), password);
    const name = displayName.trim();
    if (name) {
      await updateProfile(cred.user, { displayName: name });
    }
    await ensureUserProfile(cred.user.uid, cred.user.email, name || null);
  }

  async function signOut() {
    if (auth) await fbSignOut(auth);
    setUser(null);
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) {
      setProfile(await getUserProfile(user.uid));
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        configured: firebaseConfigured,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
