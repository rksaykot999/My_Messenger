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
  sendPasswordResetEmail,
  User,
  signInWithCredential,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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
  accountMode?: "public" | "private";
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
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const registerPush = async (uid: string) => {
      if (Capacitor.isNativePlatform()) {
        try {
          let perm = await PushNotifications.checkPermissions();
          if (perm.receive === "prompt") {
            perm = await PushNotifications.requestPermissions();
          }
          if (perm.receive !== "granted") return;

          await PushNotifications.register();

          PushNotifications.addListener("registration", async (token) => {
            await updateDoc(doc(db, "users", uid), {
              fcmToken: token.value,
            });
          });
        } catch (e) {
          console.error("Push registration error:", e);
        }
      } else {
        // Web Push Registration
        try {
          if (!("Notification" in window)) return;
          const permission = await Notification.requestPermission();
          if (permission !== "granted") return;

          const { getAppMessaging } = await import("@/lib/firebase");
          const messaging = await getAppMessaging();
          if (!messaging) return;

          const { getToken, onMessage } = await import("firebase/messaging");
          
          const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
          if (!vapidKey) {
            console.warn("NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing. Web push won't work.");
            return;
          }

          const currentToken = await getToken(messaging, { vapidKey });
          if (currentToken) {
            await updateDoc(doc(db, "users", uid), {
              fcmToken: currentToken,
            });
          }

          onMessage(messaging, (payload) => {
            console.log("Foreground message received. ", payload);
            if (payload.notification) {
               // Show a native browser notification even when app is open (or you can integrate a React Toast here)
               new Notification(payload.notification.title || "New Message", {
                 body: payload.notification.body || "",
               });
            }
          });
        } catch (e) {
          console.error("Web Push registration error:", e);
        }
      }
    };

    if (Capacitor.isNativePlatform()) {
      GoogleSignIn.initialize({
        clientId: "1038574226468-okpbrd9mbo9sl5bh6icsvf2344dpb2sf.apps.googleusercontent.com",
      });
    }

    let unsubProfile: (() => void) | undefined;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      // Stop listening to the previous user's profile document, if any.
      unsubProfile?.();
      unsubProfile = undefined;

      if (firebaseUser) {
        registerPush(firebaseUser.uid);
        // Paint something immediately from the auth record while the
        // Firestore doc loads / in case Firestore is briefly unreachable.
        setProfile({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || "User",
          email: firebaseUser.email || "",
          photoURL:
            firebaseUser.photoURL ||
            `https://picsum.photos/seed/${firebaseUser.uid}/200/200`,
          status: "Hey there! I'm using My Messenger.",
          accountMode: "public",
        });

        const userRef = doc(db, "users", firebaseUser.uid);
        try {
          const existing = await getDoc(userRef);
          await setDoc(
            userRef,
            {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || "User",
              email: firebaseUser.email,
              photoURL:
                firebaseUser.photoURL ||
                `https://picsum.photos/seed/${firebaseUser.uid}/200/200`,
              online: true,
              lastSeen: serverTimestamp(),
              // Only set these on the very first sign-in (e.g. first Google
              // login) — never again, or we'd wipe existing friend data
              // every time this listener re-fires on page load.
              ...(existing.exists()
                ? {}
                : {
                    status: "Hey there! I'm using My Messenger.",
                    createdAt: serverTimestamp(),
                    blockedUsers: [],
                    friends: [],
                    incomingRequests: [],
                    outgoingRequests: [],
                    accountMode: "public",
                  }),
            },
            { merge: true }
          );
        } catch (e) {
          // Firestore may be unreachable, or its security rules haven't
          // been deployed yet — don't block sign-in on this.
          console.warn("Could not sync user presence:", e);
        }

        // Keep `profile` in sync with Firestore in real time, so that
        // edits made from the Settings screen (name, status, photo) show
        // up immediately everywhere in the app without a page reload.
        unsubProfile = onSnapshot(
          userRef,
          (snap) => {
            const data = snap.data() as any;
            if (!data) return;
            setProfile({
              uid: firebaseUser.uid,
              name: data.name || firebaseUser.displayName || "User",
              email: data.email || firebaseUser.email || "",
              photoURL:
                data.photoURL ||
                firebaseUser.photoURL ||
                `https://picsum.photos/seed/${firebaseUser.uid}/200/200`,
              status: data.status || "Hey there! I'm using My Messenger.",
              accountMode: data.accountMode || "public",
            });
          },
          (e) => {
            console.warn("Could not subscribe to profile updates:", e);
          }
        );
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

    // Presence heartbeat: keep `lastSeen` fresh while the tab is open so
    // other users see an accurate online status and "last seen" time.
    const beat = () => {
      if (!auth.currentUser) return;
      const online = document.visibilityState === "visible";
      updateDoc(doc(db, "users", auth.currentUser.uid), {
        online,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
    };
    const heartbeat = setInterval(beat, 25000);
    const handleVisibility = () => beat();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      unsub();
      unsubProfile?.();
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
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
      accountMode: "public",
    });
  };

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await GoogleSignIn.signIn();
        const credential = GoogleAuthProvider.credential(result.idToken);
        await signInWithCredential(auth, credential);
      } catch (error: any) {
        console.error("Native Google Sign-In error:", error);
        throw error;
      }
      return;
    }

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

  const sendPasswordReset = async (email: string) => {
    if (!email.trim()) throw new Error("Enter your account email first.");
    await sendPasswordResetEmail(auth, email.trim());
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signup, login, loginWithGoogle, logout, deleteAccount, finishDeleteAccount, sendPasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
