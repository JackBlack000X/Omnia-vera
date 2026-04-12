import Foundation
import SwiftUI

enum TodayWidgetShared {
  static let appGroup = "group.com.jackblack000x.habitchecknative"
  static let snapshotKey = "tothemoon_widget_today_snapshot_v1"
  static let commandQueueKey = "tothemoon_widget_command_queue_v1"
}

struct TodayWidgetCommand: Codable {
  let kind: String
  let habitId: String
  let logicalDate: String
}

struct TodayWidgetOccurrenceSlot: Codable {
  let start: Int
  let end: Int
  let isTimed: Bool
}

struct TodayWidgetItem: Codable, Identifiable {
  let id: String
  let title: String
  let color: String?
  let timeLabel: String?
  let occurrenceSlots: [TodayWidgetOccurrenceSlot]
  let currentCount: Int
  let targetCount: Int
  let isComplete: Bool
  let canIncrement: Bool
  let deeplink: String
  let action: TodayWidgetCommand
}

struct TodayWidgetProgress: Codable {
  let completedCount: Int
  let totalCount: Int
}

struct TodayWidgetSnapshot: Codable {
  let version: Int
  let logicalDate: String
  let dayResetTime: String
  let generatedAt: String
  let openAppDeeplink: String
  let progress: TodayWidgetProgress
  let items: [TodayWidgetItem]

  static let placeholder = TodayWidgetSnapshot(
    version: 1,
    logicalDate: "2026-04-07",
    dayResetTime: "02:00",
    generatedAt: "2026-04-07T12:00:00.000Z",
    openAppDeeplink: "habitchecknative://oggi",
    progress: TodayWidgetProgress(completedCount: 1, totalCount: 3),
    items: [
      TodayWidgetItem(
        id: "placeholder-1",
        title: "Bere acqua",
        color: "#3b82f6",
        timeLabel: "Adesso",
        occurrenceSlots: [TodayWidgetOccurrenceSlot(start: 840, end: 960, isTimed: true)],
        currentCount: 2,
        targetCount: 3,
        isComplete: false,
        canIncrement: true,
        deeplink: "habitchecknative://oggi",
        action: TodayWidgetCommand(kind: "toggleHabit", habitId: "placeholder-1", logicalDate: "2026-04-07")
      ),
      TodayWidgetItem(
        id: "placeholder-2",
        title: "Leggere",
        color: "#8b5cf6",
        timeLabel: "Alle 18:30",
        occurrenceSlots: [TodayWidgetOccurrenceSlot(start: 1110, end: 1170, isTimed: true)],
        currentCount: 0,
        targetCount: 1,
        isComplete: false,
        canIncrement: true,
        deeplink: "habitchecknative://oggi",
        action: TodayWidgetCommand(kind: "toggleHabit", habitId: "placeholder-2", logicalDate: "2026-04-07")
      ),
      TodayWidgetItem(
        id: "placeholder-3",
        title: "Camminare",
        color: "#10b981",
        timeLabel: "In giornata",
        occurrenceSlots: [TodayWidgetOccurrenceSlot(start: 120, end: 1560, isTimed: false)],
        currentCount: 1,
        targetCount: 1,
        isComplete: true,
        canIncrement: false,
        deeplink: "habitchecknative://oggi",
        action: TodayWidgetCommand(kind: "toggleHabit", habitId: "placeholder-3", logicalDate: "2026-04-07")
      ),
    ]
  )

  static let previewSmall = TodayWidgetSnapshot(
    version: 1,
    logicalDate: "2026-04-07",
    dayResetTime: "02:00",
    generatedAt: "2026-04-07T22:00:00.000Z",
    openAppDeeplink: "habitchecknative://oggi",
    progress: TodayWidgetProgress(completedCount: 1, totalCount: 3),
    items: [
      TodayWidgetItem(
        id: "preview-small-1",
        title: "Bere acqua",
        color: "#f59e0b",
        timeLabel: "Adesso",
        occurrenceSlots: [TodayWidgetOccurrenceSlot(start: 840, end: 960, isTimed: true)],
        currentCount: 2,
        targetCount: 3,
        isComplete: false,
        canIncrement: true,
        deeplink: "habitchecknative://oggi",
        action: TodayWidgetCommand(kind: "toggleHabit", habitId: "preview-small-1", logicalDate: "2026-04-07")
      ),
      TodayWidgetItem(
        id: "preview-small-2",
        title: "Hetze",
        color: "#7c3aed",
        timeLabel: "Alle 18:30",
        occurrenceSlots: [TodayWidgetOccurrenceSlot(start: 1110, end: 1170, isTimed: true)],
        currentCount: 0,
        targetCount: 1,
        isComplete: false,
        canIncrement: true,
        deeplink: "habitchecknative://oggi",
        action: TodayWidgetCommand(kind: "toggleHabit", habitId: "preview-small-2", logicalDate: "2026-04-07")
      ),
    ]
  )

  static let previewMedium = TodayWidgetSnapshot(
    version: 1,
    logicalDate: "2026-04-07",
    dayResetTime: "02:00",
    generatedAt: "2026-04-07T22:00:00.000Z",
    openAppDeeplink: "habitchecknative://oggi",
    progress: TodayWidgetProgress(completedCount: 2, totalCount: 4),
    items: [
      TodayWidgetItem(
        id: "preview-medium-1",
        title: "Stujfe",
        color: "#f59e0b",
        timeLabel: "Adesso",
        occurrenceSlots: [TodayWidgetOccurrenceSlot(start: 840, end: 960, isTimed: true)],
        currentCount: 0,
        targetCount: 1,
        isComplete: false,
        canIncrement: true,
        deeplink: "habitchecknative://oggi",
        action: TodayWidgetCommand(kind: "toggleHabit", habitId: "preview-medium-1", logicalDate: "2026-04-07")
      ),
      TodayWidgetItem(
        id: "preview-medium-2",
        title: "Hetze",
        color: "#7c3aed",
        timeLabel: "Alle 18:30",
        occurrenceSlots: [TodayWidgetOccurrenceSlot(start: 1110, end: 1170, isTimed: true)],
        currentCount: 0,
        targetCount: 1,
        isComplete: false,
        canIncrement: true,
        deeplink: "habitchecknative://oggi",
        action: TodayWidgetCommand(kind: "toggleHabit", habitId: "preview-medium-2", logicalDate: "2026-04-07")
      ),
      TodayWidgetItem(
        id: "preview-medium-3",
        title: "Allenamento",
        color: "#22c55e",
        timeLabel: "In giornata",
        occurrenceSlots: [TodayWidgetOccurrenceSlot(start: 120, end: 1560, isTimed: false)],
        currentCount: 1,
        targetCount: 1,
        isComplete: true,
        canIncrement: false,
        deeplink: "habitchecknative://oggi",
        action: TodayWidgetCommand(kind: "toggleHabit", habitId: "preview-medium-3", logicalDate: "2026-04-07")
      ),
    ]
  )

  static let previewEmpty = TodayWidgetSnapshot(
    version: 1,
    logicalDate: "2026-04-07",
    dayResetTime: "02:00",
    generatedAt: "2026-04-07T22:00:00.000Z",
    openAppDeeplink: "habitchecknative://oggi",
    progress: TodayWidgetProgress(completedCount: 0, totalCount: 0),
    items: []
  )
}

enum TodayWidgetStore {
  static func readSnapshot() -> TodayWidgetSnapshot {
    guard
      let defaults = UserDefaults(suiteName: TodayWidgetShared.appGroup),
      let rawSnapshot = defaults.string(forKey: TodayWidgetShared.snapshotKey),
      let data = rawSnapshot.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(TodayWidgetSnapshot.self, from: data)
    else {
      return .placeholder
    }

    return decoded
  }

  static func appendCommand(_ command: TodayWidgetCommand) {
    guard let defaults = UserDefaults(suiteName: TodayWidgetShared.appGroup) else {
      return
    }

    let existing: [TodayWidgetCommand]
    if
      let rawQueue = defaults.string(forKey: TodayWidgetShared.commandQueueKey),
      let data = rawQueue.data(using: .utf8),
      let decoded = try? JSONDecoder().decode([TodayWidgetCommand].self, from: data)
    {
      existing = decoded
    } else {
      existing = []
    }

    let nextQueue = existing + [command]
    if
      let encoded = try? JSONEncoder().encode(nextQueue),
      let encodedString = String(data: encoded, encoding: .utf8)
    {
      defaults.set(encodedString, forKey: TodayWidgetShared.commandQueueKey)
    }
  }

  static func applyCommand(_ command: TodayWidgetCommand) {
    let currentSnapshot = readSnapshot()

    var completedCount = currentSnapshot.progress.completedCount
    let nextItems = currentSnapshot.items.map { item -> TodayWidgetItem in
      guard
        item.action.habitId == command.habitId,
        item.action.logicalDate == command.logicalDate,
        item.canIncrement
      else {
        return item
      }

      let nextCurrentCount = min(item.targetCount, item.currentCount + 1)
      let nextIsComplete = nextCurrentCount >= item.targetCount
      if nextIsComplete && !item.isComplete {
        completedCount += 1
      }

      return TodayWidgetItem(
        id: item.id,
        title: item.title,
        color: item.color,
        timeLabel: item.timeLabel,
        occurrenceSlots: item.occurrenceSlots,
        currentCount: nextCurrentCount,
        targetCount: item.targetCount,
        isComplete: nextIsComplete,
        canIncrement: !nextIsComplete,
        deeplink: item.deeplink,
        action: item.action
      )
    }

    let nextSnapshot = TodayWidgetSnapshot(
      version: currentSnapshot.version,
      logicalDate: currentSnapshot.logicalDate,
      dayResetTime: currentSnapshot.dayResetTime,
      generatedAt: ISO8601DateFormatter().string(from: Date()),
      openAppDeeplink: currentSnapshot.openAppDeeplink,
      progress: TodayWidgetProgress(
        completedCount: min(completedCount, currentSnapshot.progress.totalCount),
        totalCount: currentSnapshot.progress.totalCount
      ),
      items: nextItems
    )

    saveSnapshot(nextSnapshot)
  }

  private static func saveSnapshot(_ snapshot: TodayWidgetSnapshot) {
    guard
      let defaults = UserDefaults(suiteName: TodayWidgetShared.appGroup),
      let encoded = try? JSONEncoder().encode(snapshot),
      let encodedString = String(data: encoded, encoding: .utf8)
    else {
      return
    }

    defaults.set(encodedString, forKey: TodayWidgetShared.snapshotKey)
  }
}

extension Color {
  init?(hex: String?) {
    guard let hex, hex.hasPrefix("#") else {
      return nil
    }

    let sanitized = String(hex.dropFirst())
    guard sanitized.count == 6, let value = Int(sanitized, radix: 16) else {
      return nil
    }

    let red = Double((value >> 16) & 0xFF) / 255.0
    let green = Double((value >> 8) & 0xFF) / 255.0
    let blue = Double(value & 0xFF) / 255.0
    self.init(red: red, green: green, blue: blue)
  }
}
