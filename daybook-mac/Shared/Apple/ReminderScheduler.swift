import Foundation
import UserNotifications

/// Notification action and category identifiers.
enum ReminderAction {
    static let category = "DAYBOOK_REMINDER"
    static let complete = "DAYBOOK_COMPLETE"
    static func snooze(_ option: SnoozeOption) -> String { "DAYBOOK_SNOOZE_" + option.rawValue }
    static func snoozeOption(for identifier: String) -> SnoozeOption? {
        SnoozeOption.allCases.first { snooze($0) == identifier }
    }
}

/// Keeps macOS's scheduled notifications matching the saved reminders.
///
/// Instead of adding and removing notifications one by one, `sync` compares what
/// should be scheduled with what is, and fixes the difference. Each task has exactly
/// one notification id ("daybook.task.<id>"), so editing a reminder replaces it and
/// can never create a duplicate. Completed, deleted and past reminders are removed.
/// Scheduled notifications are delivered by macOS even when Daybook is closed.
actor ReminderScheduler {
    static let shared = ReminderScheduler()

    static let prefix = "daybook.task."
    /// macOS keeps a limited number of pending notifications per app; schedule the soonest.
    private let limit = 60

    private var center: UNUserNotificationCenter { UNUserNotificationCenter.current() }

    static func identifier(for id: UUID) -> String { prefix + id.uuidString }

    static func taskID(from identifier: String) -> UUID? {
        guard identifier.hasPrefix(prefix) else { return nil }
        return UUID(uuidString: String(identifier.dropFirst(prefix.count)))
    }

    // MARK: Permission

    nonisolated func registerCategories() {
        let complete = UNNotificationAction(identifier: ReminderAction.complete, title: "Mark as Done", options: [])
        let snoozes = SnoozeOption.allCases.map {
            UNNotificationAction(identifier: ReminderAction.snooze($0), title: $0.title, options: [])
        }
        let category = UNNotificationCategory(identifier: ReminderAction.category,
                                              actions: [complete] + snoozes,
                                              intentIdentifiers: [],
                                              options: [])
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    @discardableResult
    func requestAuthorization() async -> Bool {
        do {
            return try await center.requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    // MARK: Sync

    func sync(tasks: [TaskItem], now: Date = Date()) async {
        let desired = tasks
            .filter { task in
                guard let reminder = task.reminder else { return false }
                return !task.isCompleted && !task.isArchived && reminder > now
            }
            .sorted { ($0.reminder ?? now) < ($1.reminder ?? now) }
            .prefix(limit)

        let desiredIDs = Set(desired.map { Self.identifier(for: $0.id) })
        let pending = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix(Self.prefix) }

        let stale = pending.map(\.identifier).filter { !desiredIDs.contains($0) }
        if !stale.isEmpty { center.removePendingNotificationRequests(withIdentifiers: stale) }

        // Clear already-shown notifications for tasks that are done or gone.
        let openIDs = Set(tasks.filter { !$0.isCompleted }.map { Self.identifier(for: $0.id) })
        let shown = await center.deliveredNotifications()
            .map(\.request.identifier)
            .filter { $0.hasPrefix(Self.prefix) && !openIDs.contains($0) }
        if !shown.isEmpty { center.removeDeliveredNotifications(withIdentifiers: shown) }

        let pendingByID = Dictionary(pending.map { ($0.identifier, $0) }, uniquingKeysWith: { a, _ in a })
        for task in desired {
            let id = Self.identifier(for: task.id)
            let stamp = fingerprint(task)
            if let existing = pendingByID[id], existing.content.userInfo["fingerprint"] as? String == stamp {
                continue // Already scheduled exactly like this.
            }
            guard let request = makeRequest(for: task, fingerprint: stamp) else { continue }
            do {
                try await center.add(request) // Same id replaces any older version.
            } catch {
                NSLog("Daybook: couldn't schedule reminder: \(error.localizedDescription)")
            }
        }
    }

    /// Sends a notification in a few seconds, to check notifications work.
    func sendTest() async throws {
        let content = UNMutableNotificationContent()
        content.title = "Daybook"
        content.body = "Notifications are working. Reminders will look like this."
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        try await center.add(UNNotificationRequest(identifier: "daybook.test", content: content, trigger: trigger))
    }

    // MARK: Private

    private func fingerprint(_ task: TaskItem) -> String {
        let time = task.reminder.map { String(Int($0.timeIntervalSince1970)) } ?? ""
        return [task.title, task.details, time, task.isImportant ? "1" : "0", String(task.priority.rawValue)]
            .joined(separator: "|")
    }

    private func makeRequest(for task: TaskItem, fingerprint: String) -> UNNotificationRequest? {
        guard let reminder = task.reminder else { return nil }
        let content = UNMutableNotificationContent()
        content.title = (task.isImportant ? "★ " : "") + task.title
        let details = task.details.trimmingCharacters(in: .whitespacesAndNewlines)
        content.body = details.isEmpty ? "Reminder" : details
        if task.priority == .high { content.subtitle = "High priority" }
        content.sound = .default
        content.categoryIdentifier = ReminderAction.category
        content.threadIdentifier = "daybook"
        content.userInfo = ["taskID": task.id.uuidString, "fingerprint": fingerprint]

        // An exact moment: the components carry the time zone they were made in.
        var calendar = Calendar.current
        calendar.timeZone = TimeZone.current
        var parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: reminder)
        parts.timeZone = calendar.timeZone
        let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
        return UNNotificationRequest(identifier: Self.identifier(for: task.id), content: content, trigger: trigger)
    }
}
