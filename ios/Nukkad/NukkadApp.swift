import SwiftUI
import WebKit
import UIKit
import CoreLocation

@main
struct NukkadApp: App {
    var body: some Scene {
        WindowGroup {
            StorefrontView()
                .ignoresSafeArea(.container)
                .preferredColorScheme(.light)
        }
    }
}

struct StorefrontView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> StorefrontController {
        StorefrontController()
    }

    func updateUIViewController(_ controller: StorefrontController, context: Context) {}
}

private final class StorefrontLocationBridge: NSObject, WKScriptMessageHandlerWithReply, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var reply: ((Any?, String?) -> Void)?
    private var requestID = UUID()
    private var locating = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.scheme == "nukkad",
              message.frameInfo.request.url?.host == "storefront" else {
            replyHandler(nil, "Location is only available to the Nukkad storefront.")
            return
        }
        guard reply == nil else {
            replyHandler(nil, "A location request is already running.")
            return
        }
        reply = replyHandler
        requestID = UUID()
        let currentRequest = requestID
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self, self.requestID == currentRequest, self.reply != nil else { return }
            self.complete(error: "GPS timed out.")
        }
        requestLocation()
    }

    private func requestLocation() {
        guard reply != nil, !locating else { return }
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            locating = true
            manager.startUpdatingLocation()
        default:
            complete(error: "Location access is unavailable.")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            complete(error: "Location access is unavailable.")
        } else if manager.authorizationStatus != .notDetermined {
            requestLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0,
              abs(location.timestamp.timeIntervalSinceNow) < 60 else { return }
        complete(["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude])
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code != .locationUnknown { complete(error: "GPS could not determine your location.") }
    }

    private func complete(_ value: Any? = nil, error: String? = nil) {
        guard let callback = reply else { return }
        reply = nil
        locating = false
        manager.stopUpdatingLocation()
        callback(value, error)
    }
}

final class StorefrontController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private let url = URL(string: "nukkad://storefront/index.html")!
    private let locationBridge = StorefrontLocationBridge()
    private let storefront: WKWebView
    private var storefrontThemeObservation: NSKeyValueObservation?
    private var paymentWindow: UIViewController?

    init() {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(BundledStorefront(), forURLScheme: "nukkad")
        storefront = WKWebView(frame: .zero, configuration: configuration)
        configuration.userContentController.addScriptMessageHandler(locationBridge, contentWorld: .page, name: "nukkadLocation")
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        let launchColor = UIColor(named: "LaunchBackground") ?? .white
        view.backgroundColor = launchColor
        storefront.underPageBackgroundColor = launchColor
        storefrontThemeObservation = storefront.observe(\.themeColor, options: [.new]) { [weak self] webView, _ in
            let color = webView.themeColor ?? launchColor
            self?.view.backgroundColor = color
            webView.underPageBackgroundColor = color
        }
        storefront.uiDelegate = self
        storefront.navigationDelegate = self
        embed(storefront, in: self)
        storefront.load(URLRequest(url: url))
    }

    private func embed(_ webView: WKWebView, in controller: UIViewController) {
        webView.translatesAutoresizingMaskIntoConstraints = false
        controller.view.addSubview(webView)
        let safe = controller.view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.bottomAnchor.constraint(equalTo: safe.bottomAnchor)
        ])
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard paymentWindow == nil else { return nil }
        let child = WKWebView(frame: .zero, configuration: configuration)
        child.uiDelegate = self
        child.navigationDelegate = self

        let page = UIViewController()
        page.view.backgroundColor = .systemBackground
        page.navigationItem.title = "Checkout"
        page.navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(closePaymentWindow)
        )
        embed(child, in: page)

        let navigation = UINavigationController(rootViewController: page)
        navigation.modalPresentationStyle = .fullScreen
        paymentWindow = navigation
        present(navigation, animated: true)
        return child
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        (paymentWindow ?? self).present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        (paymentWindow ?? self).present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        (paymentWindow ?? self).present(alert, animated: true)
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView !== storefront { closePaymentWindow() }
    }

    @objc private func closePaymentWindow() {
        paymentWindow?.dismiss(animated: true)
        paymentWindow = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard webView === storefront, (error as NSError).code != NSURLErrorCancelled else { return }
        let alert = UIAlertController(title: "Couldn’t open Nukkad", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in
            guard let self else { return }
            self.storefront.load(URLRequest(url: self.url))
        })
        present(alert, animated: true)
    }
}


private final class BundledStorefront: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.resourceURL?.appendingPathComponent("Web", isDirectory: true)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let requested = task.request.url, requested.host == "storefront", let root else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let resolvedRoot = root.resolvingSymlinksInPath()
        let path = requested.path == "/" ? "index.html" : String(requested.path.dropFirst())
        let file = resolvedRoot.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(resolvedRoot.path + "/"), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let mimeTypes = [
            "html": "text/html", "js": "application/javascript", "css": "text/css",
            "png": "image/png", "jpg": "image/jpeg", "webmanifest": "application/manifest+json", "svg": "image/svg+xml"
        ]
        task.didReceive(URLResponse(url: requested, mimeType: mimeTypes[file.pathExtension],
                                    expectedContentLength: data.count, textEncodingName: nil))
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        // Bundled reads are synchronous, so no pending work needs cancellation.
    }
}
