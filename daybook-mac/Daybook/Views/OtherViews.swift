import AppKit
import SwiftUI
import UserNotifications

// MARK: - Search

struct SearchResultsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        let results = model.searchResults

        if results.tasks.isEmpty && results.notes.isEmpty {
            ContentUnavailableView.search(text: model.searchText)
        } else {
            List {
                if !results.tasks.isEmpty {
                    Section("Tasks") {
                        ForEach(results.tasks) { task in
                            Button { model.reveal(taskID: task.id) } label: {
                                HStack(spacing: 10) {
                                    CheckCircle(isDone: task.isCompleted, priority: task.priority, size: 15)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(task.title)
                                            .foregroundStyle(task.isCompleted ? palette.muted : palette.ink)
                                            .strikethrough(task.isCompleted, color: palette.muted)
                                        Text(where_(task))
                                            .font(.caption)
                                            .foregroundStyle(palette.muted)
                                    }
                                    Spacer()
                                    if task.isImportant {
                                        Image(systemName: "star.fill").font(.caption).foregroundStyle(palette.important)
                                    }
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if !results.notes.isEmpty {
                    Section("Notes") {
                        ForEach(results.notes) { note in
                            Button { model.reveal(noteID: note.id) } label: {
                                NoteRow(note: note).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .listStyle(.inset)
            .scrollContentBackground(.hidden)
            .navigationTitle("Search")
        }
    }

    private func where_(_ task: TaskItem) -> String {
        if task.isArchived { return "Archived" }
        if task.isCompleted {
            return "Completed " + (task.completedAt?.formatted(date: .abbreviated, time: .omitted) ?? "")
        }
        let home = model.home(of: task)
        if let day = task.effectiveDay(), home != .inbox { return home.title + " · " + model.planner.dayTitle(day) }
        return home.title
    }
}

// MARK: - Onboarding

struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @State private var name = AppGroup.defaults.string(forKey: SharedKey.userName) ?? ""

    var body: some View {
        let palette = Palette(scheme)
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "checklist")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(palette.ink)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Welcome to Daybook").font(.system(size: 22, weight: .bold))
                    Text("Write it down, tick it off.").foregroundStyle(palette.muted)
                }
            }

            TextField("Your first name (for the greeting, optional)", text: $name)
                .textFieldStyle(.roundedBorder)

            step(1, "Add the widget to your desktop",
                 "Right-click an empty spot on the desktop and choose Edit Widgets. Search for Daybook, choose Small, Medium or Large, and drag it onto the desktop. Tick tasks off right from it.")
            step(2, "Add tasks fast",
                 "Type in the box at the top and press Return. Add words like “tomorrow 3pm” or “friday”, or end with “!” to mark it important. Press ⌃⌥Space in any app to jump straight here.")

            VStack(alignment: .leading, spacing: 8) {
                step(3, "Allow notifications",
                     "So reminders can alert you even when Daybook is closed. You can snooze or tick them off from the notification.")
                HStack {
                    switch model.notificationStatus {
                    case .authorized, .provisional:
                        Label("Notifications are on", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(palette.ink)
                    case .denied:
                        Text("Notifications are off. You can turn them on in System Settings any time.")
                            .font(.callout)
                            .foregroundStyle(palette.muted)
                        Button("Open Settings") { model.openNotificationSettings() }
                    default:
                        Button("Allow Notifications") {
                            Task { await model.requestNotifications() }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(palette.ink)
                    }
                }
                .padding(.leading, 34)
            }

            HStack {
                Spacer()
                Button("Start Using Daybook") {
                    AppGroup.defaults.set(name.trimmingCharacters(in: .whitespacesAndNewlines), forKey: SharedKey.userName)
                    model.finishOnboarding()
                    model.requestQuickEntry()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(28)
        .frame(width: 520)
        .task { await model.refreshNotificationStatus() }
    }

    private func step(_ number: Int, _ title: String, _ text: String) -> some View {
        let palette = Palette(scheme)
        return HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .frame(width: 22, height: 22)
                .background(Circle().fill(palette.track))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 14, weight: .semibold))
                Text(text)
                    .font(.system(size: 12.5))
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Menu bar

struct MenuBarView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openWindow) private var openWindow
    @State private var text = ""

    var body: some View {
        let palette = Palette(scheme)
        let progress = model.progress
        let tasks = Array(model.planner.widgetOrder(model.data.tasks).prefix(8))

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text((DaybookFormat.weekday(model.now) + " " + DaybookFormat.dayMonth(model.now)).uppercased())
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(0.6)
                        .foregroundStyle(palette.muted)
                    Text("Today's Tasks").font(.system(size: 15, weight: .semibold))
                }
                Spacer()
                ProgressRing(done: progress.done, total: progress.total, size: 30, lineWidth: 3)
            }

            TextField("Add a task and press Return", text: $text)
                .textFieldStyle(.roundedBorder)
                .onSubmit {
                    model.quickAdd(text, in: .today)
                    text = ""
                }

            if tasks.isEmpty {
                Text(progress.done > 0 ? "All done for today." : "Nothing planned today.")
                    .font(.callout)
                    .foregroundStyle(palette.muted)
            } else {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(tasks) { task in
                        HStack(spacing: 8) {
                            Button { model.toggle(task.id) } label: {
                                CheckCircle(isDone: task.isCompleted, priority: task.priority, size: 15)
                            }
                            .buttonStyle(.plain)
                            Text(task.title).lineLimit(1)
                            Spacer()
                            if model.planner.isOverdue(task) {
                                Text("Overdue").font(.caption).foregroundStyle(palette.overdue)
                            } else if let reminder = task.reminder {
                                Text(DaybookFormat.time(reminder)).font(.caption).foregroundStyle(palette.muted)
                            }
                            if task.isImportant {
                                Image(systemName: "star.fill").font(.caption2).foregroundStyle(palette.important)
                            }
                        }
                        .font(.system(size: 13))
                    }
                }
            }

            Divider()
            HStack {
                Button("Open Daybook") {
                    openWindow(id: "main")
                    NSApp.activate()
                }
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
            }
            .buttonStyle(.borderless)
            .font(.callout)
        }
        .padding(14)
        .frame(width: 300)
    }
}
