// @generated begin tothemoon-action-button-import - expo prebuild (DO NOT MODIFY) sync-98abc2deda3149cb9fe0f124213aea0c6092cd44
import Foundation
// @generated end tothemoon-action-button-import
internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

// @generated begin tothemoon-action-button-helper - expo prebuild (DO NOT MODIFY) sync-69b69bc4f7a7237a48924a025c2d2b6cdab60785
  private func updateAppShortcutsIfAvailable() {
    let selector = NSSelectorFromString("updateShortcuts")

    guard let registrarClass = NSClassFromString("TothemoonAppShortcutsRegistrar") as? NSObject.Type else {
      return
    }

    let registrar = registrarClass.init()
    guard registrar.responds(to: selector) else {
      return
    }

    _ = registrar.perform(selector)
  }

// @generated end tothemoon-action-button-helper
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

// @generated begin tothemoon-action-button-init - expo prebuild (DO NOT MODIFY) sync-80dc3ae4e0454ad8d4a5e3c51c394f0a19442454
    updateAppShortcutsIfAvailable()
// @generated end tothemoon-action-button-init
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
