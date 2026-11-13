import Foundation

/// A calendar day with no time and no time zone ("2026-11-12").
///
/// Due days are stored this way so a task due on Friday stays on Friday even if
/// the Mac's time zone changes. Reminders, by contrast, are exact moments (`Date`).
struct DayDate: Hashable, Comparable, Sendable {
    var year: Int
    var month: Int
    var day: Int

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    /// The calendar day that `date` falls on in `calendar`'s time zone.
    init(_ date: Date, calendar: Calendar = .current) {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        self.init(year: parts.year ?? 1970, month: parts.month ?? 1, day: parts.day ?? 1)
    }

    /// "yyyy-MM-dd"
    var key: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    init?(key: String) {
        let parts = key.split(separator: "-").map { Int($0) }
        guard parts.count == 3, let y = parts[0], let m = parts[1], let d = parts[2],
              (1...12).contains(m), (1...31).contains(d) else { return nil }
        self.init(year: y, month: m, day: d)
    }

    /// Midnight at the start of this day in `calendar`'s time zone.
    func startDate(in calendar: Calendar = .current) -> Date {
        let noon = noonDate(in: calendar)
        return calendar.startOfDay(for: noon)
    }

    /// Midday on this day. Used for arithmetic because midday always exists,
    /// even on days when a daylight-saving change skips midnight.
    func noonDate(in calendar: Calendar = .current) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12)) ?? Date(timeIntervalSince1970: 0)
    }

    /// The moment `hour:minute` happens on this day.
    func date(hour: Int, minute: Int, in calendar: Calendar = .current) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))
            ?? noonDate(in: calendar)
    }

    func adding(days: Int, calendar: Calendar = .current) -> DayDate {
        let moved = calendar.date(byAdding: .day, value: days, to: noonDate(in: calendar)) ?? noonDate(in: calendar)
        return DayDate(moved, calendar: calendar)
    }

    /// Adds months, keeping the day where possible (31 Jan + 1 month = 28 or 29 Feb).
    func adding(months: Int, calendar: Calendar = .current) -> DayDate {
        let moved = calendar.date(byAdding: .month, value: months, to: noonDate(in: calendar)) ?? noonDate(in: calendar)
        return DayDate(moved, calendar: calendar)
    }

    /// Whole days from `self` to `other` (positive when `other` is later).
    func days(until other: DayDate, calendar: Calendar = .current) -> Int {
        let a = noonDate(in: calendar)
        let b = other.noonDate(in: calendar)
        return calendar.dateComponents([.day], from: a, to: b).day ?? 0
    }

    /// 1 = Sunday ... 7 = Saturday, as in `Calendar`.
    func weekday(calendar: Calendar = .current) -> Int {
        calendar.component(.weekday, from: noonDate(in: calendar))
    }

    static func < (lhs: DayDate, rhs: DayDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    static func today(_ now: Date = Date(), calendar: Calendar = .current) -> DayDate {
        DayDate(now, calendar: calendar)
    }
}

extension DayDate: Codable {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let text = try container.decode(String.self)
        guard let value = DayDate(key: text) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Not a day: \(text)")
        }
        self = value
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(key)
    }
}
