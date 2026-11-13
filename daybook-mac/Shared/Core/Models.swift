import Foundation

// MARK: - Priority

enum Priority: Int, Codable, CaseIterable, Comparable, Sendable {
    case none = 0
    case low = 1
    case medium = 2
    case high = 3

    var title: String {
        switch self {
        case .none: return "None"
        case .low: return "Low"
        case .medium: return "Medium"
        case .high: return "High"
        }
    }

    /// "!", "!!", "!!!" like Apple Reminders.
    var marks: String { String(repeating: "!", count: rawValue) }

    static func < (lhs: Priority, rhs: Priority) -> Bool { lhs.rawValue < rhs.rawValue }

    init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(Int.self)) ?? 0
        self = Priority(rawValue: raw) ?? Priority.none
    }
}

// MARK: - Recurrence

struct Recurrence: Codable, Hashable, Sendable {
    enum Unit: String, Codable, CaseIterable, Sendable {
        case day, week, month, year

        func title(plural: Bool) -> String {
            switch self {
            case .day: return plural ? "days" : "day"
            case .week: return plural ? "weeks" : "week"
            case .month: return plural ? "months" : "month"
            case .year: return plural ? "years" : "year"
            }
        }
    }

    var unit: Unit
    var interval: Int

    init(unit: Unit, interval: Int = 1) {
        self.unit = unit
        self.interval = max(1, interval)
    }

    static let daily = Recurrence(unit: .day)
    static let weekly = Recurrence(unit: .week)
    static let monthly = Recurrence(unit: .month)
    static let yearly = Recurrence(unit: .year)

    /// The next day this repeats on after `day`.
    func next(after day: DayDate, calendar: Calendar = .current) -> DayDate {
        let n = max(1, interval)
        switch unit {
        case .day: return day.adding(days: n, calendar: calendar)
        case .week: return day.adding(days: 7 * n, calendar: calendar)
        case .month: return day.adding(months: n, calendar: calendar)
        case .year: return day.adding(months: 12 * n, calendar: calendar)
        }
    }

    /// "Every day", "Every 2 weeks".
    var summary: String {
        let n = max(1, interval)
        return n == 1 ? "Every \(unit.title(plural: false))" : "Every \(n) \(unit.title(plural: true))"
    }

    private enum CodingKeys: String, CodingKey { case unit, interval }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let unit = (try? c.decode(Unit.self, forKey: .unit)) ?? .day
        let interval = (try? c.decode(Int.self, forKey: .interval)) ?? 1
        self.init(unit: unit, interval: interval)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(unit, forKey: .unit)
        try c.encode(interval, forKey: .interval)
    }
}

// MARK: - Task

struct TaskItem: Codable, Identifiable, Hashable, Sendable {
    var id: UUID
    var title: String
    /// Optional longer description.
    var details: String
    /// The day the task is planned for. `nil` means it lives in the Inbox.
    var dueDay: DayDate?
    /// The exact moment to send a notification.
    var reminder: Date?
    var isImportant: Bool
    var priority: Priority
    var recurrence: Recurrence?
    var isCompleted: Bool
    var completedAt: Date?
    /// Archived tasks are hidden from Completed but still found by search.
    var isArchived: Bool
    /// Manual order. Lower comes first.
    var sortIndex: Double
    /// For a completed copy of a repeating task: the id of the repeating task.
    var seriesID: UUID?
    var createdAt: Date
    var modifiedAt: Date

    init(id: UUID = UUID(),
         title: String,
         details: String = "",
         dueDay: DayDate? = nil,
         reminder: Date? = nil,
         isImportant: Bool = false,
         priority: Priority = .none,
         recurrence: Recurrence? = nil,
         sortIndex: Double = 0,
         now: Date = Date()) {
        self.id = id
        self.title = title
        self.details = details
        self.dueDay = dueDay
        self.reminder = reminder
        self.isImportant = isImportant
        self.priority = priority
        self.recurrence = recurrence
        self.isCompleted = false
        self.completedAt = nil
        self.isArchived = false
        self.sortIndex = sortIndex
        self.seriesID = nil
        self.createdAt = now
        self.modifiedAt = now
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, details, dueDay, reminder, isImportant, priority, recurrence
        case isCompleted, completedAt, isArchived, sortIndex, seriesID, createdAt, modifiedAt
    }

    /// Reads every field leniently so files written by older or newer versions still open.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        details = (try? c.decode(String.self, forKey: .details)) ?? ""
        dueDay = (try? c.decodeIfPresent(DayDate.self, forKey: .dueDay)) ?? nil
        reminder = (try? c.decodeIfPresent(Date.self, forKey: .reminder)) ?? nil
        isImportant = (try? c.decode(Bool.self, forKey: .isImportant)) ?? false
        priority = (try? c.decode(Priority.self, forKey: .priority)) ?? Priority.none
        recurrence = (try? c.decodeIfPresent(Recurrence.self, forKey: .recurrence)) ?? nil
        isCompleted = (try? c.decode(Bool.self, forKey: .isCompleted)) ?? false
        completedAt = (try? c.decodeIfPresent(Date.self, forKey: .completedAt)) ?? nil
        isArchived = (try? c.decode(Bool.self, forKey: .isArchived)) ?? false
        sortIndex = (try? c.decode(Double.self, forKey: .sortIndex)) ?? 0
        seriesID = (try? c.decodeIfPresent(UUID.self, forKey: .seriesID)) ?? nil
        let created = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date(timeIntervalSince1970: 0)
        createdAt = created
        modifiedAt = (try? c.decode(Date.self, forKey: .modifiedAt)) ?? created
    }

    /// The day the task belongs to: its due day, or else the day of its reminder.
    func effectiveDay(calendar: Calendar = .current) -> DayDate? {
        if let dueDay { return dueDay }
        if let reminder { return DayDate(reminder, calendar: calendar) }
        return nil
    }
}

// MARK: - Notes

struct ChecklistItem: Codable, Identifiable, Hashable, Sendable {
    var id: UUID
    var text: String
    var isDone: Bool

    init(id: UUID = UUID(), text: String, isDone: Bool = false) {
        self.id = id
        self.text = text
        self.isDone = isDone
    }

    private enum CodingKeys: String, CodingKey { case id, text, isDone }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(UUID.self, forKey: .id)) ?? UUID()
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
        isDone = (try? c.decode(Bool.self, forKey: .isDone)) ?? false
    }
}

struct Note: Codable, Identifiable, Hashable, Sendable {
    var id: UUID
    var title: String
    var body: String
    var checklist: [ChecklistItem]
    /// Pinned notes show on the desktop widget.
    var isPinned: Bool
    var createdAt: Date
    var modifiedAt: Date

    init(id: UUID = UUID(), title: String = "", body: String = "", checklist: [ChecklistItem] = [],
         isPinned: Bool = false, now: Date = Date()) {
        self.id = id
        self.title = title
        self.body = body
        self.checklist = checklist
        self.isPinned = isPinned
        self.createdAt = now
        self.modifiedAt = now
    }

    private enum CodingKeys: String, CodingKey { case id, title, body, checklist, isPinned, createdAt, modifiedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        body = (try? c.decode(String.self, forKey: .body)) ?? ""
        checklist = (try? c.decode([Lenient<ChecklistItem>].self, forKey: .checklist))?.compactMap(\.value) ?? []
        isPinned = (try? c.decode(Bool.self, forKey: .isPinned)) ?? false
        let created = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date(timeIntervalSince1970: 0)
        createdAt = created
        modifiedAt = (try? c.decode(Date.self, forKey: .modifiedAt)) ?? created
    }

    /// The title, or the first line of the body when there is no title.
    var displayTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
        let firstLine = body.split(separator: "\n", omittingEmptySubsequences: true).first.map(String.init) ?? ""
        let line = firstLine.trimmingCharacters(in: .whitespaces)
        return line.isEmpty ? "New Note" : line
    }

    /// A short preview of the body (skipping the line used as the title).
    var preview: String {
        var lines = body.split(separator: "\n", omittingEmptySubsequences: true).map {
            $0.trimmingCharacters(in: .whitespaces)
        }.filter { !$0.isEmpty }
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !lines.isEmpty { lines.removeFirst() }
        return lines.joined(separator: " ")
    }

    var checklistProgress: (done: Int, total: Int) {
        (checklist.filter(\.isDone).count, checklist.count)
    }
}

// MARK: - Everything that is saved

struct DaybookData: Codable, Equatable, Sendable {
    static let currentSchema = 1

    var schemaVersion: Int
    var tasks: [TaskItem]
    var notes: [Note]

    init(tasks: [TaskItem] = [], notes: [Note] = []) {
        self.schemaVersion = DaybookData.currentSchema
        self.tasks = tasks
        self.notes = notes
    }

    private enum CodingKeys: String, CodingKey { case schemaVersion, tasks, notes }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = (try? c.decode(Int.self, forKey: .schemaVersion)) ?? DaybookData.currentSchema
        // Decode items one by one so a single damaged entry can't hide the rest.
        tasks = (try? c.decode([Lenient<TaskItem>].self, forKey: .tasks))?.compactMap(\.value) ?? []
        notes = (try? c.decode([Lenient<Note>].self, forKey: .notes))?.compactMap(\.value) ?? []
        removeDuplicates()
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(tasks, forKey: .tasks)
        try c.encode(notes, forKey: .notes)
    }

    /// Keeps one copy of each id (the most recently changed one).
    mutating func removeDuplicates() {
        tasks = Self.unique(tasks) { $0.modifiedAt }
        notes = Self.unique(notes) { $0.modifiedAt }
    }

    private static func unique<T: Identifiable>(_ items: [T], modified: (T) -> Date) -> [T] where T.ID == UUID {
        var best: [UUID: Int] = [:]
        for (index, item) in items.enumerated() {
            if let existing = best[item.id] {
                if modified(item) > modified(items[existing]) { best[item.id] = index }
            } else {
                best[item.id] = index
            }
        }
        let keep = Set(best.values)
        return items.enumerated().filter { keep.contains($0.offset) }.map(\.element)
    }
}

/// Decodes a value if it can, or `nil` instead of failing the whole list.
struct Lenient<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws {
        value = try? T(from: decoder)
    }
}
