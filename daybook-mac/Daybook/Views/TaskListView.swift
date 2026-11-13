import AppKit
import SwiftUI

/// Today, Upcoming, Inbox or Completed.
struct TaskListView: View {
    let section: SidebarItem
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        @Bindable var model = model
        let palette = Palette(scheme)
        let groups = model.groups(for: section)

        VStack(alignment: .leading, spacing: 0) {
            ListHeader(section: section)
                .padding(.horizontal, 24)
                .padding(.top, 18)
            if section.takesQuickEntry {
                QuickEntryField(section: section)
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 6)
            }

            if groups.allSatisfy({ $0.tasks.isEmpty }) {
                EmptyListView(section: section, filtered: model.importantOnly)
            } else {
                List(selection: $model.selectedTaskID) {
                    ForEach(groups) { group in
                        Section {
                            ForEach(group.tasks) { task in
                                TaskRowView(task: task, showsDay: section != .today && section != .upcoming,
                                            isOverdue: model.planner.isOverdue(task))
                                    .tag(task.id)
                            }
                            .onMove(perform: moveAction(for: group))
                        } header: {
                            if groups.count > 1 || section == .upcoming || section == .completed {
                                Text(group.title)
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(group.id == "overdue" ? palette.overdue : palette.muted)
                            }
                        }
                    }
                }
                .listStyle(.inset)
                .scrollContentBackground(.hidden)
                .onDeleteCommand {
                    if let id = model.selectedTaskID { model.delete(id) }
                }
            }
        }
        .background(palette.paper)
        .navigationTitle(section.title)
        .toolbar { toolbar }
    }

    private func moveAction(for group: TaskGroup) -> ((IndexSet, Int) -> Void)? {
        guard group.canReorder else { return nil }
        return { source, destination in model.move(in: group, from: source, to: destination) }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if section == .completed {
            ToolbarItemGroup {
                Toggle(isOn: Bindable(model).showArchived) {
                    Label("Show Archived", systemImage: "archivebox")
                }
                .help("Show tasks you've archived")
                Menu {
                    Button("Archive All Completed") { model.archiveCompleted() }
                    Button("Delete Archived Permanently…", role: .destructive) { confirmDeleteArchived() }
                } label: {
                    Label("Clear", systemImage: "tray.and.arrow.down")
                }
                .help("Archive or delete completed tasks")
            }
        } else {
            ToolbarItemGroup {
                Toggle(isOn: Bindable(model).importantOnly) {
                    Label("Important Only", systemImage: model.importantOnly ? "star.fill" : "star")
                }
                .help("Show only important and high-priority tasks")
                Menu {
                    Picker("Sort By", selection: Bindable(model).sort) {
                        ForEach(TaskSort.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.inline)
                } label: {
                    Label("Sort", systemImage: "arrow.up.arrow.down")
                }
                .help("Sort tasks")
            }
        }
    }

    private func confirmDeleteArchived() {
        let alert = NSAlert()
        alert.messageText = "Delete all archived tasks?"
        alert.informativeText = "This can't be undone."
        alert.addButton(withTitle: "Delete")
        alert.addButton(withTitle: "Cancel")
        alert.buttons.first?.hasDestructiveAction = true
        if alert.runModal() == .alertFirstButtonReturn { model.deleteArchived() }
    }
}

/// Big title, the date, and today's progress.
struct ListHeader: View {
    let section: SidebarItem
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                Text(subtitle.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.7)
                    .foregroundStyle(palette.muted)
                Text(section == .today ? "Today's Tasks" : section.title)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(palette.ink)
            }
            Spacer()
            if section == .today {
                let progress = model.progress
                VStack(alignment: .trailing, spacing: 6) {
                    Text(progress.total == 0 ? "Nothing yet"
                         : "\(Int((Double(progress.done) / Double(max(progress.total, 1)) * 100).rounded()))% done")
                        .font(.system(size: 12, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(palette.muted)
                    ProgressBar(done: progress.done, total: progress.total, height: 5)
                        .frame(width: 140)
                }
            }
        }
    }

    private var subtitle: String {
        switch section {
        case .today: return DaybookFormat.weekday(model.now) + " " + DaybookFormat.dayMonth(model.now)
        case .upcoming: return "Planned for later"
        case .inbox: return "No date yet"
        case .completed: return "History"
        case .notes: return "Notes"
        }
    }
}

/// The always-ready "type and press Return" field.
struct QuickEntryField: View {
    let section: SidebarItem
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let palette = Palette(scheme)
        let preview = QuickEntry.parse(text, now: model.now)

        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 10) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 17))
                    .foregroundStyle(focused ? palette.ink : palette.muted)
                TextField(placeholder, text: $text)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .focused($focused)
                    .onSubmit(submit)
                if !text.isEmpty {
                    Text("↩")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(palette.muted)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(palette.card))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(focused ? palette.ring : palette.hairline))

            if let preview, preview.day != nil || preview.reminder != nil || preview.isImportant {
                Text(describe(preview))
                    .font(.system(size: 11))
                    .foregroundStyle(palette.muted)
                    .padding(.leading, 12)
            }
        }
        .onAppear { if section == .today && model.data.tasks.isEmpty { focused = true } }
        .onChange(of: model.quickEntryFocus) { focused = true }
    }

    private var placeholder: String {
        switch section {
        case .upcoming: return "Add a task for tomorrow — or type a day, like “Pack kit friday”"
        case .inbox: return "Add to Inbox — no date needed"
        default: return "Add a task — e.g. “Email teacher tomorrow 3pm”"
        }
    }

    private func describe(_ entry: QuickEntry) -> String {
        var parts: [String] = []
        if let day = entry.day { parts.append(model.planner.dayTitle(day)) }
        if let reminder = entry.reminder { parts.append("remind at " + DaybookFormat.time(reminder)) }
        if entry.isImportant { parts.append("important") }
        return "“\(entry.title)” · " + parts.joined(separator: " · ")
    }

    private func submit() {
        model.quickAdd(text, in: section)
        text = ""
        focused = true
    }
}

struct EmptyListView: View {
    let section: SidebarItem
    let filtered: Bool

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: filtered ? "star" : section.icon)
        } description: {
            Text(message)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var title: String {
        if filtered { return "No important tasks" }
        switch section {
        case .today: return "Nothing planned for today"
        case .upcoming: return "Nothing coming up"
        case .inbox: return "Inbox is empty"
        case .completed: return "No completed tasks yet"
        case .notes: return "No notes"
        }
    }

    private var message: String {
        if filtered { return "Turn off the star filter in the toolbar to see everything." }
        switch section {
        case .today: return "Type above and press Return to add a task. ⌃⌥Space opens this from any app."
        case .upcoming: return "Tasks with a future date show here, grouped by day."
        case .inbox: return "Somewhere to drop things that don't have a day yet."
        case .completed: return "Ticked-off tasks are kept here. You can restore any of them."
        case .notes: return ""
        }
    }
}
