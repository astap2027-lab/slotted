import AppKit
import SwiftUI
import UserNotifications
import WidgetKit

struct SettingsView: View {
    var body: some View {
        TabView {
            GeneralSettings().tabItem { Label("General", systemImage: "gearshape") }
            NotificationSettings().tabItem { Label("Notifications", systemImage: "bell") }
            AppearanceSettings().tabItem { Label("Appearance", systemImage: "paintbrush") }
            DataSettings().tabItem { Label("Data", systemImage: "externaldrive") }
        }
        .frame(width: 480)
        .padding(.vertical, 8)
    }
}

private struct GeneralSettings: View {
    @State private var name = AppGroup.defaults.string(forKey: SharedKey.userName) ?? ""
    @State private var openAtLogin = LoginItem.isEnabled
    @State private var loginError: String?
    @AppStorage("showMenuBarIcon") private var showMenuBarIcon = true
    @AppStorage("globalShortcut") private var globalShortcut = true

    var body: some View {
        Form {
            TextField("Your name", text: $name, prompt: Text("Shown in the greeting"))
                .onChange(of: name) {
                    AppGroup.defaults.set(name.trimmingCharacters(in: .whitespacesAndNewlines), forKey: SharedKey.userName)
                    WidgetCenter.shared.reloadAllTimelines()
                }

            Toggle("Open Daybook when my Mac starts", isOn: $openAtLogin)
                .onChange(of: openAtLogin) {
                    do {
                        try LoginItem.set(openAtLogin)
                        loginError = LoginItem.needsApproval
                            ? "Allow Daybook in System Settings → General → Login Items." : nil
                    } catch {
                        loginError = error.localizedDescription
                        openAtLogin = LoginItem.isEnabled
                    }
                }
            if let loginError {
                HStack {
                    Text(loginError).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button("Open Login Items") { LoginItem.openSettings() }.controlSize(.small)
                }
            }

            Toggle("Show Daybook in the menu bar", isOn: $showMenuBarIcon)

            Toggle("\(GlobalHotKey.displayName) opens quick entry from any app", isOn: $globalShortcut)
                .onChange(of: globalShortcut) {
                    if globalShortcut { GlobalHotKey.shared.register() } else { GlobalHotKey.shared.unregister() }
                }

            Section("Shortcuts in Daybook") {
                LabeledContent("New task", value: "⌘N")
                LabeledContent("New note", value: "⇧⌘N")
                LabeledContent("Today · Upcoming · Inbox · Notes · Completed", value: "⌘1 – ⌘5")
                LabeledContent("Mark selected task done", value: "⌘↩")
                LabeledContent("Mark selected task important", value: "⇧⌘I")
                LabeledContent("Archive completed tasks", value: "⇧⌘K")
            }
        }
        .formStyle(.grouped)
        .onAppear { openAtLogin = LoginItem.isEnabled }
    }
}

private struct NotificationSettings: View {
    @Environment(AppModel.self) private var model
    @State private var testSent = false

    var body: some View {
        Form {
            LabeledContent("Status") {
                switch model.notificationStatus {
                case .authorized, .provisional: Text("Allowed")
                case .denied: Text("Turned off")
                default: Text("Not asked yet")
                }
            }
            switch model.notificationStatus {
            case .notDetermined:
                Button("Allow Notifications") { Task { await model.requestNotifications() } }
            case .denied:
                Text("Reminders can't alert you while notifications are off. Turn them on for Daybook in System Settings.")
                    .font(.callout).foregroundStyle(.secondary)
                Button("Open Notification Settings") { model.openNotificationSettings() }
            default:
                Text("Reminders arrive even when Daybook is closed. From a notification you can mark the task done or snooze it for 5 minutes, 15 minutes, 1 hour or until later today.")
                    .font(.callout).foregroundStyle(.secondary)
                Button(testSent ? "Test sent — wait 5 seconds" : "Send a Test Notification") {
                    Task {
                        try? await ReminderScheduler.shared.sendTest()
                        testSent = true
                    }
                }
                .disabled(testSent)
            }
        }
        .formStyle(.grouped)
        .task { await model.refreshNotificationStatus() }
    }
}

private struct AppearanceSettings: View {
    @AppStorage("appearance") private var appearance = Appearance.system.rawValue
    @State private var widgetShowsCompleted = AppGroup.defaults.object(forKey: SharedKey.widgetShowsCompleted) as? Bool ?? true
    @State private var widgetShowsNote = AppGroup.defaults.object(forKey: SharedKey.widgetShowsNote) as? Bool ?? true

    var body: some View {
        Form {
            Picker("Appearance", selection: $appearance) {
                ForEach(Appearance.allCases) { Text($0.title).tag($0.rawValue) }
            }
            .onChange(of: appearance) { (Appearance(rawValue: appearance) ?? .system).apply() }
            Text("The desktop widget always follows your Mac's appearance.")
                .font(.caption).foregroundStyle(.secondary)

            Section("Widget") {
                Toggle("Show tasks done today", isOn: $widgetShowsCompleted)
                    .onChange(of: widgetShowsCompleted) {
                        AppGroup.defaults.set(widgetShowsCompleted, forKey: SharedKey.widgetShowsCompleted)
                        WidgetCenter.shared.reloadAllTimelines()
                    }
                Toggle("Show pinned note", isOn: $widgetShowsNote)
                    .onChange(of: widgetShowsNote) {
                        AppGroup.defaults.set(widgetShowsNote, forKey: SharedKey.widgetShowsNote)
                        WidgetCenter.shared.reloadAllTimelines()
                    }
            }
        }
        .formStyle(.grouped)
    }
}

private struct DataSettings: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Form {
            Text("Everything is saved on this Mac as soon as you change it, in a folder the app and the widget share. The previous version is kept as a backup.")
                .font(.callout).foregroundStyle(.secondary)
            if let store = model.store {
                LabeledContent("Location") {
                    Text(store.directory.path)
                        .font(.caption)
                        .textSelection(.enabled)
                        .lineLimit(2)
                        .truncationMode(.middle)
                }
                HStack {
                    Button("Show in Finder") { model.revealDataFolder() }
                    Button("Export Backup…") { model.exportBackup() }
                }
            } else {
                Text("The shared data folder isn't available. Check the Team ID in Config/Signing.xcconfig and build again.")
                    .foregroundStyle(.red)
            }
            LabeledContent("Tasks", value: "\(model.data.tasks.count)")
            LabeledContent("Notes", value: "\(model.data.notes.count)")
        }
        .formStyle(.grouped)
    }
}
