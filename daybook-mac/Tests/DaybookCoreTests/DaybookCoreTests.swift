import XCTest
@testable import DaybookCore

/// Fixed calendar and clock so tests don't depend on where or when they run.
private func sydney() -> Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "Australia/Sydney")!
    c.locale = Locale(identifier: "en_AU")
    return c
}

private func at(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0, _ cal: Calendar = sydney()) -> Date {
    cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
}

final class DayDateTests: XCTestCase {
    func testKeyRoundTripAndOrder() {
        let d = DayDate(year: 2026, month: 11, day: 13)
        XCTAssertEqual(d.key, "2026-11-13")
        XCTAssertEqual(DayDate(key: "2026-11-13"), d)
        XCTAssertNil(DayDate(key: "2026-13-01"))
        XCTAssertTrue(DayDate(year: 2026, month: 11, day: 13) < DayDate(year: 2026, month: 12, day: 1))
    }

    func testDayFollowsTimeZone() {
        // 11pm UTC on 12 Nov is already 13 Nov in Sydney.
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let moment = utc.date(from: DateComponents(year: 2026, month: 11, day: 12, hour: 23))!
        XCTAssertEqual(DayDate(moment, calendar: utc), DayDate(year: 2026, month: 11, day: 12))
        XCTAssertEqual(DayDate(moment, calendar: sydney()), DayDate(year: 2026, month: 11, day: 13))
    }

    func testAddingAcrossDaylightSaving() {
        // Sydney clocks go forward on 4 Oct 2026.
        let cal = sydney()
        let d = DayDate(year: 2026, month: 10, day: 3)
        XCTAssertEqual(d.adding(days: 1, calendar: cal), DayDate(year: 2026, month: 10, day: 4))
        XCTAssertEqual(d.adding(days: 2, calendar: cal), DayDate(year: 2026, month: 10, day: 5))
        XCTAssertEqual(DayDate(year: 2026, month: 1, day: 31).adding(months: 1, calendar: cal),
                       DayDate(year: 2026, month: 2, day: 28))
    }

    func testCodableAsString() throws {
        let data = try JSONEncoder().encode([DayDate(year: 2026, month: 1, day: 2)])
        XCTAssertEqual(String(data: data, encoding: .utf8), "[\"2026-01-02\"]")
    }
}

final class OperationTests: XCTestCase {
    let cal = sydney()

    func testAddPutsNewTaskFirstAndRejectsDuplicatesAndBlank() {
        var data = DaybookData()
        let a = TaskItem(title: "Finish legal studies notes")
        let b = TaskItem(title: "Pack running shoes")
        XCTAssertTrue(data.addTask(a))
        XCTAssertTrue(data.addTask(b))
        XCTAssertFalse(data.addTask(a), "same id twice")
        XCTAssertFalse(data.addTask(TaskItem(title: "   ")), "blank title")
        XCTAssertEqual(data.tasks.count, 2)
        let ordered = Planner(calendar: cal).sorted(data.tasks, by: .manual)
        XCTAssertEqual(ordered.map(\.title), ["Pack running shoes", "Finish legal studies notes"])
    }

    func testCompleteIsIdempotentAndRestore() {
        var data = DaybookData()
        let t = TaskItem(title: "Email teacher")
        data.addTask(t)
        let now = at(2026, 11, 13, 9)
        XCTAssertEqual(data.setCompleted(t.id, true, now: now, calendar: cal), .completed)
        let firstDone = data.task(t.id)!.completedAt
        XCTAssertEqual(data.setCompleted(t.id, true, now: now.addingTimeInterval(60), calendar: cal), .completed)
        XCTAssertEqual(data.task(t.id)!.completedAt, firstDone, "second completion changes nothing")
        data.archiveCompleted(now: now)
        XCTAssertTrue(data.task(t.id)!.isArchived)
        XCTAssertEqual(data.setCompleted(t.id, false, now: now, calendar: cal), .reopened)
        let restored = data.task(t.id)!
        XCTAssertFalse(restored.isCompleted)
        XCTAssertFalse(restored.isArchived)
        XCTAssertNil(restored.completedAt)
    }

    func testRepeatingTaskKeepsRecordAndMovesForward() {
        var data = DaybookData()
        let monday = DayDate(year: 2026, month: 11, day: 9)
        var t = TaskItem(title: "Stretch", dueDay: monday, recurrence: .daily)
        t.reminder = monday.date(hour: 7, minute: 30, in: cal)
        data.addTask(t)
        // Completed on Friday 13th, four days late: next is Saturday, not Tuesday.
        let now = at(2026, 11, 13, 10)
        let result = data.toggleCompletion(t.id, now: now, calendar: cal)
        XCTAssertEqual(result, .repeated(nextDay: DayDate(year: 2026, month: 11, day: 14)))
        XCTAssertEqual(data.tasks.count, 2)
        let moved = data.task(t.id)!
        XCTAssertFalse(moved.isCompleted)
        XCTAssertEqual(moved.dueDay, DayDate(year: 2026, month: 11, day: 14))
        let parts = cal.dateComponents([.day, .hour, .minute], from: moved.reminder!)
        XCTAssertEqual([parts.day, parts.hour, parts.minute], [14, 7, 30])
        let record = data.tasks.first { $0.seriesID == t.id }!
        XCTAssertTrue(record.isCompleted)
        XCTAssertNil(record.recurrence)
        XCTAssertTrue(Planner(now: now, calendar: cal).isDoneToday(record))
    }

    func testWeeklyAndCustomIntervals() {
        let d = DayDate(year: 2026, month: 11, day: 13)
        XCTAssertEqual(Recurrence.weekly.next(after: d, calendar: cal), DayDate(year: 2026, month: 11, day: 20))
        XCTAssertEqual(Recurrence(unit: .day, interval: 3).next(after: d, calendar: cal), DayDate(year: 2026, month: 11, day: 16))
        XCTAssertEqual(Recurrence(unit: .week, interval: 2).summary, "Every 2 weeks")
        XCTAssertEqual(Recurrence(unit: .day, interval: 0).interval, 1)
    }

    func testReorderKeepsOtherTasksInPlace() {
        var data = DaybookData()
        let a = TaskItem(title: "A"), b = TaskItem(title: "B"), c = TaskItem(title: "C")
        data.addTask(a); data.addTask(b); data.addTask(c) // order: C, B, A
        data.reorder([a.id, c.id]) // swap A and C, leave B
        let order = Planner(calendar: cal).sorted(data.tasks, by: .manual).map(\.title)
        XCTAssertEqual(order, ["A", "B", "C"])
    }

    func testSnoozeSkipsCompleted() {
        var data = DaybookData()
        let t = TaskItem(title: "Buy birthday present")
        data.addTask(t)
        let later = at(2026, 11, 13, 18)
        data.snooze(t.id, until: later)
        XCTAssertEqual(data.task(t.id)?.reminder, later)
        data.setCompleted(t.id, true)
        data.snooze(t.id, until: later.addingTimeInterval(600))
        XCTAssertEqual(data.task(t.id)?.reminder, later)
    }

    func testUpdateOnlyTouchesModifiedWhenChanged() {
        var data = DaybookData()
        let created = at(2026, 11, 1)
        let t = TaskItem(title: "X", now: created)
        data.addTask(t)
        data.updateTask(t.id, now: at(2026, 11, 2)) { $0.title = "X" }
        XCTAssertEqual(data.task(t.id)?.modifiedAt, created)
        data.updateTask(t.id, now: at(2026, 11, 3)) { $0.title = "Y" }
        XCTAssertEqual(data.task(t.id)?.modifiedAt, at(2026, 11, 3))
    }

    func testNotesAndChecklist() {
        var data = DaybookData()
        var n = Note(body: "Sailing kit\nwetsuit, gloves")
        n.checklist = [ChecklistItem(text: "Wetsuit"), ChecklistItem(text: "Gloves", isDone: true)]
        XCTAssertTrue(data.addNote(n))
        XCTAssertFalse(data.addNote(n))
        XCTAssertEqual(data.note(n.id)?.displayTitle, "Sailing kit")
        XCTAssertEqual(data.note(n.id)?.preview, "wetsuit, gloves")
        XCTAssertEqual(data.note(n.id)!.checklistProgress.done, 1)
        data.updateNote(n.id) { $0.checklist[0].isDone = true }
        XCTAssertEqual(data.note(n.id)!.checklistProgress.done, 2)
        data.deleteNote(n.id)
        XCTAssertTrue(data.notes.isEmpty)
    }
}

final class PlannerTests: XCTestCase {
    let cal = sydney()

    func testSections() {
        let now = at(2026, 11, 13, 10)
        let p = Planner(now: now, calendar: cal)
        let today = p.today
        let overdue = TaskItem(title: "Overdue", dueDay: today.adding(days: -2, calendar: cal))
        let due = TaskItem(title: "Today", dueDay: today)
        let future = TaskItem(title: "Future", dueDay: today.adding(days: 3, calendar: cal))
        let inbox = TaskItem(title: "Inbox")
        let importantInbox = TaskItem(title: "Important", isImportant: true)
        let reminderOnly = TaskItem(title: "Reminder tomorrow", reminder: at(2026, 11, 14, 9))
        var done = TaskItem(title: "Done", dueDay: today)
        done.isCompleted = true
        done.completedAt = now
        let all = [overdue, due, future, inbox, importantInbox, reminderOnly, done]

        XCTAssertEqual(Set(p.todayOpen(all).map(\.title)), ["Overdue", "Today", "Important"])
        XCTAssertEqual(Set(p.upcoming(all).map(\.title)), ["Future", "Reminder tomorrow"])
        XCTAssertEqual(Set(p.inbox(all).map(\.title)), ["Inbox", "Important"])
        XCTAssertTrue(p.isOverdue(overdue))
        XCTAssertFalse(p.isOverdue(due))
        let progress = p.progress(all)
        XCTAssertEqual(progress.done, 1)
        XCTAssertEqual(progress.total, 4)

        let groups = p.todayGroups(all, sort: .manual)
        XCTAssertEqual(groups.map(\.id), ["overdue", "today", "done"])
        XCTAssertEqual(p.widgetOrder(all).first?.title, "Overdue")

        let upcoming = p.upcomingGroups(all, sort: .manual)
        XCTAssertEqual(upcoming.map(\.title).first, "Tomorrow")
    }

    func testDayTitlesAndGreeting() {
        let p = Planner(now: at(2026, 11, 13, 8), calendar: cal)
        XCTAssertEqual(p.dayTitle(p.today), "Today")
        XCTAssertEqual(p.dayTitle(p.today.adding(days: 1, calendar: cal)), "Tomorrow")
        XCTAssertEqual(p.dayTitle(p.today.adding(days: 2, calendar: cal)), "Sunday")
        XCTAssertEqual(p.greeting(name: "Axel"), "Good morning, Axel")
        XCTAssertEqual(Planner(now: at(2026, 11, 13, 20), calendar: cal).greeting(name: nil), "Good evening")
        XCTAssertEqual(DayDate(p.nextMidnight, calendar: cal), DayDate(year: 2026, month: 11, day: 14))
    }

    func testSearchIgnoresCaseAndAccentsAndFindsChecklist() {
        var data = DaybookData()
        data.addTask(TaskItem(title: "Email teacher about essay"))
        var old = TaskItem(title: "Café booking")
        old.isCompleted = true
        old.isArchived = true
        data.addTask(old)
        data.addNote(Note(title: "Packing", checklist: [ChecklistItem(text: "Sailing gloves")]))
        let p = Planner(calendar: cal)
        XCTAssertEqual(p.search("EMAIL essay", in: data).tasks.count, 1)
        XCTAssertEqual(p.search("cafe", in: data).tasks.count, 1, "archived tasks are searchable")
        XCTAssertEqual(p.search("gloves", in: data).notes.count, 1)
        XCTAssertTrue(p.search("   ", in: data).tasks.isEmpty)
    }

    func testSortByPriority() {
        let p = Planner(calendar: cal)
        let low = TaskItem(title: "low", priority: .low)
        let high = TaskItem(title: "high", priority: .high)
        let star = TaskItem(title: "star", isImportant: true)
        XCTAssertEqual(p.sorted([low, high, star], by: .priority).map(\.title), ["star", "high", "low"])
    }
}

final class QuickEntryTests: XCTestCase {
    let cal = sydney()
    lazy var now = at(2026, 11, 13, 14) // Friday 2pm

    func testPlainTitlesAreUntouched() {
        for title in ["Finish legal studies notes", "Pack running shoes", "Email teacher",
                      "Buy birthday present", "Remember to bring sailing equipment", "Read today's article",
                      "Finish chapter 2"] {
            let e = QuickEntry.parse(title, now: now, calendar: cal)!
            XCTAssertEqual(e.title, title)
            XCTAssertNil(e.day)
            XCTAssertNil(e.reminder)
            XCTAssertFalse(e.isImportant)
        }
        XCTAssertNil(QuickEntry.parse("   ", now: now, calendar: cal))
    }

    func testDaysTimesAndImportance() {
        let e = QuickEntry.parse("Email teacher tomorrow 3pm !", now: now, calendar: cal)!
        XCTAssertEqual(e.title, "Email teacher")
        XCTAssertTrue(e.isImportant)
        XCTAssertEqual(e.day, DayDate(year: 2026, month: 11, day: 14))
        XCTAssertEqual(e.reminder, at(2026, 11, 14, 15))

        let f = QuickEntry.parse("Training on monday at 6:30am", now: now, calendar: cal)!
        XCTAssertEqual(f.title, "Training")
        XCTAssertEqual(f.reminder, at(2026, 11, 16, 6, 30))

        let g = QuickEntry.parse("Call mum 9am", now: now, calendar: cal)!
        XCTAssertEqual(g.reminder, at(2026, 11, 14, 9), "a time already passed today means tomorrow")

        let h = QuickEntry.parse("Revise tonight", now: now, calendar: cal)!
        XCTAssertEqual(h.reminder, at(2026, 11, 13, 19))

        let i = QuickEntry.parse("Gym at 17:15", now: now, calendar: cal)!
        XCTAssertEqual(i.reminder, at(2026, 11, 13, 17, 15))

        let j = QuickEntry.parse("Essay due friday", now: now, calendar: cal)!
        XCTAssertEqual(j.day, DayDate(year: 2026, month: 11, day: 13), "today's weekday means today")

        let k = QuickEntry.parse("Plan trip next week", now: now, calendar: cal)!
        XCTAssertEqual(k.day, DayDate(year: 2026, month: 11, day: 16))

        let only = QuickEntry.parse("tomorrow", now: now, calendar: cal)!
        XCTAssertEqual(only.title, "tomorrow")
        XCTAssertNil(only.day)
    }
}

final class SnoozeTests: XCTestCase {
    let cal = sydney()

    func testFixedSnoozes() {
        let now = at(2026, 11, 13, 10)
        XCTAssertEqual(SnoozeOption.fiveMinutes.date(from: now, calendar: cal), now.addingTimeInterval(300))
        XCTAssertEqual(SnoozeOption.fifteenMinutes.date(from: now, calendar: cal), now.addingTimeInterval(900))
        XCTAssertEqual(SnoozeOption.oneHour.date(from: now, calendar: cal), now.addingTimeInterval(3600))
    }

    func testLaterToday() {
        XCTAssertEqual(SnoozeOption.laterToday.date(from: at(2026, 11, 13, 10), calendar: cal), at(2026, 11, 13, 18))
        XCTAssertEqual(SnoozeOption.laterToday.date(from: at(2026, 11, 13, 16, 5), calendar: cal), at(2026, 11, 13, 19, 15))
        XCTAssertEqual(SnoozeOption.laterToday.date(from: at(2026, 11, 13, 21), calendar: cal), at(2026, 11, 13, 23))
        XCTAssertEqual(SnoozeOption.laterToday.date(from: at(2026, 11, 13, 22, 30), calendar: cal), at(2026, 11, 13, 23, 30))
    }
}

final class StoreTests: XCTestCase {
    var folder: URL!

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("daybook-tests-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    func testPersistsAcrossInstances() throws {
        // Two store objects stand in for the app and the widget (or the app before and after a restart).
        let app = try DaybookStore(directory: folder)
        let task = TaskItem(title: "Pack running shoes", dueDay: DayDate(year: 2026, month: 11, day: 13),
                            reminder: Date(timeIntervalSince1970: 1_794_000_000.25))
        try app.mutate { $0.addTask(task) }
        try app.mutate { $0.addNote(Note(title: "Ideas", body: "…")) }

        let widget = try DaybookStore(directory: folder)
        let seen = try widget.load()
        XCTAssertEqual(seen.tasks.count, 1)
        XCTAssertEqual(seen.tasks[0].reminder, task.reminder, "dates survive exactly")
        try widget.mutate { $0.toggleCompletion(task.id) }

        let reopened = try DaybookStore(directory: folder).load()
        XCTAssertTrue(reopened.task(task.id)!.isCompleted)
        XCTAssertEqual(reopened.notes.count, 1)
    }

    func testConcurrentWritersDontLoseChanges() throws {
        let store = try DaybookStore(directory: folder)
        let group = DispatchGroup()
        for i in 0..<40 {
            group.enter()
            DispatchQueue.global().async {
                // Each writer uses its own store object, as separate processes would.
                let s = try! DaybookStore(directory: self.folder)
                try! s.mutate { $0.addTask(TaskItem(title: "Task \(i)")) }
                group.leave()
            }
        }
        group.wait()
        XCTAssertEqual(try store.load().tasks.count, 40)
    }

    func testCorruptFileFallsBackToBackupAndIsKept() throws {
        let store = try DaybookStore(directory: folder)
        try store.mutate { $0.addTask(TaskItem(title: "First")) }
        try store.mutate { $0.addTask(TaskItem(title: "Second")) }
        try Data("{ not json".utf8).write(to: store.fileURL)

        let recovered = try store.load()
        XCTAssertEqual(recovered.tasks.map(\.title), ["First"], "backup holds the version before the last save")
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.path)
        XCTAssertTrue(names.contains { $0.hasPrefix("daybook.unreadable-") }, "damaged file kept")
    }

    func testUnreadableWithoutBackupRefusesToOverwrite() throws {
        let store = try DaybookStore(directory: folder)
        try Data("garbage".utf8).write(to: store.fileURL)
        XCTAssertThrowsError(try store.mutate { $0.addTask(TaskItem(title: "New")) })
        XCTAssertEqual(try String(contentsOf: store.fileURL, encoding: .utf8), "garbage")
    }

    func testOldOrPartialDataStillReads() throws {
        let store = try DaybookStore(directory: folder)
        let id = UUID()
        let json = """
        {"tasks":[{"id":"\(id.uuidString)","title":"Old task","priority":9,"futureField":true},
                  {"title":"no id, skipped"},
                  {"id":"\(id.uuidString)","title":"Duplicate, older","modifiedAt":1}],
         "notes":[]}
        """
        try Data(json.utf8).write(to: store.fileURL)
        let data = try store.load()
        XCTAssertEqual(data.tasks.count, 1)
        XCTAssertEqual(data.tasks[0].title, "Duplicate, older", "newest modifiedAt wins for a duplicated id")
        XCTAssertEqual(data.tasks[0].priority, Priority.none)
    }
}
