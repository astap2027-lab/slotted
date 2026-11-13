import SwiftUI

struct TaskRowView: View {
    let task: TaskItem
    var showsDay: Bool
    var isOverdue: Bool
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    /// Fills the checkbox at once; the task moves a moment later so the tick is seen.
    @State private var ticking = false

    var body: some View {
        let palette = Palette(scheme)
        let shownDone = task.isCompleted || ticking

        HStack(alignment: .top, spacing: 10) {
            Button(action: tick) {
                CheckCircle(isDone: shownDone, priority: task.priority, size: 18)
            }
            .buttonStyle(.plain)
            .padding(.top, 1)
            .help(task.isCompleted ? "Mark as not done" : "Mark as done")

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if task.priority != .none && !shownDone {
                        Text(task.priority.marks)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(palette.priority(task.priority))
                    }
                    Text(task.title)
                        .font(.system(size: 13.5))
                        .strikethrough(shownDone, color: palette.muted)
                        .foregroundStyle(shownDone ? palette.muted : palette.ink)
                        .lineLimit(2)
                }
                let details = task.details.trimmingCharacters(in: .whitespacesAndNewlines)
                if !details.isEmpty {
                    Text(details)
                        .font(.system(size: 12))
                        .foregroundStyle(palette.muted)
                        .lineLimit(1)
                }
                meta(palette)
            }
            Spacer(minLength: 8)
            if task.isImportant {
                Image(systemName: "star.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(shownDone ? palette.muted : palette.important)
                    .padding(.top, 2)
            }
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .opacity(ticking ? 0.6 : 1)
        .contextMenu { menu }
    }

    @ViewBuilder
    private func meta(_ palette: Palette) -> some View {
        let planner = model.planner
        let items = metaItems(planner)
        if !items.isEmpty || isOverdue {
            HStack(spacing: 10) {
                if isOverdue, let day = task.effectiveDay() {
                    Label(planner.dayTitle(day), systemImage: "exclamationmark.circle")
                        .foregroundStyle(palette.overdue)
                }
                ForEach(items) { item in
                    Label(item.text, systemImage: item.icon)
                }
            }
            .font(.system(size: 11))
            .foregroundStyle(palette.muted)
            .labelStyle(CompactLabelStyle())
        }
    }

    private struct MetaItem: Identifiable {
        var text: String
        var icon: String
        var id: String { icon + text }
        init(_ text: String, _ icon: String) { self.text = text; self.icon = icon }
    }

    private func metaItems(_ planner: Planner) -> [MetaItem] {
        var items: [MetaItem] = []
        if task.isCompleted, let done = task.completedAt {
            items.append(MetaItem("Done " + DaybookFormat.time(done), "checkmark"))
        }
        if showsDay, !isOverdue, !task.isCompleted, let day = task.dueDay {
            items.append(MetaItem(planner.dayTitle(day), "calendar"))
        }
        if let reminder = task.reminder, !task.isCompleted {
            items.append(MetaItem(DaybookFormat.reminder(reminder, planner: planner), "bell"))
        }
        if let rule = task.recurrence {
            items.append(MetaItem(rule.summary, "repeat"))
        }
        return items
    }

    private func tick() {
        if task.isCompleted {
            model.toggle(task.id)
            return
        }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { ticking = true }
        let id = task.id
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            model.toggle(id)
            ticking = false
        }
    }

    @ViewBuilder
    private var menu: some View {
        let today = model.planner.today
        Button(task.isCompleted ? "Mark as Not Done" : "Mark as Done") { model.toggle(task.id) }
        Button("Edit…") {
            model.selectedTaskID = task.id
        }
        Divider()
        Button(task.isImportant ? "Remove Important" : "Mark as Important") {
            model.editTask(task.id) { $0.isImportant.toggle() }
        }
        Menu("Priority") {
            ForEach(Priority.allCases, id: \.self) { p in
                Button {
                    model.editTask(task.id) { $0.priority = p }
                } label: {
                    if task.priority == p { Label(p.title, systemImage: "checkmark") } else { Text(p.title) }
                }
            }
        }
        if !task.isCompleted {
            Menu("Move To") {
                Button("Today") { model.schedule(task.id, on: today) }
                Button("Tomorrow") { model.schedule(task.id, on: today.adding(days: 1)) }
                Button("Next Week") {
                    let offset = (2 - today.weekday() + 7) % 7
                    model.schedule(task.id, on: today.adding(days: offset == 0 ? 7 : offset))
                }
                Divider()
                Button("Inbox (No Date)") { model.schedule(task.id, on: nil) }
            }
            Menu("Remind Me") {
                Button("In 1 Hour") { model.setReminder(task.id, at: Date().addingTimeInterval(3600)) }
                if Date() < today.date(hour: 18, minute: 0) {
                    Button("This Evening (6 pm)") { model.setReminder(task.id, at: today.date(hour: 18, minute: 0)) }
                }
                Button("Tomorrow Morning (8 am)") {
                    model.setReminder(task.id, at: today.adding(days: 1).date(hour: 8, minute: 0))
                }
                if task.reminder != nil {
                    Divider()
                    Button("Remove Reminder") { model.setReminder(task.id, at: nil) }
                }
            }
        }
        Divider()
        Button("Delete", role: .destructive) { model.delete(task.id) }
    }
}

/// Small icon + text with tight spacing.
struct CompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon
            configuration.title
        }
    }
}
