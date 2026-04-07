import AppIntents
import WidgetKit

@available(iOS 17.0, *)
struct ToggleHabitIntent: AppIntent {
  static var title: LocalizedStringResource = "Completa attivita"
  static var openAppWhenRun = false

  @Parameter(title: "Habit ID")
  var habitId: String

  @Parameter(title: "Logical Date")
  var logicalDate: String

  init() {}

  init(habitId: String, logicalDate: String) {
    self.habitId = habitId
    self.logicalDate = logicalDate
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    let command = TodayWidgetCommand(
      kind: "toggleHabit",
      habitId: habitId,
      logicalDate: logicalDate
    )

    TodayWidgetStore.appendCommand(command)
    TodayWidgetStore.applyCommand(command)
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}
