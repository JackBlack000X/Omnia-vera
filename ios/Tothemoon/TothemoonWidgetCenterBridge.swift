import Foundation
import WidgetKit
import React

@objc(WidgetCenterBridge)
final class WidgetCenterBridge: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(reloadAllTimelines:rejecter:)
  func reloadAllTimelines(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }

    resolve(nil)
  }
}
