# Walkthrough - Native Notifications Setup

I have completed the technical setup for native notifications on Android. This includes permission handling, device registration (FCM tokens), and the background processing logic.

## Changes Made

### 1. Android Native Permissions
Updated [AndroidManifest.xml](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/android/app/src/main/AndroidManifest.xml) with:
- `POST_NOTIFICATIONS`: Required for Android 13+.
- `WAKE_LOCK`: To wake the device when a notification arrives.
- `VIBRATE`: For tactile alerts.

### 2. Device Registration (FCM)
Modified [AuthContext.tsx](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/src/contexts/AuthContext.tsx):
- Added logic to request push permissions and register the device with Firebase Cloud Messaging (FCM).
- The `fcmToken` is now automatically saved to each user's document in Firestore (`/users/{uid}`).

### 3. Native UI Alerts
Updated [notifications.ts](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/src/lib/notifications.ts):
- Switched to `@capacitor/local-notifications` for native alerts when the app is in the background.

### 4. Background Push Logic (Cloud Functions)
Created a new [functions](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/functions) directory:
- [index.js](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/functions/index.js): Contains Firestore triggers that send push notifications whenever a new message or call is detected.

## Final Steps (Action Required)

To finalize the setup, you MUST perform these steps in your terminal:

### 1. Install New Dependencies
Run this in the **project root**:
```bash
npm install @capacitor/push-notifications @capacitor/local-notifications
npx cap sync android
```

### 2. Set Up Cloud Functions
If you haven't initialized Firebase Functions yet, run this in the **project root**:
```bash
firebase init functions
```
(When asked, use **JavaScript** and do **not** overwrite the files I created).

### 3. Deploy Notifications
Deploy the push notification logic to your Firebase project:
```bash
cd functions
npm install
firebase deploy --only functions
```

Once deployed, your app will be able to receive notifications even when it is completely closed!
