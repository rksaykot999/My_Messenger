import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// These values come from your Firebase project settings.
// Create a `.env.local` file (see `.env.local.example`) and fill them in.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

// Guard so the app doesn't crash at build time / before env vars are set.
export const app = getApps().length
  ? getApp()
  : initializeApp(
      isFirebaseConfigured
        ? firebaseConfig
        : {
            apiKey: "AIzaSyCcpoTsFtl6OhJCtULG4b250JxlexU1owY",
            authDomain: "my-messenger-88ba1.firebaseapp.com",
            projectId: "my-messenger-88ba1",
            appId: "1:1038574226468:web:56065c221d5d9d48e31cb1",
          }
    );

export const auth = getAuth(app);
export const db = getFirestore(app);
