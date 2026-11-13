import Foundation

/// Reads a typed line like "Email teacher tomorrow 3pm !" into a task.
///
/// Only words at the very end are read as a day or time, so ordinary titles such
/// as "Read today's article" stay exactly as typed.
struct QuickEntry: Equatable {
    var title: String
    var isImportant: Bool
    var day: DayDate?
    var reminder: Date?

    static func parse(_ raw: String, now: Date = Date(), calendar: Calendar = .current) -> QuickEntry? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let original = text

        // "!" at the start or end marks it important.
        var important = false
        if text.hasPrefix("!") {
            important = true
            text = String(text.drop { $0 == "!" }).trimmingCharacters(in: .whitespaces)
        }
        if text.hasSuffix("!") {
            important = true
            while text.hasSuffix("!") { text.removeLast() }
            text = text.trimmingCharacters(in: .whitespaces)
        }

        let today = DayDate(now, calendar: calendar)

        // A time at the end: "at 3pm", "3:30 pm", "at 15:00".
        var time: (hour: Int, minute: Int)?
        if let match = trailingTime(in: text) {
            time = (match.hour, match.minute)
            text = match.rest
        }

        // A day at the end: "today", "tonight", "tomorrow", "on friday", "next week".
        var day: DayDate?
        if let match = trailingDay(in: text, today: today, calendar: calendar) {
            day = match.day
            text = match.rest
            if match.isTonight && time == nil { time = (19, 0) }
        }

        // The time can also come before the day: "3pm tomorrow".
        if day != nil, time == nil, let match = trailingTime(in: text) {
            time = (match.hour, match.minute)
            text = match.rest
        }

        text = text.trimmingCharacters(in: .whitespaces)
        if text.isEmpty {
            // Nothing left but date words: keep everything as the title.
            return QuickEntry(title: original, isImportant: false, day: nil, reminder: nil)
        }

        var reminder: Date?
        if let time {
            var moment = (day ?? today).date(hour: time.hour, minute: time.minute, in: calendar)
            if day == nil && moment <= now {
                // "Call mum 9am" typed in the afternoon means tomorrow morning.
                moment = today.adding(days: 1, calendar: calendar).date(hour: time.hour, minute: time.minute, in: calendar)
            }
            reminder = moment
            if day == nil { day = DayDate(moment, calendar: calendar) }
        }

        return QuickEntry(title: text, isImportant: important, day: day, reminder: reminder)
    }

    // MARK: - Pieces

    private static let timePattern = try! NSRegularExpression(
        pattern: #"(?:^|\s)(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)$|(?:^|\s)at\s+(\d{1,2})[:.](\d{2})$"#,
        options: [.caseInsensitive])

    private static func trailingTime(in text: String) -> (hour: Int, minute: Int, rest: String)? {
        let range = NSRange(text.startIndex..., in: text)
        guard let m = timePattern.firstMatch(in: text, range: range),
              let whole = Range(m.range, in: text) else { return nil }
        func group(_ i: Int) -> String? {
            guard let r = Range(m.range(at: i), in: text) else { return nil }
            return String(text[r])
        }
        var hour: Int
        let minute: Int
        if let h = group(1).flatMap({ Int($0) }) {
            hour = h
            minute = group(2).flatMap { Int($0) } ?? 0
            guard (1...12).contains(hour) else { return nil }
            let pm = (group(3) ?? "").lowercased().hasPrefix("p")
            if pm && hour < 12 { hour += 12 }
            if !pm && hour == 12 { hour = 0 }
        } else if let h = group(4).flatMap({ Int($0) }), let mm = group(5).flatMap({ Int($0) }) {
            hour = h
            minute = mm
            guard (0...23).contains(hour) else { return nil }
        } else {
            return nil
        }
        guard (0...59).contains(minute) else { return nil }
        let rest = String(text[..<whole.lowerBound]).trimmingCharacters(in: .whitespaces)
        return (hour, minute, rest)
    }

    private static let weekdays: [String: Int] = [
        "sunday": 1, "sun": 1, "monday": 2, "mon": 2, "tuesday": 3, "tue": 3, "tues": 3,
        "wednesday": 4, "wed": 4, "thursday": 5, "thu": 5, "thur": 5, "thurs": 5,
        "friday": 6, "fri": 6, "saturday": 7, "sat": 7,
    ]

    private static func trailingDay(in text: String, today: DayDate, calendar: Calendar)
        -> (day: DayDate, rest: String, isTonight: Bool)? {
        var words = text.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        guard let lastWord = words.last, words.count >= 2 else { return nil }
        let last = lastWord.lowercased()

        if last == "week", words.count >= 3, words[words.count - 2].lowercased() == "next" {
            words.removeLast(2)
            // Next Monday.
            let offset = (2 - today.weekday(calendar: calendar) + 7) % 7
            let day = today.adding(days: offset == 0 ? 7 : offset, calendar: calendar)
            return (day, words.joined(separator: " "), false)
        }

        var day: DayDate?
        var tonight = false
        switch last {
        case "today": day = today
        case "tonight": day = today; tonight = true
        case "tomorrow", "tmrw", "tmr": day = today.adding(days: 1, calendar: calendar)
        default:
            if let weekday = weekdays[last] {
                // The next time that weekday comes round; today counts.
                let offset = (weekday - today.weekday(calendar: calendar) + 7) % 7
                day = today.adding(days: offset, calendar: calendar)
            }
        }
        guard let found = day else { return nil }
        words.removeLast()
        if words.count >= 2, let connector = words.last?.lowercased(),
           connector == "on" || connector == "by" || connector == "this" {
            words.removeLast()
        }
        return (found, words.joined(separator: " "), tonight)
    }
}

/// The snooze choices offered on a reminder notification.
enum SnoozeOption: String, CaseIterable, Sendable {
    case fiveMinutes, fifteenMinutes, oneHour, laterToday

    var title: String {
        switch self {
        case .fiveMinutes: return "Snooze 5 Minutes"
        case .fifteenMinutes: return "Snooze 15 Minutes"
        case .oneHour: return "Snooze 1 Hour"
        case .laterToday: return "Later Today"
        }
    }

    /// When the reminder should come back.
    /// "Later today" is 6pm when it's before 4pm; otherwise about three hours later,
    /// not past 11pm, never less than an hour away, rounded up to the quarter hour.
    func date(from now: Date, calendar: Calendar = .current) -> Date {
        switch self {
        case .fiveMinutes: return now.addingTimeInterval(5 * 60)
        case .fifteenMinutes: return now.addingTimeInterval(15 * 60)
        case .oneHour: return now.addingTimeInterval(60 * 60)
        case .laterToday:
            let today = DayDate(now, calendar: calendar)
            let sixPM = today.date(hour: 18, minute: 0, in: calendar)
            if now < sixPM.addingTimeInterval(-2 * 60 * 60) { return sixPM }
            let lateLimit = today.date(hour: 23, minute: 0, in: calendar)
            var candidate = min(now.addingTimeInterval(3 * 60 * 60), lateLimit)
            if candidate < now.addingTimeInterval(60 * 60) { candidate = now.addingTimeInterval(60 * 60) }
            return Self.roundUpToQuarterHour(candidate, calendar: calendar)
        }
    }

    private static func roundUpToQuarterHour(_ date: Date, calendar: Calendar) -> Date {
        let minute = calendar.component(.minute, from: date)
        let second = calendar.component(.second, from: date)
        let remainder = minute % 15
        if remainder == 0 && second == 0 { return date }
        return date.addingTimeInterval(TimeInterval((15 - remainder) * 60 - second))
    }
}
