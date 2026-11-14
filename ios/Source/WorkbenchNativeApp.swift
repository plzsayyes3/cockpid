import SwiftUI

/// Native host for the existing Cockpid web workbench.
/// This source is included in the tracked WorkbenchNative Xcode project.
@main
struct WorkbenchNativeApp: App {
    var body: some Scene {
        WindowGroup {
            WorkbenchRootView()
        }
    }
}

struct WorkbenchRootView: View {
    @StateObject private var webStore = WorkbenchWebStore()

    var body: some View {
        WorkbenchWebView(webView: webStore.webView)
            .background(Color(red: 241.0 / 255.0, green: 240.0 / 255.0, blue: 235.0 / 255.0))
    }
}
