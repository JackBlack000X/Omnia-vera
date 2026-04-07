const { createRunOncePlugin, IOSConfig } = require('expo/config-plugins');

const SWIFT_FILE_PATH = 'TothemoonWidgetCenterBridge.swift';
const SWIFT_FILE_CONTENTS = `import Foundation
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
`;

const OBJC_FILE_PATH = 'WidgetCenterBridge.m';
const OBJC_FILE_CONTENTS = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetCenterBridge, NSObject)

RCT_EXTERN_METHOD(reloadAllTimelines:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`;

function withTothemoonWidgetCenter(config) {
  config = IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: SWIFT_FILE_PATH,
    contents: SWIFT_FILE_CONTENTS,
    overwrite: true,
  });

  config = IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: OBJC_FILE_PATH,
    contents: OBJC_FILE_CONTENTS,
    overwrite: true,
  });

  return config;
}

module.exports = createRunOncePlugin(
  withTothemoonWidgetCenter,
  'with-tothemoon-widget-center',
  '1.0.0'
);
