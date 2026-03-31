const { createRunOncePlugin, withAppDelegate, IOSConfig } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const SHORTCUTS_FILE_PATH = 'TothemoonAppShortcuts.swift';
const SHORTCUTS_FILE_CONTENTS = `import AppIntents
import Foundation

@available(iOS 16.0, *)
struct OpenTothemoonIntent: AppIntent {
  static var title: LocalizedStringResource = "Apri Tothemoon"
  static var openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    .result()
  }
}

@available(iOS 16.0, *)
struct TothemoonAppShortcuts: AppShortcutsProvider {
  static var shortcutTileColor: ShortcutTileColor = .navy

  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: OpenTothemoonIntent(),
      phrases: [
        "Apri \\(.applicationName)",
      ],
      shortTitle: "Apri app",
      systemImageName: "moon.stars.fill"
    )
  }
}

@objc(TothemoonAppShortcutsRegistrar)
final class TothemoonAppShortcutsRegistrar: NSObject {
  @objc func updateShortcuts() {
    guard #available(iOS 16.0, *) else {
      return
    }

    TothemoonAppShortcuts.updateAppShortcutParameters()
  }
}
`;

function withTothemoonActionButton(config) {
  config = IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: SHORTCUTS_FILE_PATH,
    contents: SHORTCUTS_FILE_CONTENTS,
    overwrite: true,
  });

  config = withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('with-tothemoon-action-button supports only Swift AppDelegate files.');
    }

    let contents = config.modResults.contents;

    if (!contents.includes('import Foundation')) {
      contents = mergeContents({
        tag: 'tothemoon-action-button-import',
        src: contents,
        newSrc: 'import Foundation',
        anchor: /internal import Expo/,
        offset: 0,
        comment: '//',
      }).contents;
    }

    if (!contents.includes('private func updateAppShortcutsIfAvailable()')) {
      contents = mergeContents({
        tag: 'tothemoon-action-button-helper',
        src: contents,
        newSrc: [
          '  private func updateAppShortcutsIfAvailable() {',
          '    let selector = NSSelectorFromString("updateShortcuts")',
          '',
          '    guard let registrarClass = NSClassFromString("TothemoonAppShortcutsRegistrar") as? NSObject.Type else {',
          '      return',
          '    }',
          '',
          '    let registrar = registrarClass.init()',
          '    guard registrar.responds(to: selector) else {',
          '      return',
          '    }',
          '',
          '    _ = registrar.perform(selector)',
          '  }',
          '',
        ].join('\n'),
        anchor: /  public override func application\(/,
        offset: 0,
        comment: '//',
      }).contents;
    }

    if (!contents.includes('    updateAppShortcutsIfAvailable()')) {
      contents = mergeContents({
        tag: 'tothemoon-action-button-init',
        src: contents,
        newSrc: '    updateAppShortcutsIfAvailable()',
        anchor: /return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/,
        offset: 0,
        comment: '//',
      }).contents;
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
}

module.exports = createRunOncePlugin(withTothemoonActionButton, 'with-tothemoon-action-button', '1.0.0');
