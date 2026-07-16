# Implementation Plan - Native Push Notifications for Android

The app currently uses the Web Notification API, which is not supported in the Android WebView for Capacitor apps. To fix notifications for messages and calls, we need to integrate native Capacitor plugins and set up a Firebase Cloud Messaging (FCM) workflow.

## User Review Required

> [!IMPORTANT]
> **Dependencies**: You must run `npm install @capacitor/push-notifications @capacitor/local-notifications` in the project root.
> **Backend**: For notifications to work when the app is **closed**, a server-side component (Firebase Cloud Functions) is required to "push" the message to the device. I will provide the code for this, but it requires deployment to your Firebase project.

## Proposed Changes

### 1. Android Native Configuration

#### [MODIFY] [AndroidManifest.xml](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/android/app/src/main/AndroidManifest.xml)
- Add `<uses-permission android:name="android.permission.WAKE_LOCK" />`
- Add `<uses-permission android:name="android.permission.VIBRATE" />`
- Add permission for POST_NOTIFICATIONS (for Android 13+).

### 2. Authentication & FCM Token Management

#### [MODIFY] [AuthContext.tsx](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/src/contexts/AuthContext.tsx)
- Integrate `@capacitor/push-notifications`.
- Create a `registerPushNotifications()` function.
- Save the generated FCM token to the user's Firestore document (`/users/{uid}/fcmToken`).

### 3. Native Notification Handling

#### [MODIFY] [notifications.ts](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/src/lib/notifications.ts)
- Update `showMessageNotification` to use `@capacitor/local-notifications` when `Capacitor.isNativePlatform()` is true.
- This ensures that if the app is open (backgrounded), the notification will show natively.

### 4. Background Messaging (Cloud Functions)

#### [NEW] `functions/index.js`
- Create a Firestore trigger for `chats/{chatId}/messages/{messageId}`.
- Create a Firestore trigger for `calls/{callId}`.
- Use `firebase-admin` to send push notifications to the `fcmToken` stored in the recipient's user document.

## Verification Plan

### Automated Tests
- N/A (Manual verification on device required for push notifications).

### Manual Verification
1. Install plugins and sync Android.
2. Open the app on an Android device.
3. Verify that the "Allow notifications" permission prompt appears.
4. Send a message from another account.
5. Verify a notification appears when the app is in the background.
