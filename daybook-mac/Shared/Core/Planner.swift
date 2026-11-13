import Foundation

/// How a list is ordered.
enum TaskSort: String, CaseIterable, Identifiable, Sendable {
    case manual, dueDate, priority, title, created

    var id: String { rawValue }

    var title: String {
        switch self {
        case .manual: return "Manual"
        case .dueDate: return "Date"
        case .priority: return "Priority"
        case .title: return "Title"
        case .created: return "Newest First"
        }
    }
}

/// A titled group of tasks inside a list ("Overdue", "Tomorrow", ...).
struct TaskGroup: Identifiable, Equatable {
    var id: String
    var title: String
    var tasks: [TaskItem]
    /// Whether the user can drag to reorder inside this group.
    var canReorder: Bool
}

/// Works out which tasks belong where, based on the current time.
struct Planner {
    var now: Date
    var calendar: Calendar

    init(now: Date = Date(), calendar: Calendar = .current) {
        self.now = now
        self.calendar = calendar
    }

    var today: DayDate { DayDate(now, calendar: calendar) }

    // MARK: Membership

    func isOverdue(_ task: TaskItem) -> Bool {
        guard !task.isCompleted, let day = task.effectiveDay(calendar: calendar) else { return false }
        return day < today
    }

    /// Today: due today or earlier, plus important tasks with no date.
    func isInToday(_ task: TaskItem) -> Bool {
        guard !task.isCompleted, !task.isArchived else { return false }
        if let day = task.effectiveDay(calendar: calendar) { return day <= today }
        return task.isImportant
    }

    func isUpcoming(_ task: TaskItem) -> Bool {
        guard !task.isCompleted, !task.isArchived, let day = task.effectiveDay(calendar: calendar) else { return false }
        return day > today
    }

    func isInInbox(_ task: TaskItem) -> Bool {
        !task.isCompleted && !task.isArchived && task.effectiveDay(calendar: calendar) == nil
    }

    func isDoneToday(_ task: TaskItem) -> Bool {
        guard task.isCompleted, let done = task.completedAt else { return false }
        return DayDate(done, calendar: calendar) == today
    }

    func todayOpen(_ tasks: [TaskItem]) -> [TaskItem] { tasks.filter { isInToday($0) } }

    func doneToday(_ tasks: [TaskItem]) -> [TaskItem] {
        tasks.filter { isDoneToday($0) }.sorted { ($0.completedAt ?? now) > ($1.completedAt ?? now) }
    }

    func upcoming(_ tasks: [TaskItem]) -> [TaskItem] { tasks.filter { isUpcoming($0) } }
    func inbox(_ tasks: [TaskItem]) -> [TaskItem] { tasks.filter { isInInbox($0) } }

    func completed(_ tasks: [TaskItem], includeArchived: Bool) -> [TaskItem] {
        tasks.filter { $0.isCompleted && (includeArchived || !$0.isArchived) }
            .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
    }

    /// Today's progress: tasks finished today, out of those plus the ones still open for today.
    func progress(_ tasks: [TaskItem]) -> (done: Int, total: Int) {
        let done = tasks.filter { isDoneToday($0) }.count
        let open = tasks.filter { isInToday($0) }.count
        return (done, done + open)
    }

    // MARK: Sorting

    func sorted(_ tasks: [TaskItem], by sort: TaskSort) -> [TaskItem] {
        tasks.sorted { a, b in
            switch sort {
            case .manual:
                break
            case .dueDate:
                let da = moment(a), db = moment(b)
                if da != db { return da < db }
            case .priority:
                if a.isImportant != b.isImportant { return a.isImportant }
                if a.priority != b.priority { return a.priority > b.priority }
            case .title:
                let order = a.title.localizedCaseInsensitiveCompare(b.title)
                if order != .orderedSame { return order == .orderedAscending }
            case .created:
                if a.createdAt != b.createdAt { return a.createdAt > b.createdAt }
            }
            if a.sortIndex != b.sortIndex { return a.sortIndex < b.sortIndex }
            return a.id.uuidString < b.id.uuidString
        }
    }

    private func moment(_ task: TaskItem) -> Date {
        if let reminder = task.reminder { return reminder }
        if let day = task.effectiveDay(calendar: calendar) { return day.date(hour: 23, minute: 59, in: calendar) }
        return .distantFuture
    }

    /// The order for the widget, where space is short: overdue, then important,
    /// then priority, then the user's own order.
    func widgetOrder(_ tasks: [TaskItem]) -> [TaskItem] {
        todayOpen(tasks).sorted { a, b in
            let oa = isOverdue(a), ob = isOverdue(b)
            if oa != ob { return oa }
            if a.isImportant != b.isImportant { return a.isImportant }
            if a.priority != b.priority { return a.priority > b.priority }
            if a.sortIndex != b.sortIndex { return a.sortIndex < b.sortIndex }
            return a.id.uuidString < b.id.uuidString
        }
    }

    // MARK: Groups for each list

    func todayGroups(_ tasks: [TaskItem], sort: TaskSort) -> [TaskGroup] {
        let open = todayOpen(tasks)
        let overdue = sorted(open.filter { isOverdue($0) }, by: sort)
        let current = sorted(open.filter { !isOverdue($0) }, by: sort)
        let done = doneToday(tasks).filter { !$0.isArchived }
        var groups: [TaskGroup] = []
        if !overdue.isEmpty {
            groups.append(TaskGroup(id: "overdue", title: "Overdue", tasks: overdue, canReorder: sort == .manual))
        }
        if !current.isEmpty {
            groups.append(TaskGroup(id: "today", title: "Today", tasks: current, canReorder: sort == .manual))
        }
        if !done.isEmpty {
            groups.append(TaskGroup(id: "done", title: "Done Today", tasks: done, canReorder: false))
        }
        return groups
    }

    /// Upcoming tasks grouped by day: "Tomorrow", "Saturday", ...
    func upcomingGroups(_ tasks: [TaskItem], sort: TaskSort) -> [TaskGroup] {
        let byDay = Dictionary(grouping: upcoming(tasks)) { $0.effectiveDay(calendar: calendar) ?? today }
        return byDay.keys.sorted().map { day in
            TaskGroup(id: day.key, title: dayTitle(day), tasks: sorted(byDay[day] ?? [], by: sort),
                      canReorder: sort == .manual)
        }
    }

    func inboxGroups(_ tasks: [TaskItem], sort: TaskSort) -> [TaskGroup] {
        let items = sorted(inbox(tasks), by: sort)
        return items.isEmpty ? [] : [TaskGroup(id: "inbox", title: "Inbox", tasks: items, canReorder: sort == .manual)]
    }

    /// Completed tasks grouped by the day they were finished, newest first.
    func completedGroups(_ tasks: [TaskItem], includeArchived: Bool) -> [TaskGroup] {
        let done = completed(tasks, includeArchived: includeArchived)
        var order: [DayDate] = []
        var byDay: [DayDate: [TaskItem]] = [:]
        for task in done {
            let day = DayDate(task.completedAt ?? task.modifiedAt, calendar: calendar)
            if byDay[day] == nil { order.append(day) }
            byDay[day, default: []].append(task)
        }
        return order.map { day in
            TaskGroup(id: "done-" + day.key, title: dayTitle(day), tasks: byDay[day] ?? [], canReorder: false)
        }
    }

    // MARK: Words

    /// "Today", "Tomorrow", "Yesterday", a weekday within the next week, or a full date.
    func dayTitle(_ day: DayDate) -> String {
        let offset = today.days(until: day, calendar: calendar)
        switch offset {
        case 0: return "Today"
        case 1: return "Tomorrow"
        case -1: return "Yesterday"
        default:
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.timeZone = calendar.timeZone
            formatter.locale = calendar.locale ?? Locale.current
            if (2...6).contains(offset) {
                formatter.setLocalizedDateFormatFromTemplate("EEEE")
            } else if day.year == today.year {
                formatter.setLocalizedDateFormatFromTemplate("EEEEdMMMM")
            } else {
                formatter.setLocalizedDateFormatFromTemplate("EEEEdMMMMyyyy")
            }
            return formatter.string(from: day.noonDate(in: calendar))
        }
    }

    /// "Good morning" / "Good afternoon" / "Good evening", with the name if given.
    func greeting(name: String?) -> String {
        let hour = calendar.component(.hour, from: now)
        let base: String
        switch hour {
        case 5..<12: base = "Good morning"
        case 12..<17: base = "Good afternoon"
        default: base = "Good evening"
        }
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? base : "\(base), \(trimmed)"
    }

    /// The next midnight, when lists need to be worked out again.
    var nextMidnight: Date {
        today.adding(days: 1, calendar: calendar).startDate(in: calendar)
    }

    // MARK: Search

    /// Every word must appear (ignoring case and accents). Includes completed and archived tasks.
    func search(_ query: String, in data: DaybookData) -> (tasks: [TaskItem], notes: [Note]) {
        let words = query.split(whereSeparator: \.isWhitespace).map(String.init)
        guard !words.isEmpty else { return ([], []) }
        func matches(_ haystack: String) -> Bool {
            words.allSatisfy { haystack.range(of: $0, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
        }
        let tasks = data.tasks
            .filter { matches($0.title + "\n" + $0.details) }
            .sorted { a, b in
                if a.isCompleted != b.isCompleted { return !a.isCompleted }
                return a.modifiedAt > b.modifiedAt
            }
        let notes = data.notes
            .filter { matches($0.title + "\n" + $0.body + "\n" + $0.checklist.map(\.text).joined(separator: "\n")) }
            .sorted { $0.modifiedAt > $1.modifiedAt }
        return (tasks, notes)
    }

    /// Notes in display order: pinned first, then most recently changed.
    func sortedNotes(_ notes: [Note]) -> [Note] {
        notes.sorted { a, b in
            if a.isPinned != b.isPinned { return a.isPinned }
            if a.modifiedAt != b.modifiedAt { return a.modifiedAt > b.modifiedAt }
            return a.id.uuidString < b.id.uuidString
        }
    }
}
