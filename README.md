# App build command for web and app: 
npm run build && npx cap sync android

# My Messenger

A real-time messaging app (Next.js + Firebase) — login/signup, live chat,
friend requests, voice/video calling, and browser notifications.


## Bugs found and fixed in this update

1. **Messaging didn't work at all** — `firestore.rules` had `allow read,
   update, delete` for the `chats` collection but no `allow create`. Every
   time two people tried to start a new conversation, Firestore silently
   rejected the chat-creation write (permission-denied), so the chat view
   never loaded and nothing could be sent. Fixed by adding the missing
   `create` rule.

2. **Friend requests appeared to send/accept but didn't stick** —
   `AuthContext`'s sign-in listener was resetting `friends`,
   `incomingRequests`, and `outgoingRequests` back to empty arrays *every
   time the app loaded* (including simple page refreshes), because it
   `setDoc(..., { merge: true })`'d those fields on every auth-state change.
   `merge: true` only protects fields you don't mention — these were
   explicitly included, so they got overwritten. Fixed so those fields are
   only ever initialized once, on first sign-in.

3. **Calling appeared broken** — this was a knock-on effect of bug #1:
   calls are started from inside a chat, and chats couldn't be created, so
   there was never a way to reach the call button in practice. The WebRTC
   calling code itself was already correct and works once you can get into
   a chat.

4. **Notifications appeared broken** — also a knock-on effect of bug #1: no
   messages were ever successfully written, so there was nothing to notify
   about.

5. **Profile photo upload had no Storage rules** — added `storage.rules` so
   a signed-in user can upload/replace only their own profile photo
   (`profilePhotos/{their-uid}/...`), and anyone signed in can view photos.

6. Removed a hardcoded fallback Firebase API key that had been placed
   directly in `src/lib/firebase.ts` as a workaround for an earlier
   "api-key-not-valid" error. That error was actually caused by `.env.local`
   not being loaded yet (fixed by properly setting `.env.local` + restarting
   the dev server) — hardcoding real project credentials into source code
   isn't good practice, so it's been reverted to a safe placeholder fallback
   now that env loading is confirmed working.

7. Cleaned up the now-unused Genkit "Chat with AI" source files
   (`src/ai/`, `AIChatView.tsx`) that were dead code left over from an
   earlier version.

8. Added error handling (toasts) to friend-request actions, chat setup, and
   profile saving, so future failures show a message instead of failing
   silently in the console — this will make debugging much faster next time.

## 1. Create/confirm your Firebase project

1. <https://console.firebase.google.com/> → your project (or **Add
   project**, free Spark plan).
2. **Build → Authentication → Sign-in method** → **Email/Password** enabled
   (and **Google**, if you want the Google sign-in button to work).
3. **Build → Firestore Database** → created, production mode.
4. **Build → Storage** → created (needed for profile photos).
5. **Project settings → General → Your apps** → copy the `firebaseConfig`
   values into `.env.local` (see below).
6. Deploy `firestore.rules` and `storage.rules` (see the critical step
   above) — **do this every time you change either file**.

## 2. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in the six `NEXT_PUBLIC_FIREBASE_*` values, no quotes needed:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abc123
```

**After editing `.env.local`, always fully restart `npm run dev`** — Next.js
only reads env files at server startup, not on hot-reload.

## 3. Run it

```bash
npm install
npm run dev
```

Test with two accounts (a normal window + an incognito window): sign up as
both, send a friend request from one, accept it from the other, then chat
and call between them.

## Notes & limitations

- **Calling** uses public Google STUN servers only. For reliable calling
  across arbitrary networks in production, add a TURN server to the
  `iceServers` list in `src/lib/webrtc.ts`.
- **Notifications** use the browser's Notification API and fire while the
  tab is open in the background (not when the browser is fully closed). For
  true closed-app push notifications, add Firebase Cloud Messaging (FCM)
  with a service worker.
- Grant notification + camera/microphone permission when your browser
  prompts for them, or those features will silently no-op.

## Where things live

- `src/app/page.tsx` — main app shell (chats, people/friends, calls, settings)
- `src/lib/chat.ts` — Firestore chat + friend-request helpers
- `src/lib/webrtc.ts` — WebRTC calling logic
- `src/contexts/AuthContext.tsx` — auth state, sign up/in/out, account deletion
- `src/hooks/use-call-manager.ts` — call state management
- `src/hooks/use-message-notifications.ts` — notification logic
- `firestore.rules` / `storage.rules` — server-side security rules (must be
  deployed to Firebase, not just present in this repo)
