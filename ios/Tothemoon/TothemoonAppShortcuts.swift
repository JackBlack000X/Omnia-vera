import AppIntents
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
        "Apri \(.applicationName)",
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
