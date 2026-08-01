"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  theme: ThemeMode;
  messageNotifications: boolean;
  callNotifications: boolean;
  readReceipts: boolean;
  typingIndicator: boolean;
  language: string;
  appLockType: "none" | "pin" | "password" | "pattern";
  appLockHash: string | null;
  accountMode: "public" | "private";
  fontSize: "small" | "medium" | "large";
  fontFamily: "system" | "inter" | "roboto" | "serif" | "mono";
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  messageNotifications: true,
  callNotifications: true,
  readReceipts: true,
  typingIndicator: true,
  language: "English (US)",
  appLockType: "none",
  appLockHash: null,
  accountMode: "public",
  fontSize: "medium",
  fontFamily: "system",
};

const LOCAL_KEY = "my-messenger:settings";

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  loaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

function readLocalSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    
    // Migration: if the old appLockEnabled is true but no type is set, default to "pin"
    if (parsed.appLockEnabled && !parsed.appLockType) {
      parsed.appLockType = "pin";
      parsed.appLockHash = parsed.appLockPinHash || null;
    }
    
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applyThemeClass(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const shouldBeDark = theme === "dark" || (theme === "system" && systemDark);
  root.classList.toggle("dark", !!shouldBeDark);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load local (pre-auth / offline) settings immediately so theme doesn't flash.
  useEffect(() => {
    const local = readLocalSettings();
    setSettings(local);
    applyThemeClass(local.theme);
    setLoaded(true);
  }, []);

  // Once signed in, sync with (and prefer) the Firestore copy so settings
  // follow the user across devices.
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "private", "settings");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const parsed = snap.data() as Partial<AppSettings> & { appLockEnabled?: boolean, appLockPinHash?: string | null };
          
          if (parsed.appLockEnabled && !parsed.appLockType) {
            parsed.appLockType = "pin";
            parsed.appLockHash = parsed.appLockPinHash || null;
          }
          
          const merged = { ...DEFAULT_SETTINGS, ...parsed };
          setSettings(merged);
          applyThemeClass(merged.theme);
          window.localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
        } else {
          // First time for this user — seed Firestore with local/default settings.
          setDoc(ref, settings, { merge: true }).catch(() => {});
        }
      },
      () => {
        // Firestore unreachable / rules not deployed yet — keep using local settings.
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Re-apply the theme if the OS-level preference changes while on "system".
  useEffect(() => {
    if (settings.theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyThemeClass("system");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [settings.theme]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        }
        return next;
      });

      // Side effects outside the state updater
      if (patch.theme) {
        applyThemeClass(patch.theme);
      }
      if (patch.fontSize) {
        document.documentElement.setAttribute('data-font-size', patch.fontSize);
      }
      if (patch.fontFamily) {
        document.documentElement.setAttribute('data-font-family', patch.fontFamily);
      }
      
      if (user) {
        const ref = doc(db, "users", user.uid, "private", "settings");
        setDoc(ref, patch, { merge: true }).catch((e: any) => console.error("setDoc settings error:", e));

        // If accountMode is changed, sync it to the main user profile for discovery filtering
        if (patch.accountMode) {
          updateDoc(doc(db, "users", user.uid), {
            accountMode: patch.accountMode,
          }).catch((e: any) => console.error("updateDoc accountMode error:", e));
        }
      }
    },
    [user]
  );

  const value = useMemo(() => ({ settings, updateSettings, loaded }), [settings, updateSettings, loaded]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
