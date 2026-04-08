import SwiftUI
import WidgetKit

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

struct TodayWidgetRowView: View {
  let item: TodayWidgetItem
  let compact: Bool

  private var actionSymbol: String {
    item.targetCount > 1 ? "plus" : "checkmark"
  }

  private var displayTitle: String {
    let trimmed = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "Senza titolo" : trimmed
  }

  var body: some View {
    HStack(alignment: .top, spacing: compact ? 10 : 12) {
      Circle()
        .fill(Color(hex: item.color) ?? Color.white.opacity(0.7))
        .frame(width: compact ? 10 : 12, height: compact ? 10 : 12)
        .overlay(
          Circle()
            .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
        .padding(.top, 2)

      VStack(alignment: .leading, spacing: 5) {
        Text(displayTitle)
          .font(.system(size: compact ? 13 : 14, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(compact ? 2 : 2)
          .multilineTextAlignment(.leading)
          .minimumScaleFactor(0.82)
          .fixedSize(horizontal: false, vertical: true)

        HStack(spacing: 6) {
          Text("\(item.currentCount)/\(item.targetCount)")
            .font(.system(size: 11, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(item.isComplete ? Color(red: 0.45, green: 0.98, blue: 0.68) : Color.white.opacity(0.8))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Color.white.opacity(0.10))
            .clipShape(Capsule())
            .layoutPriority(1)

          if item.isComplete {
            Text("Fatto")
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(Color(red: 0.45, green: 0.98, blue: 0.68))
              .lineLimit(1)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .layoutPriority(1)

      if item.canIncrement {
        if #available(iOSApplicationExtension 17.0, *) {
          Button(intent: ToggleHabitIntent(habitId: item.action.habitId, logicalDate: item.action.logicalDate)) {
            Image(systemName: actionSymbol)
              .font(.system(size: 14, weight: .bold))
              .foregroundStyle(.white)
              .frame(width: compact ? 30 : 32, height: compact ? 30 : 32)
              .background(Color.white.opacity(0.16))
              .clipShape(Circle())
          }
          .buttonStyle(.plain)
        } else if let url = URL(string: item.deeplink) {
          Link(destination: url) {
            Image(systemName: "arrow.up.right")
              .font(.system(size: 13, weight: .bold))
              .foregroundStyle(.white)
              .frame(width: compact ? 30 : 32, height: compact ? 30 : 32)
              .background(Color.white.opacity(0.16))
              .clipShape(Circle())
          }
        }
      } else {
        Image(systemName: "checkmark")
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(Color(red: 0.45, green: 0.98, blue: 0.68))
          .frame(width: compact ? 30 : 32, height: compact ? 30 : 32)
          .background(Color(red: 0.14, green: 0.29, blue: 0.20))
          .clipShape(Circle())
      }
    }
    .padding(.horizontal, compact ? 10 : 12)
    .padding(.vertical, compact ? 9 : 10)
    .background(Color.white.opacity(compact ? 0.07 : 0.08))
    .overlay(
      RoundedRectangle(cornerRadius: compact ? 14 : 16, style: .continuous)
        .stroke(Color.white.opacity(0.08), lineWidth: 1)
    )
    .clipShape(RoundedRectangle(cornerRadius: compact ? 14 : 16, style: .continuous))
  }
}

struct TodayWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family

  let entry: TodayWidgetEntry

  private var isCompact: Bool {
    family == .systemSmall
  }

  private var visibleItems: ArraySlice<TodayWidgetItem> {
    switch family {
    case .systemSmall:
      return entry.snapshot.items.prefix(2)
    default:
      return entry.snapshot.items.prefix(3)
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

  var body: some View {
    VStack(alignment: .leading, spacing: isCompact ? 10 : 12) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 3) {
          Text("Oggi")
            .font(.system(size: isCompact ? 17 : 18, weight: .bold))
            .foregroundStyle(.white)

          Text(formattedLogicalDate)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.72))
        }

        Spacer()

        Text("\(entry.snapshot.progress.completedCount)/\(entry.snapshot.progress.totalCount)")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(.white)
          .padding(.horizontal, 9)
          .padding(.vertical, 5)
          .background(Color.white.opacity(0.14))
          .clipShape(Capsule())
      }

      if visibleItems.isEmpty {
        VStack(alignment: .leading, spacing: 8) {
          Image(systemName: "sparkles")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.78))

          Text("Nessuna attivita in programma.")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.9))

          Text("Tocca il widget per aprire la vista di oggi.")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Color.white.opacity(0.62))
            .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      } else {
        ForEach(Array(visibleItems)) { item in
          TodayWidgetRowView(item: item, compact: isCompact)
        }

        if !isCompact {
          HStack(spacing: 6) {
            Text("Apri Oggi")
              .font(.system(size: 11, weight: .semibold))
            Image(systemName: "arrow.up.right")
              .font(.system(size: 10, weight: .bold))
          }
          .foregroundStyle(Color.white.opacity(0.58))
          .padding(.top, 2)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(isCompact ? 14 : 16)
    .background(
      ZStack {
        LinearGradient(
          colors: [
            Color(red: 0.07, green: 0.10, blue: 0.18),
            Color(red: 0.11, green: 0.08, blue: 0.20),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )

        RadialGradient(
          colors: [
            Color.white.opacity(0.10),
            Color.clear,
          ],
          center: .topLeading,
          startRadius: 10,
          endRadius: 150
        )
      }
    )
    .widgetURL(URL(string: entry.snapshot.openAppDeeplink))
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
