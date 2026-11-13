import SwiftUI

/// Edits one task. Every change is saved as you make it.
struct TaskEditorView: View {
    let taskID: UUID
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme

    private var task: TaskItem { model.task(taskID) ?? TaskItem(id: taskID, title: "") }

    var body: some View {
        let palette = Palette(scheme)
        let task = self.task

        Form {
            Section {
                TextField("Title", text: bind(\.title), axis: .vertical)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1...4)
                TextField("Notes", text: bind(\.details), prompt: Text("Add a description"), axis: .vertical)
                    .lineLimit(3...10)
            }

            Section {
                Toggle(isOn: bind(\.isImportant)) {
                    Label("Important", systemImage: "star")
                }
                Picker("Priority", selection: bind(\.priority)) {
                    ForEach(Priority.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            Section("Day") {
                Toggle("Assign a day", isOn: hasDay)
                if let day = task.dueDay {
                    DatePicker("Date", selection: dayBinding(day), displayedComponents: .date)
                }
                HStack {
                    let today = model.planner.today
                    Button("Today") { model.schedule(taskID, on: today) }
                    Button("Tomorrow") { model.schedule(taskID, on: today.adding(days: 1)) }
                    Button("No Date") { model.schedule(taskID, on: nil) }
                }
                .controlSize(.small)
                .disabled(task.isCompleted)
            }

            Section {
                Toggle("Remind me", isOn: hasReminder)
                if let reminder = task.reminder {
                    DatePicker("At", selection: reminderBinding(reminder), displayedComponents: [.date, .hourAndMinute])
                    if reminder < model.now && !task.isCompleted {
                        Text("This time has passed. Pick a later time to be reminded.")
                            .font(.caption)
                            .foregroundStyle(palette.overdue)
                    }
                }
                if model.notificationsBlocked && task.reminder != nil {
                    HStack {
                        Text("Notifications are off for Daybook.")
                            .font(.caption)
                            .foregroundStyle(palette.muted)
                        Spacer()
                        Button("Turn On…") { model.openNotificationSettings() }
                            .controlSize(.small)
                    }
                }
            } header: {
                Text("Reminder")
            }

            Section("Repeat") {
                Picker("Repeats", selection: repeatChoice) {
                    ForEach(RepeatChoice.allCases) { Text($0.title).tag($0) }
                }
                if let rule = task.recurrence, RepeatChoice(rule) == .custom {
                    Stepper(value: intervalBinding, in: 1...365) {
                        Text("Every \(rule.interval)")
                    }
                    Picker("Unit", selection: unitBinding) {
                        ForEach(Recurrence.Unit.allCases, id: \.self) { unit in
                            Text(unit.title(plural: rule.interval != 1).capitalized).tag(unit)
                        }
                    }
                }
                if task.recurrence != nil {
                    Text("When you tick it off, it comes back on its next day.")
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                }
            }

            Section {
                if task.isCompleted {
                    if let done = task.completedAt {
                        LabeledContent("Completed", value: done.formatted(date: .abbreviated, time: .shortened))
                    }
                    Button("Restore to List") { model.setCompleted(taskID, false) }
                } else {
                    Button("Mark as Done") { model.toggle(taskID) }
                }
                LabeledContent("Created", value: task.createdAt.formatted(date: .abbreviated, time: .shortened))
                Button("Delete Task", role: .destructive) { model.delete(taskID) }
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(palette.paper)
        .toolbar {
            ToolbarItem {
                Button {
                    model.selectedTaskID = nil
                } label: {
                    Label("Close", systemImage: "sidebar.trailing")
                }
                .help("Close the editor")
            }
        }
    }

    // MARK: Bindings

    private func bind<V>(_ path: WritableKeyPath<TaskItem, V>) -> Binding<V> {
        Binding(get: { task[keyPath: path] },
                set: { value in model.editTask(taskID) { $0[keyPath: path] = value } })
    }

    private var hasDay: Binding<Bool> {
        Binding(get: { task.dueDay != nil },
                set: { on in model.schedule(taskID, on: on ? (task.reminder.map { DayDate($0) } ?? model.planner.today) : nil) })
    }

    private func dayBinding(_ day: DayDate) -> Binding<Date> {
        Binding(get: { day.noonDate() },
                set: { date in model.schedule(taskID, on: DayDate(date)) })
    }

    private var hasReminder: Binding<Bool> {
        Binding(get: { task.reminder != nil },
                set: { on in model.setReminder(taskID, at: on ? defaultReminder() : nil) })
    }

    private func reminderBinding(_ reminder: Date) -> Binding<Date> {
        Binding(get: { reminder },
                set: { date in model.setReminder(taskID, at: date) })
    }

    /// The next whole hour on the task's day (or today), at least 9am on future days.
    private func defaultReminder() -> Date {
        let calendar = Calendar.current
        let today = model.planner.today
        let day = task.dueDay ?? today
        if day > today { return day.date(hour: 9, minute: 0) }
        let hour = calendar.component(.hour, from: Date()) + 1
        if hour > 22 { return today.adding(days: 1).date(hour: 9, minute: 0) }
        return day.date(hour: max(hour, 8), minute: 0)
    }

    private var repeatChoice: Binding<RepeatChoice> {
        Binding(get: { RepeatChoice(task.recurrence) },
                set: { choice in
                    model.editTask(taskID) { t in
                        t.recurrence = choice.recurrence(keeping: t.recurrence)
                        if t.recurrence != nil && t.dueDay == nil {
                            t.dueDay = t.reminder.map { DayDate($0) } ?? DayDate.today()
                        }
                    }
                })
    }

    private var intervalBinding: Binding<Int> {
        Binding(get: { task.recurrence?.interval ?? 1 },
                set: { n in model.editTask(taskID) { $0.recurrence?.interval = max(1, n) } })
    }

    private var unitBinding: Binding<Recurrence.Unit> {
        Binding(get: { task.recurrence?.unit ?? .day },
                set: { unit in model.editTask(taskID) { $0.recurrence?.unit = unit } })
    }
}

enum RepeatChoice: String, CaseIterable, Identifiable {
    case never, daily, weekly, monthly, yearly, custom

    var id: String { rawValue }

    var title: String {
        switch self {
        case .never: return "Never"
        case .daily: return "Every Day"
        case .weekly: return "Every Week"
        case .monthly: return "Every Month"
        case .yearly: return "Every Year"
        case .custom: return "Custom…"
        }
    }

    init(_ rule: Recurrence?) {
        guard let rule else { self = .never; return }
        switch (rule.unit, rule.interval) {
        case (.day, 1): self = .daily
        case (.week, 1): self = .weekly
        case (.month, 1): self = .monthly
        case (.year, 1): self = .yearly
        default: self = .custom
        }
    }

    func recurrence(keeping old: Recurrence?) -> Recurrence? {
        switch self {
        case .never: return nil
        case .daily: return .daily
        case .weekly: return .weekly
        case .monthly: return .monthly
        case .yearly: return .yearly
        case .custom:
            if let old, RepeatChoice(old) == .custom { return old }
            return Recurrence(unit: .day, interval: 2)
        }
    }
}
