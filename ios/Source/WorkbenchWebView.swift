import SwiftUI
import WebKit

/// A single persistent WKWebView, so SwiftUI body refreshes do not recreate the page.
/// WKWebView storage is app-specific and is not shared with Safari/PWA.
@MainActor
final class WorkbenchWebStore: ObservableObject {
    let webView: WKWebView

    init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        // One-time, app-local placement requested for Duo: put the memo
        // actions below the system connectivity indicator. The existing web
        // layout clamps this preference when the keyboard reduces the height.
        // Keep the previous preference for recovery and allow subsequent
        // changes from the web's display settings to persist across launches.
        let duoRailPlacement = WKUserScript(source: """
        (() => {
            if (location.origin !== 'https://plzsayyes3.github.io' ||
                !location.pathname.startsWith('/cockpid/workbench/')) return;
            const marker = 'cockpid.native.duo-rail-placement.v1';
            const setting = 'cockpid.planner.rail-top.v1';
            try {
                if (localStorage.getItem(marker) !== null) return;
                const previous = localStorage.getItem(setting);
                localStorage.setItem(marker, JSON.stringify({previous}));
                localStorage.setItem(setting, '144');
            } catch (_) {
                // Storage unavailable: keep the existing web layout usable.
            }
        })();
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        configuration.userContentController.addUserScript(duoRailPlacement)

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = false
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 241.0 / 255.0, green: 240.0 / 255.0, blue: 235.0 / 255.0, alpha: 1)
        webView = view

        // Remote-first spike: web changes can be picked up on page reload.
        // Native Swift/entitlement/Info.plist changes always require a rebuild.
        if let url = URL(string: "https://plzsayyes3.github.io/cockpid/workbench/") {
            view.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy))
        }
    }
}

struct WorkbenchWebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView {
        webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // Loading is owned by WorkbenchWebStore; do not reload on every SwiftUI update.
    }
}
