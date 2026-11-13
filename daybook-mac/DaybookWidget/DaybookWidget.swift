import AppIntents
import SwiftUI
import WidgetKit

@main
struct DaybookWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
    }
}

struct TodayWidget: Widget {
    let kind = "DaybookToday"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Today's tasks with checkboxes, your progress and a pinned note.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Timeline

struct TodayEntry: TimelineEntry {
    let date: Date
    let open: [TaskItem]
    let doneToday: [TaskItem]
    let overdueIDs: Set<UUID>
    let doneCount: Int
    let totalCount: Int
    let note: Note?
    let greeting: String
    let showsCompleted: Bool
    let problem: String?

    static func make(data: DaybookData, at date: Date, problem: String? = nil) -> TodayEntry {
        let planner = Planner(now: date, calendar: .current)
        let defaults = AppGroup.defaults
        let open = planner.widgetOrder(data.tasks)
        let progress = planner.progress(data.tasks)
        let showsNote = defaults.object(forKey: SharedKey.widgetShowsNote) as? Bool ?? true
        return TodayEntry(
            date: date,
            open: open,
            doneToday: planner.doneToday(data.tasks).filter { !$0.isArchived },
            overdueIDs: Set(open.filter { planner.isOverdue($0) }.map(\.id)),
            doneCount: progress.done,
            totalCount: progress.total,
            note: showsNote ? planner.sortedNotes(data.notes).first(where: \.isPinned) : nil,
            greeting: planner.greeting(name: defaults.string(forKey: SharedKey.userName)),
            showsCompleted: defaults.object(forKey: SharedKey.widgetShowsCompleted) as? Bool ?? true,
            problem: problem)
    }

    /// Example content, only for the widget gallery before anything has been added.
    static func sample(at date: Date) -> TodayEntry {
        let today = DayDate(date)
        var tasks = [
            TaskItem(title: "Finish legal studies notes", dueDay: today, isImportant: true),
            TaskItem(title: "Pack running shoes", dueDay: today,
                     reminder: Calendar.current.date(bySettingHour: 15, minute: 30, second: 0, of: date)),
            TaskItem(title: "Email teacher", dueDay: today, priority: .medium),
            TaskItem(title: "Buy birthday present", dueDay: today),
        ]
        tasks[3].isCompleted = true
        tasks[3].completedAt = date
        let note = Note(title: "Sailing", checklist: [ChecklistItem(text: "Wetsuit"), ChecklistItem(text: "Gloves", isDone: true)],
                        isPinned: true)
        return make(data: DaybookData(tasks: tasks, notes: [note]), at: date)
    }
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        .sample(at: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        let now = Date()
        let (data, problem) = load()
        if context.isPreview && data.tasks.isEmpty && problem == nil {
            completion(.sample(at: now))
        } else {
            completion(.make(data: data, at: now, problem: problem))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let now = Date()
        let (data, problem) = load()
        let planner = Planner(now: now)
        // Redraw when the greeting changes and at midnight, when today's list changes.
        var moments = [now]
        for hour in [5, 12, 17] {
            if let t = Calendar.current.date(bySettingHour: hour, minute: 0, second: 0, of: now), t > now {
                moments.append(t)
            }
        }
        let entries = moments.map { TodayEntry.make(data: data, at: $0, problem: problem) }
        completion(Timeline(entries: entries, policy: .after(planner.nextMidnight.addingTimeInterval(1))))
    }

    private func load() -> (DaybookData, String?) {
        do {
            return (try AppGroup.makeStore().load(), nil)
        } catch {
            return (DaybookData(), "Open Daybook to finish setting up.")
        }
    }
}

// MARK: - Views

struct TodayWidgetView: View {
    let entry: TodayEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        Group {
            if let problem = entry.problem {
                VStack(spacing: 6) {
                    Image(systemName: "checklist").font(.title2).foregroundStyle(palette.muted)
                    Text(problem).font(.system(size: 12)).multilineTextAlignment(.center).foregroundStyle(palette.muted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                switch family {
                case .systemSmall: SmallLayout(entry: entry)
                case .systemLarge: LargeLayout(entry: entry)
                default: MediumLayout(entry: entry)
                }
            }
        }
        .containerBackground(for: .widget) { palette.paper }
        .widgetURL(DaybookLink.today)
    }
}

/// Rows to show: open tasks first, then (if there's room and it's turned on) today's done ones.
private func rows(_ entry: TodayEntry, limit: Int) -> [TaskItem] {
    var list = Array(entry.open.prefix(limit))
    if entry.showsCompleted && list.count < limit {
        list += entry.doneToday.prefix(limit - list.count)
    }
    return list
}

private struct Header: View {
    let entry: TodayEntry
    var compact = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(compact ? DaybookFormat.shortDate(entry.date).uppercased()
                             : (DaybookFormat.weekday(entry.date) + " " + DaybookFormat.dayMonth(entry.date)).uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Text(compact ? "Today" : entry.greeting)
                    .font(.system(size: compact ? 15 : 15, weight: .semibold))
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 4)
            ProgressRing(done: entry.doneCount, total: entry.totalCount, size: compact ? 28 : 32, lineWidth: 3)
                .invalidatableContent()
        }
    }
}

private struct TaskRow: View {
    let task: TaskItem
    let overdue: Bool
    var showsMeta = true
    var fontSize: CGFloat = 12.5
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        HStack(alignment: .center, spacing: 7) {
            Button(intent: ToggleTaskIntent(taskID: task.id)) {
                CheckCircle(isDone: task.isCompleted, priority: task.priority, size: fontSize + 3.5)
            }
            .buttonStyle(.plain)

            Link(destination: DaybookLink.task(task.id)) {
                HStack(spacing: 4) {
                    Text(task.title)
                        .font(.system(size: fontSize, weight: .medium))
                        .strikethrough(task.isCompleted, color: palette.muted)
                        .foregroundStyle(task.isCompleted ? palette.muted : palette.ink)
                        .lineLimit(1)
                    Spacer(minLength: 2)
                    if showsMeta && !task.isCompleted {
                        if overdue {
                            Text("Overdue").font(.system(size: 10, weight: .medium)).foregroundStyle(palette.overdue)
                        } else if let reminder = task.reminder {
                            Text(DaybookFormat.time(reminder))
                                .font(.system(size: 10, weight: .medium))
                                .monospacedDigit()
                                .foregroundStyle(palette.muted)
                        }
                    }
                    if task.isImportant && !task.isCompleted {
                        Image(systemName: "star.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(palette.important)
                            .widgetAccentable()
                    }
                }
            }
        }
        .invalidatableContent()
    }
}

private struct EmptyState: View {
    let entry: TodayEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        VStack(spacing: 4) {
            Image(systemName: entry.doneCount > 0 ? "checkmark.circle" : "sun.max")
                .font(.system(size: 18, weight: .light))
                .foregroundStyle(palette.muted)
            Text(entry.doneCount > 0 ? "All done for today" : "Nothing planned today")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(palette.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct MoreLine: View {
    let count: Int
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        if count > 0 {
            Text("+\(count) more")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(Palette(scheme).muted)
        }
    }
}

private struct SmallLayout: View {
    let entry: TodayEntry

    var body: some View {
        let list = rows(entry, limit: 4)
        VStack(alignment: .leading, spacing: 8) {
            Header(entry: entry, compact: true)
            if list.isEmpty {
                EmptyState(entry: entry)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(list) { task in
                        TaskRow(task: task, overdue: entry.overdueIDs.contains(task.id), showsMeta: false, fontSize: 12)
                    }
                }
                Spacer(minLength: 0)
                MoreLine(count: entry.open.count - list.filter { !$0.isCompleted }.count)
            }
        }
    }
}

private struct MediumLayout: View {
    let entry: TodayEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        let list = rows(entry, limit: 4)
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Header(entry: entry)
                if list.isEmpty {
                    EmptyState(entry: entry)
                } else {
                    VStack(alignment: .leading, spacing: 5) {
                        ForEach(list) { task in
                            TaskRow(task: task, overdue: entry.overdueIDs.contains(task.id))
                        }
                    }
                    Spacer(minLength: 0)
                    MoreLine(count: entry.open.count - list.filter { !$0.isCompleted }.count)
                }
            }
            if let note = entry.note {
                Rectangle().fill(palette.hairline).frame(width: 1)
                NoteCard(note: note, maxLines: 4, maxItems: 3)
                    .frame(width: 112)
            }
        }
    }
}

private struct LargeLayout: View {
    let entry: TodayEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        let limit = entry.note == nil ? 11 : 7
        let list = rows(entry, limit: limit)
        VStack(alignment: .leading, spacing: 10) {
            Header(entry: entry)
            VStack(alignment: .leading, spacing: 4) {
                ProgressBar(done: entry.doneCount, total: entry.totalCount)
                Text(entry.totalCount == 0 ? "No tasks for today yet"
                     : "\(entry.doneCount) of \(entry.totalCount) done today")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(palette.muted)
                    .invalidatableContent()
            }
            if list.isEmpty {
                EmptyState(entry: entry)
            } else {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(list) { task in
                        TaskRow(task: task, overdue: entry.overdueIDs.contains(task.id), fontSize: 13)
                    }
                }
                MoreLine(count: entry.open.count - list.filter { !$0.isCompleted }.count)
            }
            Spacer(minLength: 0)
            if let note = entry.note {
                NoteCard(note: note, maxLines: 3, maxItems: 4)
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(palette.card))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(palette.hairline))
            }
        }
    }
}

private struct NoteCard: View {
    let note: Note
    let maxLines: Int
    let maxItems: Int
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        VStack(alignment: .leading, spacing: 5) {
            Link(destination: DaybookLink.note(note.id)) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 4) {
                        Image(systemName: "pin.fill").font(.system(size: 8)).foregroundStyle(palette.muted)
                        Text(note.displayTitle)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(palette.ink)
                            .lineLimit(1)
                    }
                    if note.checklist.isEmpty && !note.preview.isEmpty {
                        Text(note.preview)
                            .font(.system(size: 11))
                            .foregroundStyle(palette.muted)
                            .lineLimit(maxLines)
                    }
                }
            }
            ForEach(note.checklist.prefix(maxItems)) { item in
                HStack(spacing: 5) {
                    Button(intent: ToggleChecklistItemIntent(noteID: note.id, itemID: item.id)) {
                        CheckCircle(isDone: item.isDone, size: 12)
                    }
                    .buttonStyle(.plain)
                    Text(item.text)
                        .font(.system(size: 11))
                        .strikethrough(item.isDone, color: palette.muted)
                        .foregroundStyle(item.isDone ? palette.muted : palette.ink)
                        .lineLimit(1)
                }
            }
            if note.checklist.count > maxItems {
                Text("+\(note.checklist.count - maxItems) more")
                    .font(.system(size: 10)).foregroundStyle(palette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
