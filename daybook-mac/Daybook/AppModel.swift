import AppKit
import Foundation
import Observation
import SwiftUI
import UniformTypeIdentifiers
import UserNotifications
import WidgetKit

enum SidebarItem: String, CaseIterable, Identifiable {
    case today, upcoming, inbox, notes, completed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return "Today"
        case .upcoming: return "Upcoming"
        case .inbox: return "Inbox"
        case .notes: return "Notes"
        case .completed: return "Completed"
        }
    }

    var icon: String {
        switch self {
        case .today: return "sun.max"
        case .upcoming: return "calendar"
        case .inbox: return "tray"
        case .notes: return "note.text"
        case .completed: return "checkmark.circle"
        }
    }

    /// ⌘1 ... ⌘5
    var shortcut: KeyEquivalent {
        switch self {
        case .today: return "1"
        case .upcoming: return "2"
        case .inbox: return "3"
        case .notes: return "4"
        case .completed: return "5"
        }
    }

    var takesQuickEntry: Bool { self == .today || self == .upcoming || self == .inbox }
}

/// The app's state. Holds a copy of the saved data, and sends every change
/// through `DaybookStore` so it's saved straight away.
@MainActor
@Observable
final class AppModel {
    static let shared = AppModel()

    private(set) var data = DaybookData()
    private(set) var store: DaybookStore?

    var selection: SidebarItem = .today {
        didSet { if oldValue != selection { selectedTaskID = nil } }
    }
    var selectedTaskID: UUID?
    var selectedNoteID: UUID?
    var searchText = ""
    var showArchived = false
    var importantOnly = false
    var sort: TaskSort = TaskSort(rawValue: UserDefaults.standard.string(forKey: "sort") ?? "") ?? .manual {
        didSet { UserDefaults.standard.set(sort.rawValue, forKey: "sort") }
    }

    var errorMessage: String?
    /// A short confirmation shown after quick entry ("Added to Upcoming · Tomorrow").
    var toast: String?
    var showOnboarding = !UserDefaults.standard.bool(forKey: "onboarded")
    var notificationStatus: UNAuthorizationStatus = .notDetermined
    /// Changing this asks the quick-entry field to take focus.
    var quickEntryFocus = 0
    /// Refreshed every minute so overdue tasks and "today" stay correct.
    var now = Date()

    @ObservationIgnored private var watcher: FolderWatcher?
    @ObservationIgnored private var sideEffects: Task<Void, Never>?
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored private var clock: Timer?
    @ObservationIgnored private var reloadPending = false

    init() {
        do {
            let store = try AppGroup.makeStore()
            self.store = store
            data = try store.load()
            watcher = FolderWatcher(url: store.directory) { [weak self] in
                Task { @MainActor in self?.scheduleReload() }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        clock = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        _ = NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification,
                                               object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                self?.reloadFromDisk()
                await self?.refreshNotificationStatus()
            }
        }
        Task { await refreshNotificationStatus() }
        scheduleSideEffects(reloadWidgets: true)
    }

    var planner: Planner { Planner(now: now, calendar: .current) }

    // MARK: - Reading

    func task(_ id: UUID?) -> TaskItem? { id.flatMap { data.task($0) } }
    func note(_ id: UUID?) -> Note? { id.flatMap { data.note($0) } }

    var progress: (done: Int, total: Int) { planner.progress(data.tasks) }

    func count(for item: SidebarItem) -> Int {
        let p = planner
        switch item {
        case .today: return p.todayOpen(data.tasks).count
        case .upcoming: return p.upcoming(data.tasks).count
        case .inbox: return p.inbox(data.tasks).count
        case .notes, .completed: return 0
        }
    }

    func groups(for item: SidebarItem) -> [TaskGroup] {
        let p = planner
        let tasks = importantOnly ? data.tasks.filter { $0.isImportant || $0.priority == .high } : data.tasks
        switch item {
        case .today: return p.todayGroups(tasks, sort: sort)
        case .upcoming: return p.upcomingGroups(tasks, sort: sort)
        case .inbox: return p.inboxGroups(tasks, sort: sort)
        case .completed: return p.completedGroups(tasks, includeArchived: showArchived)
        case .notes: return []
        }
    }

    var sortedNotes: [Note] { planner.sortedNotes(data.notes) }

    var searchResults: (tasks: [TaskItem], notes: [Note]) { planner.search(searchText, in: data) }

    /// Which list a task shows in.
    func home(of task: TaskItem) -> SidebarItem {
        let p = planner
        if task.isCompleted { return .completed }
        if p.isInToday(task) { return .today }
        if p.isUpcoming(task) { return .upcoming }
        return .inbox
    }

    // MARK: - Changing

    /// Saves a change. Returns `nil` if it couldn't be saved (the error is shown).
    @discardableResult
    func change<T>(_ body: (inout DaybookData) -> T) -> T? {
        guard let store else {
            errorMessage = errorMessage ?? "Daybook's data folder isn't available."
            return nil
        }
        do {
            let (result, saved) = try store.mutate(body)
            if saved != data { data = saved }
            scheduleSideEffects(reloadWidgets: true)
            return result
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    // Quick entry

    func quickAdd(_ text: String, in section: SidebarItem) {
        guard let entry = QuickEntry.parse(text, now: Date(), calendar: .current) else { return }
        var task = TaskItem(title: entry.title, isImportant: entry.isImportant)
        task.reminder = entry.reminder
        if let day = entry.day {
            task.dueDay = day
        } else {
            switch section {
            case .today: task.dueDay = planner.today
            case .upcoming: task.dueDay = planner.today.adding(days: 1)
            default: task.dueDay = nil
            }
        }
        guard change({ $0.addTask(task) }) == true else { return }
        let home = home(of: task)
        var words = ["Added to \(home.title)"]
        if let day = task.dueDay, home == .upcoming { words.append(planner.dayTitle(day)) }
        if let reminder = task.reminder { words.append("reminder " + DaybookFormat.reminder(reminder, planner: planner)) }
        if task.isImportant { words.append("important") }
        showToast(words.joined(separator: " · "))
        if task.reminder != nil { Task { await askForNotificationsIfNeeded() } }
    }

    func requestQuickEntry() {
        searchText = ""
        if !selection.takesQuickEntry { selection = .today }
        quickEntryFocus += 1
    }

    // Tasks

    func toggle(_ id: UUID) {
        let result = withAnimation(.easeInOut(duration: 0.3)) {
            change { $0.toggleCompletion(id) }
        }
        if case .repeated(let next)? = result {
            showToast("Done · next one is \(planner.dayTitle(next))")
        }
    }

    func setCompleted(_ id: UUID, _ done: Bool) {
        withAnimation { _ = change { $0.setCompleted(id, done) } }
    }

    func editTask(_ id: UUID, _ edit: (inout TaskItem) -> Void) {
        change { $0.updateTask(id, edit) }
    }

    func delete(_ id: UUID) {
        if selectedTaskID == id { selectedTaskID = nil }
        withAnimation { _ = change { $0.deleteTask(id) } }
    }

    func move(in group: TaskGroup, from source: IndexSet, to destination: Int) {
        var ids = group.tasks.map(\.id)
        ids.move(fromOffsets: source, toOffset: destination)
        change { $0.reorder(ids) }
    }

    /// Moves a task to a day (or to the Inbox with `nil`), keeping any reminder's time.
    func schedule(_ id: UUID, on day: DayDate?) {
        editTask(id) { task in
            task.dueDay = day
            if let reminder = task.reminder {
                if let day {
                    let time = Calendar.current.dateComponents([.hour, .minute], from: reminder)
                    task.reminder = day.date(hour: time.hour ?? 9, minute: time.minute ?? 0)
                } else {
                    task.reminder = nil
                }
            }
        }
    }

    func setReminder(_ id: UUID, at date: Date?) {
        editTask(id) { task in
            task.reminder = date
            if let date, task.dueDay == nil { task.dueDay = DayDate(date) }
        }
        if date != nil { Task { await askForNotificationsIfNeeded() } }
    }

    func snooze(_ id: UUID, _ option: SnoozeOption) {
        let when = option.date(from: Date())
        change { $0.snooze(id, until: when) }
    }

    func archiveCompleted() {
        let count = withAnimation { change { $0.archiveCompleted() } } ?? 0
        showToast(count == 0 ? "Nothing to archive" : "Archived \(count) completed task\(count == 1 ? "" : "s")")
    }

    func deleteArchived() {
        let count = change { $0.deleteArchived() } ?? 0
        showToast("Deleted \(count) archived task\(count == 1 ? "" : "s")")
    }

    // Notes

    func newNote() {
        searchText = ""
        let note = Note()
        guard change({ $0.addNote(note) }) == true else { return }
        selection = .notes
        selectedNoteID = note.id
    }

    func editNote(_ id: UUID, _ edit: (inout Note) -> Void) {
        change { $0.updateNote(id, edit) }
    }

    func deleteNote(_ id: UUID) {
        if selectedNoteID == id { selectedNoteID = nil }
        withAnimation { _ = change { $0.deleteNote(id) } }
    }

    /// Turns a checklist item into a task in Today.
    func makeTask(fromChecklistItem item: ChecklistItem) {
        let title = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        if change({ $0.addTask(TaskItem(title: title, dueDay: planner.today)) }) == true {
            showToast("Added “\(title)” to Today")
        }
    }

    // MARK: - Links from the widget and notifications

    func open(_ url: URL) {
        guard url.scheme == DaybookLink.scheme else { return }
        searchText = ""
        let id = UUID(uuidString: url.lastPathComponent)
        switch url.host {
        case "task":
            if let task = task(id) {
                selection = home(of: task)
                selectedTaskID = task.id
            }
        case "note":
            if let id, note(id) != nil {
                selection = .notes
                selectedNoteID = id
            }
        case "quickadd":
            requestQuickEntry()
        default:
            selection = .today
        }
    }

    func reveal(taskID: UUID) {
        guard let task = task(taskID) else { return }
        searchText = ""
        selection = home(of: task)
        selectedTaskID = taskID
    }

    func reveal(noteID: UUID) {
        searchText = ""
        selection = .notes
        selectedNoteID = noteID
    }

    // MARK: - Notifications

    func refreshNotificationStatus() async {
        notificationStatus = await ReminderScheduler.shared.authorizationStatus()
    }

    func requestNotifications() async {
        await ReminderScheduler.shared.requestAuthorization()
        await refreshNotificationStatus()
        scheduleSideEffects(reloadWidgets: false)
    }

    private func askForNotificationsIfNeeded() async {
        await refreshNotificationStatus()
        if notificationStatus == .notDetermined { await requestNotifications() }
    }

    var notificationsBlocked: Bool { notificationStatus == .denied }

    func openNotificationSettings() {
        let id = Bundle.main.bundleIdentifier ?? ""
        let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(id)")
            ?? URL(string: "x-apple.systempreferences:com.apple.preference.notifications")!
        NSWorkspace.shared.open(url)
    }

    func finishOnboarding() {
        UserDefaults.standard.set(true, forKey: "onboarded")
        showOnboarding = false
    }

    // MARK: - Data file

    func revealDataFolder() {
        guard let store else { return }
        NSWorkspace.shared.activateFileViewerSelecting([store.fileURL])
    }

    func exportBackup() {
        guard let store else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "Daybook Backup \(DayDate.today().key).json"
        panel.allowedContentTypes = [.json]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try store.export(data, to: url)
            showToast("Backup saved")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Private

    private func tick() {
        let fresh = Date()
        let dayChanged = DayDate(fresh) != DayDate(now)
        now = fresh
        if dayChanged { WidgetCenter.shared.reloadAllTimelines() }
    }

    private func showToast(_ text: String) {
        withAnimation { toast = text }
        toastTask?.cancel()
        toastTask = Task {
            try? await Task.sleep(for: .seconds(2.6))
            guard !Task.isCancelled else { return }
            withAnimation { toast = nil }
        }
    }

    /// The widget or a notification action changed the file: read it again shortly.
    private func scheduleReload() {
        guard !reloadPending else { return }
        reloadPending = true
        Task {
            try? await Task.sleep(for: .milliseconds(150))
            reloadPending = false
            reloadFromDisk()
        }
    }

    func reloadFromDisk() {
        guard let store else { return }
        do {
            let fresh = try store.load()
            if fresh != data {
                withAnimation { data = fresh }
                if let id = selectedTaskID, data.task(id) == nil { selectedTaskID = nil }
                scheduleSideEffects(reloadWidgets: false)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// After changes settle: bring notifications in line with the data and refresh the widget.
    private func scheduleSideEffects(reloadWidgets: Bool) {
        sideEffects?.cancel()
        sideEffects = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            let tasks = data.tasks
            await ReminderScheduler.shared.sync(tasks: tasks)
            if reloadWidgets { WidgetCenter.shared.reloadAllTimelines() }
        }
    }
}
