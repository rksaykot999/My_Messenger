"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from "firebase/auth";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  status: string;
}

interface AuthContextValue {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  signup: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setProfile({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || "User",
          email: firebaseUser.email || "",
          photoURL:
            firebaseUser.photoURL ||
            `https://picsum.photos/seed/${firebaseUser.uid}/200/200`,
          status: "Hey there! I'm using My Messenger.",
        });
        try {
          await setDoc(
            doc(db, "users", firebaseUser.uid),
            {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || "User",
              email: firebaseUser.email,
              photoURL:
                firebaseUser.photoURL ||
                `https://picsum.photos/seed/${firebaseUser.uid}/200/200`,
              online: true,
              lastSeen: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (e) {
          // Firestore may be unreachable if Firebase isn't configured yet.
          console.warn("Could not sync user presence:", e);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    const handleOffline = () => {
      if (auth.currentUser) {
        updateDoc(doc(db, "users", auth.currentUser.uid), {
          online: false,
          lastSeen: serverTimestamp(),
        }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", handleOffline);

    return () => {
      unsub();
      window.removeEventListener("beforeunload", handleOffline);
    };
  }, []);

  const signup = async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, {
      displayName: name,
      photoURL: `https://picsum.photos/seed/${cred.user.uid}/200/200`,
    });
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      name,
      email,
      photoURL: `https://picsum.photos/seed/${cred.user.uid}/200/200`,
      status: "Hey there! I'm using My Messenger.",
      online: true,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      blockedUsers: [],
    });
  };

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          online: false,
          lastSeen: serverTimestamp(),
        });
      } catch {}
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
