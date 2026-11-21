import SwiftUI
import WebKit
import UIKit

@main
struct NukkadApp: App {
    private var storefrontURL: URL? {
        guard let setting = Bundle.main.object(forInfoDictionaryKey: "StorefrontURL") as? String,
              let url = URL(string: setting),
              url.scheme == "https", url.host != "your-nukkad.vercel.app", url.host != nil else {
            return nil
        }
        return url
    }

    var body: some Scene {
        WindowGroup {
            if let storefrontURL {
                StorefrontView(url: storefrontURL)
            } else {
                VStack(spacing: 12) {
                    Text("Nukkad").font(.largeTitle.bold())
                    Text("Set StorefrontURL in the Nukkad target’s Info settings to your deployed HTTPS website.")
                        .multilineTextAlignment(.center)
                }
                .padding()
            }
        }
    }
}

struct StorefrontView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> StorefrontController {
        StorefrontController(url: url)
    }

    func updateUIViewController(_ controller: StorefrontController, context: Context) {}
}

final class StorefrontController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private let url: URL
    private let storefront = WKWebView()
    private var paymentWindow: UIViewController?

    init(url: URL) {
        self.url = url
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.984, green: 0.984, blue: 0.976, alpha: 1)
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
