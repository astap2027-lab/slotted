import AppIntents
import Foundation
import WidgetKit

/// Ticks a task on or off. Used by the widget's checkboxes; runs in the widget
/// extension, so the app doesn't need to be open.
struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Tick Off Task"
    static var description = IntentDescription("Marks a Daybook task as done, or not done.")
    static var isDiscoverable: Bool = false
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Task ID")
    var taskID: String

    init() {}

    init(taskID: UUID) {
        self.taskID = taskID.uuidString
    }

    func perform() async throws -> some IntentResult {
        guard let id = UUID(uuidString: taskID) else { return .result() }
        let store = try AppGroup.makeStore()
        let (_, data) = try store.mutate { $0.toggleCompletion(id) }
        // Cancel or restore this task's reminder straight away. If the app is
        // running it also notices the change and checks everything again.
        await ReminderScheduler.shared.sync(tasks: data.tasks)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

/// Ticks a checklist item in a pinned note from the widget.
struct ToggleChecklistItemIntent: AppIntent {
    static var title: LocalizedStringResource = "Tick Off Checklist Item"
    static var isDiscoverable: Bool = false
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Note ID")
    var noteID: String

    @Parameter(title: "Item ID")
    var itemID: String

    init() {}

    init(noteID: UUID, itemID: UUID) {
        self.noteID = noteID.uuidString
        self.itemID = itemID.uuidString
    }

    func perform() async throws -> some IntentResult {
        guard let note = UUID(uuidString: noteID), let item = UUID(uuidString: itemID) else { return .result() }
        let store = try AppGroup.makeStore()
        try store.mutate { data in
            data.updateNote(note) { n in
                if let i = n.checklist.firstIndex(where: { $0.id == item }) { n.checklist[i].isDone.toggle() }
            }
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
