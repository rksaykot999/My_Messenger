# My Messenger

A real-time messaging app (Next.js + Firebase) with login/signup, live chat,
voice/video calling, and browser notifications.

## What changed in this version

- **Login / Sign Up** — Firebase Authentication (email + password). Signed-out
  visitors land on `/login`; signed-in visitors go straight to the app.
- **Realtime messaging** — Chats and messages are stored in **Cloud
  Firestore** and update live with `onSnapshot`, no more mock data.
- **Working audio/video calls** — Real peer-to-peer calls using **WebRTC**,
  signaled through Firestore (`calls/{callId}` docs + ICE-candidate
  subcollections). Mute, speaker toggle, camera on/off, and hang up all work.
- **Chat menu** — The chat header's "Chat with AI" sparkle button was
  replaced with an **ⓘ Info button** that opens a sheet with *View Contact
  Info*, *Delete Chat History*, and *Block/Unblock User*.
- **Notifications** — When a message arrives for a chat you're not currently
  viewing, a browser notification appears; it's automatically dismissed the
  moment you open that conversation (uses the Notification API with a
  per-chat `tag`).

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com/> → **Add project** (it's free
   on the Spark plan).
2. **Build → Authentication → Get started → Sign-in method** → enable
   **Email/Password**.
3. **Build → Firestore Database → Create database** → start in **production
   mode** (the included `firestore.rules` will lock it down properly) → pick
   any region.
4. **Project settings (gear icon) → General → Your apps → Web (`</>`)** →
   register an app → copy the `firebaseConfig` values.
5. Deploy `firestore.rules` from this project via the Firebase console's
   Firestore **Rules** tab (paste the file's contents), or with the CLI:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore   # point it at this project
   firebase deploy --only firestore:rules
   ```

## 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in the six `NEXT_PUBLIC_FIREBASE_*` values from step 1.4. Without these,
the app still runs but shows a "Firebase isn't configured" error on
login/signup.

## 3. Run it

```bash
npm install
npm run dev
```

Open two different browsers (or one normal + one incognito window) and sign
up with two different accounts to test chatting and calling between them.

## Notes & limitations

- **Calling** uses public Google STUN servers only. This covers most
  same-network or straightforward NAT setups. For reliable calling across
  arbitrary networks in production, add a TURN server (e.g. a free tier from
  Twilio, Cloudflare, or `coturn` you host) to the `iceServers` list in
  `src/lib/webrtc.ts`.
- **Notifications** use the browser's Notification API. They fire while the
  tab is open in the background. For true push notifications when the app/
  tab is fully closed, you'd add Firebase Cloud Messaging (FCM) with a
  service worker — a good next step, not included here to keep the setup
  simple and free.
- Take a look at `src/app/page.tsx` for the main app shell, `src/lib/chat.ts`
  for Firestore chat helpers, `src/lib/webrtc.ts` for the calling logic, and
  `src/contexts/AuthContext.tsx` for auth.
