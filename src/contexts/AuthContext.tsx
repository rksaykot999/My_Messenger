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
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  deleteUser,
  User,
} from "firebase/auth";
import {
  arrayRemove,
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  where,
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
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  finishDeleteAccount: () => Promise<void>;
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
              friends: [],
              incomingRequests: [],
              outgoingRequests: [],
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
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
    });
  };

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      // Some browsers block popups or may not support them.
      if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request" || error.code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, provider);
      } else {
        throw error;
      }
    }
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

  const deleteAccount = async () => {
    if (!auth.currentUser) throw new Error("No user is currently signed in.");
    const uid = auth.currentUser.uid;

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "users", uid));

      // Clean up chats involving this user.
      const chatQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", uid)
      );
      const chatSnap = await getDocs(chatQuery);
      for (const chatDoc of chatSnap.docs) {
        const chatRef = doc(db, "chats", chatDoc.id);
        const messagesSnap = await getDocs(collection(chatRef, "messages"));
        messagesSnap.docs.forEach((messageDoc) => batch.delete(messageDoc.ref));
        batch.delete(chatRef);
      }

      // Clean up calls where this user is caller or callee.
      const callIds = new Set<string>();
      const callerQuery = query(collection(db, "calls"), where("callerId", "==", uid));
      const calleeQuery = query(collection(db, "calls"), where("calleeId", "==", uid));

      const [callerSnap, calleeSnap] = await Promise.all([
        getDocs(callerQuery),
        getDocs(calleeQuery),
      ]);

      const callDocs = [...callerSnap.docs, ...calleeSnap.docs];
      for (const callDoc of callDocs) {
        if (callIds.has(callDoc.id)) continue;
        callIds.add(callDoc.id);

        const callRef = doc(db, "calls", callDoc.id);
        const callerCandidatesSnap = await getDocs(collection(callRef, "callerCandidates"));
        callerCandidatesSnap.docs.forEach((candidateDoc) => batch.delete(candidateDoc.ref));

        const calleeCandidatesSnap = await getDocs(collection(callRef, "calleeCandidates"));
        calleeCandidatesSnap.docs.forEach((candidateDoc) => batch.delete(candidateDoc.ref));

        batch.delete(callRef);
      }

      await batch.commit();

      // Remove this user from other users' lists.
      const userQueries = [
        query(collection(db, "users"), where("friends", "array-contains", uid)),
        query(collection(db, "users"), where("incomingRequests", "array-contains", uid)),
        query(collection(db, "users"), where("outgoingRequests", "array-contains", uid)),
        query(collection(db, "users"), where("blockedUsers", "array-contains", uid)),
      ];

      for (const userQuery of userQueries) {
        const snap = await getDocs(userQuery);
        for (const docSnap of snap.docs) {
          await updateDoc(doc(db, "users", docSnap.id), {
            friends: arrayRemove(uid),
            incomingRequests: arrayRemove(uid),
            outgoingRequests: arrayRemove(uid),
            blockedUsers: arrayRemove(uid),
          });
        }
      }

      await finishDeleteAccount();
    } catch (error: any) {
      console.error("Failed to delete account", error);
      if (error.code === "auth/requires-recent-login") {
        throw error;
      }
      throw error;
    }
  };

  const finishDeleteAccount = async () => {
    if (!auth.currentUser) throw new Error("No user is currently signed in.");
    try {
      await deleteUser(auth.currentUser);
    } catch (error: any) {
      console.error("Failed to delete auth user", error);
      if (error.code === "auth/requires-recent-login") throw error;
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signup, login, loginWithGoogle, logout, deleteAccount, finishDeleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
