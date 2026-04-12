import SwiftUI
import WidgetKit

private func normalizedWidgetTitle(_ title: String) -> String {
  let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty ? "Senza titolo" : trimmed
}

private let widgetTimeZone = TimeZone(identifier: "Europe/Zurich") ?? .current

private func widgetYmdAndMinutes(from date: Date) -> (ymd: String, minutes: Int) {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = widgetTimeZone
  let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
  let year = components.year ?? 0
  let month = components.month ?? 1
  let day = components.day ?? 1
  let hour = components.hour ?? 0
  let minute = components.minute ?? 0
  return (String(format: "%04d-%02d-%02d", year, month, day), hour * 60 + minute)
}

private func widgetNextYmd(_ ymd: String) -> String {
  let parts = ymd.split(separator: "-").compactMap { Int($0) }
  guard parts.count == 3 else { return ymd }
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
  let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) ?? Date()
  let nextDate = calendar.date(byAdding: .day, value: 1, to: date) ?? date
  let next = calendar.dateComponents([.year, .month, .day], from: nextDate)
  return String(format: "%04d-%02d-%02d", next.year ?? 0, next.month ?? 1, next.day ?? 1)
}

private func widgetMinutes(from hhmm: String) -> Int {
  let parts = hhmm.split(separator: ":").compactMap { Int($0) }
  guard parts.count == 2 else { return 0 }
  return parts[0] * 60 + parts[1]
}

private func widgetCurrentLogicalMinute(now: Date, logicalDate: String, dayResetTime: String) -> Int? {
  let resetMinutes = dayResetTime == "00:00" ? 0 : widgetMinutes(from: dayResetTime)
  let zoned = widgetYmdAndMinutes(from: now)

  if zoned.ymd == logicalDate && zoned.minutes >= resetMinutes {
    return zoned.minutes
  }
  if resetMinutes > 0 && zoned.ymd == widgetNextYmd(logicalDate) && zoned.minutes < resetMinutes {
    return 1440 + zoned.minutes
  }
  if resetMinutes == 0 && zoned.ymd == logicalDate {
    return zoned.minutes
  }

  return nil
}

private func widgetFormatMinutes(_ totalMinutes: Int) -> String {
  let normalized = ((totalMinutes % 1440) + 1440) % 1440
  return String(format: "%02d:%02d", normalized / 60, normalized % 60)
}

private func widgetPriority(
  for item: TodayWidgetItem,
  logicalDate: String,
  dayResetTime: String,
  now: Date
) -> (group: Int, minute: Int) {
  let timedSlots = item.occurrenceSlots.filter(\.isTimed).sorted { left, right in
    left.start == right.start ? left.end < right.end : left.start < right.start
  }
  let currentLogicalMinute = widgetCurrentLogicalMinute(now: now, logicalDate: logicalDate, dayResetTime: dayResetTime)

  if !timedSlots.isEmpty {
    if let currentLogicalMinute {
      if let activeSlot = timedSlots.first(where: { $0.start <= currentLogicalMinute && currentLogicalMinute < $0.end }) {
        return (item.isComplete ? 4 : 0, activeSlot.start)
      }
      if let nextSlot = timedSlots.first(where: { $0.start >= currentLogicalMinute }) {
        return (item.isComplete ? 5 : 1, nextSlot.start)
      }
    }

    return (item.isComplete ? 6 : 3, timedSlots.first?.start ?? Int.max)
  }

  if !item.occurrenceSlots.isEmpty {
    return (item.isComplete ? 7 : 2, Int.max)
  }

  return (item.isComplete ? 9 : 8, Int.max)
}

private func widgetTimeLabel(
  for item: TodayWidgetItem,
  logicalDate: String,
  dayResetTime: String,
  now: Date
) -> String? {
  let timedSlots = item.occurrenceSlots.filter(\.isTimed).sorted { left, right in
    left.start == right.start ? left.end < right.end : left.start < right.start
  }
  let currentLogicalMinute = widgetCurrentLogicalMinute(now: now, logicalDate: logicalDate, dayResetTime: dayResetTime)

  if !timedSlots.isEmpty {
    if let currentLogicalMinute {
      if timedSlots.contains(where: { $0.start <= currentLogicalMinute && currentLogicalMinute < $0.end }) {
        return "Adesso"
      }
      if let nextSlot = timedSlots.first(where: { $0.start >= currentLogicalMinute }) {
        return "Alle \(widgetFormatMinutes(nextSlot.start))"
      }
    }

    if let firstSlot = timedSlots.first {
      return "Alle \(widgetFormatMinutes(firstSlot.start))"
    }
  }

  if !item.occurrenceSlots.isEmpty {
    return "In giornata"
  }

  return item.timeLabel
}

struct TodayWidgetEntry: TimelineEntry {
  let date: Date
  let snapshot: TodayWidgetSnapshot
}

struct TodayWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayWidgetEntry {
    TodayWidgetEntry(date: Date(), snapshot: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayWidgetEntry) -> Void) {
    completion(TodayWidgetEntry(date: Date(), snapshot: TodayWidgetStore.readSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayWidgetEntry>) -> Void) {
    let entry = TodayWidgetEntry(date: Date(), snapshot: TodayWidgetStore.readSnapshot())
    let refreshDate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
    completion(Timeline(entries: [entry], policy: .after(refreshDate)))
  }
}

struct TodayWidgetCountBadge: View {
  let item: TodayWidgetItem
  let compact: Bool

  var body: some View {
    Text("\(item.currentCount)/\(item.targetCount)")
      .font(.system(size: compact ? 11 : 12, weight: .bold))
      .monospacedDigit()
      .foregroundStyle(item.isComplete ? Color(red: 0.45, green: 0.98, blue: 0.68) : Color.white.opacity(0.84))
      .padding(.horizontal, compact ? 8 : 9)
      .padding(.vertical, compact ? 4 : 5)
      .background(Color.white.opacity(0.10))
      .clipShape(Capsule())
  }
}

struct TodayWidgetActionButton: View {
  let item: TodayWidgetItem
  let size: CGFloat
  let symbolSize: CGFloat

  private var actionSymbol: String {
    item.targetCount > 1 ? "plus" : "checkmark"
  }

  var body: some View {
    Group {
      if item.canIncrement {
        if #available(iOSApplicationExtension 17.0, *) {
          Button(intent: ToggleHabitIntent(habitId: item.action.habitId, logicalDate: item.action.logicalDate)) {
            Image(systemName: actionSymbol)
              .font(.system(size: symbolSize, weight: .bold))
              .foregroundStyle(.white)
              .frame(width: size, height: size)
              .background(Color.white.opacity(0.14))
              .clipShape(Circle())
          }
          .buttonStyle(.plain)
        } else if let url = URL(string: item.deeplink) {
          Link(destination: url) {
            Image(systemName: "arrow.up.right")
              .font(.system(size: symbolSize, weight: .bold))
              .foregroundStyle(.white)
              .frame(width: size, height: size)
              .background(Color.white.opacity(0.14))
              .clipShape(Circle())
          }
        }
      } else {
        Image(systemName: "checkmark")
          .font(.system(size: symbolSize, weight: .bold))
          .foregroundStyle(Color(red: 0.45, green: 0.98, blue: 0.68))
          .frame(width: size, height: size)
          .background(Color(red: 0.12, green: 0.24, blue: 0.16))
          .clipShape(Circle())
      }
    }
  }
}

struct TodayWidgetRowView: View {
  let item: TodayWidgetItem
  let resolvedTimeLabel: String?
  let compact: Bool
  let ultraCompact: Bool

  private var titleFontSize: CGFloat {
    compact ? 12 : (ultraCompact ? 13 : 14)
  }

  private var actionSize: CGFloat {
    compact ? 26 : (ultraCompact ? 28 : 32)
  }

  var body: some View {
    HStack(alignment: .top, spacing: compact ? 8 : (ultraCompact ? 10 : 12)) {
      Circle()
        .fill(Color(hex: item.color) ?? Color.white.opacity(0.7))
        .frame(width: compact ? 8 : (ultraCompact ? 10 : 12), height: compact ? 8 : (ultraCompact ? 10 : 12))
        .overlay(
          Circle()
            .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
        .padding(.top, 2)

      VStack(alignment: .leading, spacing: compact ? 4 : (ultraCompact ? 4 : 5)) {
        if let timeLabel = resolvedTimeLabel, !timeLabel.isEmpty {
          Text(timeLabel)
            .font(.system(size: compact ? 9 : 10, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.56))
            .lineLimit(1)
        }

        Text(normalizedWidgetTitle(item.title))
          .font(.system(size: titleFontSize, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(compact || ultraCompact ? 1 : 2)
          .multilineTextAlignment(.leading)
          .minimumScaleFactor(0.82)
          .fixedSize(horizontal: false, vertical: true)

        HStack(spacing: compact ? 4 : (ultraCompact ? 5 : 6)) {
          TodayWidgetCountBadge(item: item, compact: compact || ultraCompact)
            .layoutPriority(1)

          if item.isComplete && !compact && !ultraCompact {
            Text("Fatto")
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(Color(red: 0.45, green: 0.98, blue: 0.68))
              .lineLimit(1)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .layoutPriority(1)

      TodayWidgetActionButton(
        item: item,
        size: actionSize,
        symbolSize: compact ? 12 : (ultraCompact ? 13 : 14)
      )
    }
    .padding(.horizontal, compact ? 8 : (ultraCompact ? 10 : 12))
    .padding(.vertical, compact ? 7 : (ultraCompact ? 8 : 10))
    .background(Color.white.opacity(compact ? 0.05 : (ultraCompact ? 0.06 : 0.07)))
    .overlay(
      RoundedRectangle(cornerRadius: compact ? 14 : (ultraCompact ? 15 : 16), style: .continuous)
        .stroke(Color.white.opacity(0.08), lineWidth: 1)
    )
    .clipShape(RoundedRectangle(cornerRadius: compact ? 14 : (ultraCompact ? 15 : 16), style: .continuous))
  }
}

struct TodayWidgetSmallView: View {
  let item: TodayWidgetItem
  let resolvedTimeLabel: String?
  let logicalDate: String
  let progress: TodayWidgetProgress

  private var displayTitle: String {
    normalizedWidgetTitle(item.title)
  }

  private var formattedLogicalDate: String {
    let parser = DateFormatter()
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.dateFormat = "yyyy-MM-dd"

    guard let date = parser.date(from: logicalDate) else {
      return logicalDate
    }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "it_IT")
    formatter.dateFormat = "d MMM"
    return formatter.string(from: date).capitalized
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Oggi")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(.white)

          Text(formattedLogicalDate)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.58))
            .lineLimit(1)
        }

        Spacer(minLength: 6)

        Text("\(progress.completedCount)/\(progress.totalCount)")
          .font(.system(size: 11, weight: .bold))
          .monospacedDigit()
          .foregroundStyle(.white)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(Color.white.opacity(0.10))
          .clipShape(Capsule())
      }

      Spacer(minLength: 0)

      VStack(alignment: .leading, spacing: 8) {
        if let timeLabel = resolvedTimeLabel, !timeLabel.isEmpty {
          Text(timeLabel)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.62))
            .lineLimit(1)
        }

        HStack(alignment: .top, spacing: 10) {
          Circle()
            .fill(Color(hex: item.color) ?? Color.white.opacity(0.75))
            .frame(width: 10, height: 10)
            .overlay(
              Circle()
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
            )
            .padding(.top, 6)

          Text(displayTitle)
            .font(.system(size: 26, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .lineLimit(3)
            .minimumScaleFactor(0.65)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }

      Spacer(minLength: 0)

      HStack(alignment: .center) {
        TodayWidgetCountBadge(item: item, compact: false)

        Spacer(minLength: 8)

        TodayWidgetActionButton(item: item, size: 40, symbolSize: 16)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct TodayWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family

  let entry: TodayWidgetEntry

  private var now: Date {
    Date()
  }

  private var isCompact: Bool {
    family == .systemSmall
  }

  private var isMedium: Bool {
    family == .systemMedium
  }

  private var sortedItems: [TodayWidgetItem] {
    entry.snapshot.items.sorted { left, right in
      let leftPriority = widgetPriority(
        for: left,
        logicalDate: entry.snapshot.logicalDate,
        dayResetTime: entry.snapshot.dayResetTime,
        now: now
      )
      let rightPriority = widgetPriority(
        for: right,
        logicalDate: entry.snapshot.logicalDate,
        dayResetTime: entry.snapshot.dayResetTime,
        now: now
      )

      if leftPriority.group != rightPriority.group {
        return leftPriority.group < rightPriority.group
      }
      if leftPriority.minute != rightPriority.minute {
        return leftPriority.minute < rightPriority.minute
      }
      return normalizedWidgetTitle(left.title) < normalizedWidgetTitle(right.title)
    }
  }

  private var primaryItem: TodayWidgetItem? {
    sortedItems.first
  }

  private var visibleItems: ArraySlice<TodayWidgetItem> {
    switch family {
    case .systemSmall:
      return sortedItems.prefix(1)
    case .systemMedium:
      return sortedItems.prefix(3)
    default:
      return sortedItems.prefix(3)
    }
  }

  private var formattedLogicalDate: String {
    let parser = DateFormatter()
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.dateFormat = "yyyy-MM-dd"

    guard let date = parser.date(from: entry.snapshot.logicalDate) else {
      return entry.snapshot.logicalDate
    }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "it_IT")
    formatter.dateFormat = isCompact ? "d MMM" : "EEEE d MMM"
    return formatter.string(from: date).capitalized
  }

  @ViewBuilder
  private var widgetBackground: some View {
    Color.black
  }

  @ViewBuilder
  private var emptyState: some View {
    VStack(alignment: .leading, spacing: isCompact ? 6 : 8) {
      Image(systemName: "sparkles")
        .font(.system(size: isCompact ? 16 : 18, weight: .semibold))
        .foregroundStyle(Color.white.opacity(0.78))

      Text(isCompact ? "Nessuna attivita" : "Nessuna attivita in programma.")
        .font(.system(size: isCompact ? 12 : 13, weight: .semibold))
        .foregroundStyle(Color.white.opacity(0.9))
        .lineLimit(isCompact ? 2 : 3)

      Text(isCompact ? "Tocca per aprire Oggi." : "Tocca il widget per aprire la vista di oggi.")
        .font(.system(size: isCompact ? 10 : 11, weight: .medium))
        .foregroundStyle(Color.white.opacity(0.62))
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  @ViewBuilder
  private var regularContent: some View {
    VStack(alignment: .leading, spacing: isMedium ? 10 : 12) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 3) {
          Text("Oggi")
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(.white)

          Text(formattedLogicalDate)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.72))
            .lineLimit(1)
        }

        Spacer(minLength: 6)

        Text("\(entry.snapshot.progress.completedCount)/\(entry.snapshot.progress.totalCount)")
          .font(.system(size: 12, weight: .bold))
          .monospacedDigit()
          .foregroundStyle(.white)
          .lineLimit(1)
          .fixedSize(horizontal: true, vertical: false)
          .padding(.horizontal, 9)
          .padding(.vertical, 5)
          .background(Color.white.opacity(0.12))
          .clipShape(Capsule())
      }

      if visibleItems.isEmpty {
        emptyState
      } else {
        ForEach(Array(visibleItems)) { item in
          TodayWidgetRowView(
            item: item,
            resolvedTimeLabel: widgetTimeLabel(
              for: item,
              logicalDate: entry.snapshot.logicalDate,
              dayResetTime: entry.snapshot.dayResetTime,
              now: now
            ),
            compact: false,
            ultraCompact: false
          )
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  @ViewBuilder
  private var widgetContent: some View {
    if isCompact, let item = primaryItem {
      TodayWidgetSmallView(
        item: item,
        resolvedTimeLabel: widgetTimeLabel(
          for: item,
          logicalDate: entry.snapshot.logicalDate,
          dayResetTime: entry.snapshot.dayResetTime,
          now: now
        ),
        logicalDate: entry.snapshot.logicalDate,
        progress: entry.snapshot.progress
      )
    } else if isCompact {
      emptyState
    } else {
      regularContent
    }
  }

  var body: some View {
    if #available(iOSApplicationExtension 17.0, *) {
      widgetContent
        .padding(isCompact ? 12 : 16)
        .containerBackground(for: .widget) {
          widgetBackground
        }
        .widgetURL(URL(string: entry.snapshot.openAppDeeplink))
    } else {
      widgetContent
        .padding(isCompact ? 12 : 16)
        .background(widgetBackground)
        .widgetURL(URL(string: entry.snapshot.openAppDeeplink))
    }
  }
}

struct TodayWidget: Widget {
  static let kind = "TodayWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: TodayWidgetProvider()) { entry in
      TodayWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Oggi")
    .description("Mostra le attivita di oggi e consente completamenti rapidi.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct TothemoonWidgetsBundle: WidgetBundle {
  var body: some Widget {
    TodayWidget()
    // Future widgets can be added here while reusing the same App Group pipeline.
  }
}

@available(iOS 17.0, *)
#Preview("Today Small", as: .systemSmall) {
  TodayWidget()
} timeline: {
  TodayWidgetEntry(date: .now, snapshot: .previewSmall)
}

@available(iOS 17.0, *)
#Preview("Today Medium", as: .systemMedium) {
  TodayWidget()
} timeline: {
  TodayWidgetEntry(date: .now, snapshot: .previewMedium)
}

@available(iOS 17.0, *)
#Preview("Today Empty", as: .systemSmall) {
  TodayWidget()
} timeline: {
  TodayWidgetEntry(date: .now, snapshot: .previewEmpty)
}
