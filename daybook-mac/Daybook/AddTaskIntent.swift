import AppIntents
import Foundation

/// "Add a task in Daybook" for Shortcuts, Spotlight and Siri.
/// Understands the same words as quick entry ("Email teacher tomorrow 3pm").
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Task"
    static var description = IntentDescription("Adds a task to Daybook. Words like “tomorrow 3pm” set the day and a reminder.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Task", requestValueDialog: "What do you need to do?")
    var text: String

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let model = AppModel.shared
        model.reloadFromDisk()
        guard QuickEntry.parse(text) != nil else {
            return .result(dialog: "There was nothing to add.")
        }
        model.quickAdd(text, in: .today)
        return .result(dialog: "Added to Daybook.")
    }
}

struct DaybookShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddTaskIntent(),
                    phrases: ["Add a task in \(.applicationName)", "Add to \(.applicationName)"],
                    shortTitle: "Add Task",
                    systemImageName: "plus.circle")
    }
}
