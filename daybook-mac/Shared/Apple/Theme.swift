import SwiftUI

/// Daybook's colours: off-white paper, charcoal ink, soft greys, and colour only
/// for priority, importance and overdue tasks. Built from the colour scheme so it
/// works the same in the app and in the widget.
struct Palette {
    let scheme: ColorScheme

    init(_ scheme: ColorScheme) { self.scheme = scheme }

    private var dark: Bool { scheme == .dark }

    /// Page background.
    var paper: Color { dark ? Color(red: 0.118, green: 0.118, blue: 0.125) : Color(red: 0.980, green: 0.976, blue: 0.965) }
    /// Raised surfaces: the quick-entry field, cards.
    var card: Color { dark ? Color.white.opacity(0.06) : Color.white.opacity(0.85) }
    /// Main text and the filled checkbox.
    var ink: Color { dark ? Color(red: 0.925, green: 0.925, blue: 0.933) : Color(red: 0.169, green: 0.169, blue: 0.180) }
    /// Secondary text.
    var muted: Color { dark ? Color.white.opacity(0.55) : Color.black.opacity(0.48) }
    /// Thin borders and dividers.
    var hairline: Color { dark ? Color.white.opacity(0.10) : Color.black.opacity(0.08) }
    /// Empty checkbox ring.
    var ring: Color { dark ? Color.white.opacity(0.32) : Color.black.opacity(0.25) }
    /// Progress track.
    var track: Color { dark ? Color.white.opacity(0.10) : Color.black.opacity(0.07) }

    /// The star on important tasks.
    var important: Color { Color(red: 0.92, green: 0.58, blue: 0.20) }
    /// Overdue dates.
    var overdue: Color { dark ? Color(red: 0.95, green: 0.45, blue: 0.42) : Color(red: 0.80, green: 0.30, blue: 0.27) }

    func priority(_ p: Priority) -> Color {
        switch p {
        case .none: return ring
        case .low: return dark ? Color(red: 0.55, green: 0.65, blue: 0.85) : Color(red: 0.36, green: 0.47, blue: 0.66)
        case .medium: return important
        case .high: return overdue
        }
    }
}

/// The round checkbox used everywhere. Its ring takes the priority colour.
struct CheckCircle: View {
    var isDone: Bool
    var priority: Priority = .none
    var size: CGFloat = 18
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        ZStack {
            Circle()
                .strokeBorder(isDone ? palette.ink : palette.priority(priority), lineWidth: max(1.2, size / 12))
            Circle()
                .fill(palette.ink)
                .scaleEffect(isDone ? 1 : 0.001)
                .opacity(isDone ? 1 : 0)
            Image(systemName: "checkmark")
                .font(.system(size: size * 0.52, weight: .bold))
                .foregroundStyle(palette.paper)
                .scaleEffect(isDone ? 1 : 0.4)
                .opacity(isDone ? 1 : 0)
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isDone)
        .accessibilityLabel(isDone ? "Done" : "Not done")
    }
}

/// A thin circular progress ring with the count in the middle.
struct ProgressRing: View {
    var done: Int
    var total: Int
    var size: CGFloat = 34
    var lineWidth: CGFloat = 3.5
    var showsCount: Bool = true
    @Environment(\.colorScheme) private var scheme

    private var fraction: Double { total == 0 ? 0 : Double(done) / Double(total) }

    var body: some View {
        let palette = Palette(scheme)
        ZStack {
            Circle().stroke(palette.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(palette.ink, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if showsCount {
                if total > 0 && done == total {
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.34, weight: .bold))
                        .foregroundStyle(palette.ink)
                } else {
                    Text("\(done)/\(total)")
                        .font(.system(size: size * 0.27, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(palette.ink)
                        .minimumScaleFactor(0.6)
                }
            }
        }
        .frame(width: size, height: size)
        .animation(.easeInOut(duration: 0.35), value: fraction)
        .accessibilityElement()
        .accessibilityLabel("\(done) of \(total) tasks done today")
    }
}

/// A thin progress bar.
struct ProgressBar: View {
    var done: Int
    var total: Int
    var height: CGFloat = 4
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        let fraction = total == 0 ? 0 : CGFloat(done) / CGFloat(total)
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(palette.track)
                Capsule().fill(palette.ink).frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: height)
        .animation(.easeInOut(duration: 0.35), value: fraction)
    }
}

/// Short time text: "3:30 pm".
enum DaybookFormat {
    static func time(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    /// "Thursday"
    static func weekday(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.wide))
    }

    /// "13 November"
    static func dayMonth(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.wide))
    }

    /// "Fri 13 Nov"
    static func shortDate(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    /// When the reminder is: "3:30 pm" today, "Tomorrow 3:30 pm", or "Fri 14 Nov, 3:30 pm".
    static func reminder(_ date: Date, planner: Planner) -> String {
        let day = DayDate(date, calendar: planner.calendar)
        let offset = planner.today.days(until: day, calendar: planner.calendar)
        switch offset {
        case 0: return time(date)
        case 1: return "Tomorrow " + time(date)
        case -1: return "Yesterday " + time(date)
        default: return shortDate(date) + ", " + time(date)
        }
    }
}
