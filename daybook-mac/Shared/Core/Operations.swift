import Foundation

/// Every change to saved data goes through these functions, so the app, the widget
/// and notification actions all behave the same way.
extension DaybookData {

    func task(_ id: UUID) -> TaskItem? { tasks.first { $0.id == id } }
    func note(_ id: UUID) -> Note? { notes.first { $0.id == id } }

    // MARK: Tasks

    /// Adds a task at the top of the manual order. Does nothing if the id already exists
    /// or the title is empty.
    @discardableResult
    mutating func addTask(_ task: TaskItem) -> Bool {
        guard !tasks.contains(where: { $0.id == task.id }) else { return false }
        var task = task
        task.title = task.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !task.title.isEmpty else { return false }
        let lowest = tasks.map(\.sortIndex).min() ?? 1
        task.sortIndex = lowest - 1
        tasks.append(task)
        return true
    }

    mutating func updateTask(_ id: UUID, now: Date = Date(), _ change: (inout TaskItem) -> Void) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        var task = tasks[index]
        change(&task)
        task.id = id
        if task != tasks[index] {
            task.modifiedAt = now
            tasks[index] = task
        }
    }

    mutating func deleteTask(_ id: UUID) {
        tasks.removeAll { $0.id == id }
    }

    /// What happened when a task was completed.
    enum CompletionResult: Equatable {
        case completed
        case reopened
        /// A repeating task: a done copy was saved and the task moved to `nextDay`.
        case repeated(nextDay: DayDate)
        case notFound
    }

    @discardableResult
    mutating func toggleCompletion(_ id: UUID, now: Date = Date(), calendar: Calendar = .current) -> CompletionResult {
        guard let task = task(id) else { return .notFound }
        return setCompleted(id, !task.isCompleted, now: now, calendar: calendar)
    }

    /// Marks a task done or not done. Safe to call twice with the same value
    /// (a notification's "Mark as Done" can't complete a task twice).
    @discardableResult
    mutating func setCompleted(_ id: UUID, _ done: Bool, now: Date = Date(), calendar: Calendar = .current) -> CompletionResult {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return .notFound }
        var task = tasks[index]

        if !done {
            guard task.isCompleted || task.isArchived else { return .reopened }
            task.isCompleted = false
            task.completedAt = nil
            task.isArchived = false
            task.modifiedAt = now
            tasks[index] = task
            return .reopened
        }

        guard !task.isCompleted else { return .completed }

        if let rule = task.recurrence {
            // Keep a done copy for history and progress, then move the task to its next day.
            var record = task
            record.id = UUID()
            record.recurrence = nil
            record.seriesID = task.id
            record.isCompleted = true
            record.completedAt = now
            record.modifiedAt = now

            let today = DayDate(now, calendar: calendar)
            let base = task.effectiveDay(calendar: calendar) ?? today
            var next = rule.next(after: base, calendar: calendar)
            var steps = 0
            while next <= today && steps < 5000 {
                next = rule.next(after: next, calendar: calendar)
                steps += 1
            }
            if let reminder = task.reminder {
                let time = calendar.dateComponents([.hour, .minute], from: reminder)
                task.reminder = next.date(hour: time.hour ?? 9, minute: time.minute ?? 0, in: calendar)
            }
            task.dueDay = next
            task.modifiedAt = now
            tasks[index] = task
            tasks.append(record)
            return .repeated(nextDay: next)
        }

        task.isCompleted = true
        task.completedAt = now
        task.modifiedAt = now
        tasks[index] = task
        return .completed
    }

    /// Moves a reminder to a later time. Completed tasks are left alone.
    mutating func snooze(_ id: UUID, until date: Date, now: Date = Date()) {
        updateTask(id, now: now) { task in
            guard !task.isCompleted else { return }
            task.reminder = date
        }
    }

    /// Puts the given tasks in this order, reusing the order slots they already had,
    /// so tasks in other lists keep their place.
    mutating func reorder(_ orderedIDs: [UUID]) {
        let slots = orderedIDs.compactMap { id in tasks.first { $0.id == id }?.sortIndex }.sorted()
        guard slots.count == orderedIDs.count else { return }
        // Slots may be equal (old data); spread them so the new order is strict.
        var spread: [Double] = []
        for slot in slots {
            if let last = spread.last, slot <= last { spread.append(last + 0.001) } else { spread.append(slot) }
        }
        for (position, id) in orderedIDs.enumerated() {
            if let index = tasks.firstIndex(where: { $0.id == id }) {
                tasks[index].sortIndex = spread[position]
            }
        }
    }

    /// Hides every completed task from Completed. They stay searchable.
    @discardableResult
    mutating func archiveCompleted(now: Date = Date()) -> Int {
        var count = 0
        for index in tasks.indices where tasks[index].isCompleted && !tasks[index].isArchived {
            tasks[index].isArchived = true
            tasks[index].modifiedAt = now
            count += 1
        }
        return count
    }

    /// Permanently removes archived tasks.
    @discardableResult
    mutating func deleteArchived() -> Int {
        let before = tasks.count
        tasks.removeAll { $0.isArchived }
        return before - tasks.count
    }

    // MARK: Notes

    @discardableResult
    mutating func addNote(_ note: Note) -> Bool {
        guard !notes.contains(where: { $0.id == note.id }) else { return false }
        notes.append(note)
        return true
    }

    mutating func updateNote(_ id: UUID, now: Date = Date(), _ change: (inout Note) -> Void) {
        guard let index = notes.firstIndex(where: { $0.id == id }) else { return }
        var note = notes[index]
        change(&note)
        note.id = id
        if note != notes[index] {
            note.modifiedAt = now
            notes[index] = note
        }
    }

    mutating func deleteNote(_ id: UUID) {
        notes.removeAll { $0.id == id }
    }
}
