# Cockpid iOS native shell

Status: **Xcode project scaffold added; Xcode build, signing, and real-device install remain pending** (2026-11-14).

## Purpose

Keep the canonical web Workbench intact while testing a SwiftUI + WKWebView host on iPhone Duo. This first build loads the live HTTPS GitHub Pages Workbench; it does not reproduce the web UI in SwiftUI.

Entry URL: https://plzsayyes3.github.io/cockpid/workbench/

Source files already in the repository:

- `ios/Source/WorkbenchNativeApp.swift` — app entry + root view.
- `ios/Source/WorkbenchWebView.swift` — persistent WKWebView and HTTPS loader.
- `ios/WorkbenchNative.xcodeproj/` — minimal iOS application project with both Swift files in the app target.
- `docs/superpowers/plans/2026-11-14-ios-shell.md` — decision, scope, checks and rollback.

The project uses `com.plzsayyes3.WorkbenchNative` as a placeholder bundle identifier,
automatic signing, iOS 17.0 as the deployment target, and no committed development
team. Select the user's Apple Team in Xcode before installing on a device.

## First Mac setup (Xcode; not done yet)

1. Install the current stable Xcode compatible with your Mac/iPhone; open Xcode once to install its components.
2. Clone `plzsayyes3/cockpid` to the Mac, or in an existing clone run `git pull --ff-only origin main`.
3. Open `ios/WorkbenchNative.xcodeproj` directly. The project already contains `ios/Source/WorkbenchNativeApp.swift` and `ios/Source/WorkbenchWebView.swift`; there must be exactly one `@main`.
4. In General / Signing & Capabilities, set a unique Bundle Identifier owned by your Apple Account if the placeholder is unavailable. Leave source files tracked in Git.
5. Signing & Capabilities → Automatically manage signing → choose your Personal Team or Developer Program team. Never commit signing credentials, provisioning profiles, Apple Account information, or GitHub PAT.
6. Connect and trust the iPhone; enable Developer Mode when prompted by the phone; choose the physical device as the build target, then Run (⌘R).
7. Verify the exact URL opens and both the Tasks and Duo planner open. Authenticate GitHub **inside the native app** only after confirming the private-repo access flow, then safely test reading and saving non-destructive content.
8. Once the generated Xcode project is verified, commit project settings and required non-secret assets so subsequent Mac sessions only need `git pull` → build → Run.

## Verification record (2026-11-14)

- Latest `origin/main` was fetched at commit `a088558`.
- The original checkout had uncommitted Web Workbench changes, so the iOS work was made in a separate worktree based on `origin/main`; those changes were not overwritten.
- `ios/WorkbenchNative.xcodeproj` was added and references both Swift source files in its Sources build phase.
- The current Mac selects `/Library/Developer/CommandLineTools`; no Xcode.app was found in `/Applications`.
- `xcodebuild -version` and `simctl` are therefore unavailable, so no iOS compile, simulator run, signing, or device transfer has been verified yet.
- No GitHub credentials, provisioning profiles, Apple account details, or personal data were read or written.

Next verification command after Xcode is installed and selected:

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -project ios/WorkbenchNative.xcodeproj -scheme WorkbenchNative -sdk iphoneos -configuration Debug -destination 'generic/platform=iOS' build
```

## Daily development flow

Web-only changes: edit/commit/push `cockpid` → reopen/reload the app (subject to HTTP cache and service worker). Native shell changes: edit/commit/push → Mac `git pull --ff-only origin main` → Xcode build & Run. Web updates do **not** automatically refresh an already open WKWebView, and native updates need reinstallation.

## Important separations

- Web source: `plzsayyes3/cockpid`; TaskLiner execution records: `plzsayyes3/mynotebook/09_taskchute`; personal Daily/Inbox: `mynotebook`.
- Structured project tracking: `plzsayyes3/my-storage-note/objects/projects/cockpid.md`. Do not create a separate Project merely for the shell.
- WKWebView and Safari/PWA have **separate** cookies/localStorage. Previously stored PAT, offline drafts, token and UI size settings do not transfer automatically. Never wipe Safari or PWA data as a migration shortcut.
- Remote-first mode depends on network and GitHub Pages. Offline/local bundled web files are a possible later stage, not implemented.
- `workbench/index.html` already declares `viewport-fit=cover`; test OS safe areas in the app rather than assuming WebView bypasses OS-reserved strips.
- Do not set broad App Transport Security exceptions: current initial URL is HTTPS.
- Some `target=_blank`, camera/mic, download, clipboard, and native keyboard paths may differ from Safari and require separate QA.
- The minimal shell does not yet install a `WKUIDelegate` for new-window links, and it does not declare camera/microphone usage descriptions; those paths are explicitly outside this first smoke-test scope until Xcode/device QA confirms the required behavior.

## Apple signing note

Apple's free Personal Team supports personal-device Xcode tests but its provisioning profiles expire after seven days; the app needs rebuild/reinstall after expiry. Continuous day-to-day use may merit a paid Developer Program membership or another deployment strategy. App Store/TestFlight distribution is not part of this first stage.

Source: https://developer.apple.com/jp/help/account/basics/about-your-developer-account/

## Stop/rollback

If native testing is unstable, leave the canonical GitHub Pages Workbench and Safari/PWA unchanged. The native shell is in `ios/`, with no modifications to production `workbench/` files.
