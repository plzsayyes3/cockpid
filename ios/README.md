# Cockpid iOS native shell (preparation)

Status: **source scaffold committed; Xcode project / code signing / real-device build NOT performed** (2026-11-14).

## Purpose

Keep the canonical web Workbench intact while testing a SwiftUI + WKWebView host on iPhone Duo. This first build loads the live HTTPS GitHub Pages Workbench; it does not reproduce the web UI in SwiftUI.

Entry URL: https://plzsayyes3.github.io/cockpid/workbench/

Source files already in the repository:

- `ios/Source/WorkbenchNativeApp.swift` — app entry + root view.
- `ios/Source/WorkbenchWebView.swift` — persistent WKWebView and HTTPS loader.
- `docs/superpowers/plans/2026-11-14-ios-shell.md` — decision, scope, checks and rollback.

## First Mac setup (Xcode; not done yet)

1. Install the current stable Xcode compatible with your Mac/iPhone; open Xcode once to install its components.
2. Clone `plzsayyes3/cockpid` to the Mac, or in an existing clone run `git pull --ff-only origin main`.
3. Xcode → File → New → Project → iOS → App; Product Name `WorkbenchNative`; SwiftUI + Swift; save the new project under the repository's `ios/` folder. Set a unique Bundle Identifier owned by your Apple Account.
4. Remove the wizard-generated `@main` app source from **the Xcode target** (there must be exactly one `@main`). Add both files in `ios/Source/` to the app target; confirm target membership. Leave source files tracked in Git.
5. Signing & Capabilities → Automatically manage signing → choose your Personal Team or Developer Program team. Never commit signing credentials, provisioning profiles, Apple Account information, or GitHub PAT.
6. Connect and trust the iPhone; enable Developer Mode when prompted by the phone; choose the physical device as the build target, then Run (⌘R).
7. Verify the exact URL opens and both the Tasks and Duo planner open. Authenticate GitHub **inside the native app** only after confirming the private-repo access flow, then safely test reading and saving non-destructive content.
8. Once the generated Xcode project is verified, commit project settings and required non-secret assets so subsequent Mac sessions only need `git pull` → build → Run.

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

## Apple signing note

Apple's free Personal Team supports personal-device Xcode tests but its provisioning profiles expire after seven days; the app needs rebuild/reinstall after expiry. Continuous day-to-day use may merit a paid Developer Program membership or another deployment strategy. App Store/TestFlight distribution is not part of this first stage.

Source: https://developer.apple.com/jp/help/account/basics/about-your-developer-account/

## Stop/rollback

If native testing is unstable, leave the canonical GitHub Pages Workbench and Safari/PWA unchanged. The native shell is in `ios/`, with no modifications to production `workbench/` files.
