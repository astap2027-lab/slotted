import AppKit
import SwiftUI
import UserNotifications

@main
struct DaybookApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = AppModel.shared
    @AppStorage("showMenuBarIcon") private var showMenuBarIcon = true

    var body: some Scene {
        Window("Daybook", id: "main") {
            ContentView()
                .environment(model)
        }
        .defaultSize(width: 980, height: 640)
        .handlesExternalEvents(matching: ["*"])
        .commands { DaybookCommands(model: model) }

        Settings {
            SettingsView()
                .environment(model)
        }

        MenuBarExtra("Daybook", systemImage: "checklist", isInserted: $showMenuBarIcon) {
            MenuBarView()
                .environment(model)
        }
        .menuBarExtraStyle(.window)
    }
}

struct DaybookCommands: Commands {
    let model: AppModel
    @Environment(\.openWindow) private var openWindow

    private var selected: TaskItem? {
        model.selection == .notes ? nil : model.task(model.selectedTaskID)
    }

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Task") {
                openWindow(id: "main")
                model.requestQuickEntry()
            }
            .keyboardShortcut("n")

            Button("New Note") {
                openWindow(id: "main")
                model.newNote()
            }
            .keyboardShortcut("n", modifiers: [.command, .shift])
        }

        CommandMenu("Go") {
            ForEach(SidebarItem.allCases) { item in
                Button(item.title) {
                    openWindow(id: "main")
                    model.searchText = ""
                    model.selection = item
                }
                .keyboardShortcut(item.shortcut)
            }
        }

        CommandMenu("Task") {
            Button(selected?.isCompleted == true ? "Mark as Not Done" : "Mark as Done") {
                if let id = selected?.id { model.toggle(id) }
            }
            .keyboardShortcut(.return, modifiers: .command)
            .disabled(selected == nil)

            Button(selected?.isImportant == true ? "Remove Important" : "Mark as Important") {
                if let id = selected?.id { model.editTask(id) { $0.isImportant.toggle() } }
            }
            .keyboardShortcut("i", modifiers: [.command, .shift])
            .disabled(selected == nil)

            Button("Move to Today") {
                if let id = selected?.id { model.schedule(id, on: model.planner.today) }
            }
            .keyboardShortcut("t", modifiers: [.command, .option])
            .disabled(selected == nil || selected?.isCompleted == true)

            Button("Move to Tomorrow") {
                if let id = selected?.id { model.schedule(id, on: model.planner.today.adding(days: 1)) }
            }
            .keyboardShortcut("t", modifiers: [.command, .option, .shift])
            .disabled(selected == nil || selected?.isCompleted == true)

            Divider()

            // No key shortcut here on purpose: ⌘⌫ also edits text. Press Delete in the list instead.
            Button("Delete Task") {
                if let id = selected?.id { model.delete(id) }
            }
            .disabled(selected == nil)

            Divider()

            Button("Archive Completed Tasks") { model.archiveCompleted() }
                .keyboardShortcut("k", modifiers: [.command, .shift])
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        // Set before launch finishes so a tap on a notification that opened the app isn't missed.
        UNUserNotificationCenter.current().delegate = self
        ReminderScheduler.shared.registerCategories()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        MainActor.assumeIsolated {
            Appearance.saved.apply()
            _ = AppModel.shared
        }
        GlobalHotKey.shared.action = {
            NSApp.activate()
            NSWorkspace.shared.open(DaybookLink.quickAdd)
        }
        if UserDefaults.standard.object(forKey: "globalShortcut") as? Bool ?? true {
            GlobalHotKey.shared.register()
        }
    }

    /// Keep running after the window closes, so the menu bar item, the shortcut and
    /// notification buttons keep working.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    // Show reminders even while Daybook is the active app.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    // "Mark as Done", snoozes, or a click on the notification itself.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let identifier = response.notification.request.identifier
        let action = response.actionIdentifier
        Task { @MainActor in
            defer { completionHandler() }
            guard let id = ReminderScheduler.taskID(from: identifier) else { return }
            let model = AppModel.shared
            model.reloadFromDisk()
            if action == ReminderAction.complete {
                model.setCompleted(id, true)
            } else if let option = ReminderAction.snoozeOption(for: action) {
                model.snooze(id, option)
            } else if action == UNNotificationDefaultActionIdentifier {
                NSApp.activate()
                NSWorkspace.shared.open(DaybookLink.task(id))
            }
        }
    }
}
