# Fix Google Sign-In for Capacitor Android (Revised)

The previous attempt failed because of an incorrect package name and being run in the wrong directory. We are switching to `@capawesome/capacitor-google-sign-in`, which is the current industry standard for Google Sign-In in Capacitor.

## User Review Required

> [!IMPORTANT]
> You MUST run the installation commands in the **Project Root** directory, NOT the `android` folder.

> [!IMPORTANT]
> This change requires adding the dependency `@capawesome/capacitor-google-sign-in`.

## Proposed Changes

### [Component] Authentication Logic

#### [MODIFY] [AuthContext.tsx](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/src/contexts/AuthContext.tsx)
- Switch to `@capawesome/capacitor-google-sign-in`.
- Added initialization logic in `useEffect` using the Web Client ID.
- Updated `loginWithGoogle` to use the correct `signIn()` method and response structure.

### [Component] Capacitor Configuration

#### [MODIFY] [capacitor.config.ts](file:///G:/Personal Messenger by Google/Personal-Messenger-Web_App/capacitor.config.ts)
- Cleaned up the `plugins` section as this plugin is configured at runtime.

## Verification Plan

### Manual Verification
1.  Navigate to the project root in your terminal.
2.  Run the installation commands.
3.  Deploy to Android and test the sign-in flow.
