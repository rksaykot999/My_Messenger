# Walkthrough - Fixed Google Sign-In with Capawesome

I have corrected the implementation to use the `@capawesome/capacitor-google-sign-in` plugin and fixed the initialization logic.

## Changes Made

### 1. Correct Plugin Integration
Updated [AuthContext.tsx](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/src/contexts/AuthContext.tsx) to:
- Use `GoogleSignIn` from `@capawesome/capacitor-google-sign-in`.
- Initialize the plugin automatically on app load when running natively.
- Handle the sign-in result which provides the `idToken` directly.

### 2. Configuration Cleanup
Reverted the `plugins` section in [capacitor.config.ts](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/capacitor.config.ts) since the Capawesome plugin is configured at runtime via code.

## Next Steps (CRITICAL)

Please follow these steps exactly:

### 1. Go to the Project Root
Your terminal is currently in the `android` folder. Move up one level:
```powershell
cd ..
```

### 2. Install the CORRECT Plugin
Run this command from the **root** folder (`Personal-Messenger-Web_App`):
```powershell
npm install @capawesome/capacitor-google-sign-in
npx cap sync android
```

### 3. Verify SHA-1
Ensure your SHA-1 is in the Firebase Console as mentioned previously. If you don't do this, you will see a "Developer Error" (Error Code 10).
