# App Release Guidelines & Template

This document provides a standard guideline for manually creating and publishing new app releases (Android APK and iOS IPA) on the GitHub Releases page.

---

## 1. How to Create a New Release

Follow these steps to publish a new release:

1. Navigate to the **[Releases](https://github.com/rksaykot999/My_Messenger/releases)** section of the repository.
2. Click on the **Draft a new release** button.
3. Click on the **Choose a tag** dropdown. Type your new tag name (e.g., `v1.0.0`) and select **Create new tag**.
4. Fill in the **Release title** based on the format provided below.
5. Copy the **Release Description Template** from this file and paste it into the description box. Fill in the specific details for this update.
6. Drag and drop your compiled `.apk` and `.ipa` files into the **Attach binaries by dropping them here** area.
7. (Optional) If this is a test or beta build, check the **Set as a pre-release** checkbox.
8. Click the **Publish release** button.

---

## 2. Tag Naming Convention

Always use **Semantic Versioning** for your tags, prefixed with a lowercase `v`.

*   **Stable Releases:** `v1.0.0`, `v1.0.1`, `v2.0.0`
    *   *Major:* Breaking changes or massive overhauls.
    *   *Minor:* New features (backward compatible).
    *   *Patch:* Bug fixes and minor tweaks.
*   **Pre-releases (Beta/Alpha):** `v1.1.0-beta`, `v2.0.0-alpha.1`

---

## 3. Release Title Format

Use a clear and standardized title for every release so users can easily identify the version.

**Format:** `My Messenger <Version_Tag>`
**Examples:**
*   `My Messenger v2.0.0`
*   `My Messenger v2.0.1-beta`

---

## 4. File Naming Conventions

To keep the release attachments clean and professional, rename your build files before uploading them to GitHub:

*   **Android:** `MyMessenger-v<version>.apk` (e.g., `MyMessenger-v1.0.0.apk`)
*   **iOS:** `MyMessenger-v<version>.ipa` (e.g., `MyMessenger-v1.0.0.ipa`)

*(Your GitHub Actions workflows currently output files like `app-debug.apk` and `MyMessenger.ipa`. Please rename them locally before uploading to a manual release.)*

---

## 5. All-in-One Copy-Paste Template

When creating a release, just copy the corresponding texts below and paste them into GitHub's fields. Replace the `[X.X.X]` with your actual version number (e.g., `1.0.0`).

### 📌 Tag Name:
```text
v[X.X.X]
```

### 🏷️ Release Title:
```text
My Messenger v[X.X.X]
```

### 📦 Files to Upload (Rename them to this):
```text
MyMessenger-v[X.X.X].apk
MyMessenger-v[X.X.X].ipa
```

### 📝 Release Description:
*(Copy everything inside the block below and paste it into the "Describe this release" box)*

```markdown
## What's New 🎉
- [Feature 1 description, e.g., Added support for Push Notifications]
- [Feature 2 description, e.g., Introduced Dark Mode theme]

## Bug Fixes 🐛
- [Bug 1, e.g., Fixed an issue where the app crashed on the login screen]
- [Bug 2, e.g., Resolved UI glitches on smaller screens]

## Downloads ⬇️
Please download the appropriate file for your device from the **Assets** section below:

*   🤖 **Android:** Download `MyMessenger-v[X.X.X].apk` and install it directly on your device. *(Note: You may need to allow "Install from unknown sources" in your settings).*
*   🍏 **iOS:** Download `MyMessenger-v[X.X.X].ipa`. Since this is an unsigned IPA, you will need to sideload it using tools like **AltStore**, **Sideloadly**, or **TrollStore**.
```
