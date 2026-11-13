# Daybook

A native macOS notes and reminders app with a real desktop widget. Type a task, tick it off from the desktop, and get reminded.

- **Swift + SwiftUI** app, **WidgetKit** extension (Small, Medium, Large), **App Intents** for the widget's checkboxes, **UserNotifications** for reminders.
- macOS 14 Sonoma or later (interactive desktop widgets need 14). Built with Xcode 16 or later.
- No third-party dependencies. Everything stays on your Mac.

## Set it up (about 5 minutes)

1. Install **Xcode 16+** from the Mac App Store and open it once.
2. Sign in: Xcode → Settings → Accounts → **+** → Apple ID. A free Apple ID is fine.
3. Get the code:
   ```bash
   git clone https://github.com/astap2027-lab/slotted.git
   ```
   ```bash
   cd slotted && git checkout claude/wizardly-newton-8fmz3f && cd daybook-mac
   ```
4. Open `Config/Signing.xcconfig` and set two values:
   - `DAYBOOK_TEAM`: your Team ID. In Xcode → Settings → Accounts, select your account; the team ID is shown next to the team (or under Membership at developer.apple.com/account).
   - `DAYBOOK_BUNDLE_PREFIX`: anything unique, like `com.yourname`.
5. Open `Daybook.xcodeproj`. Pick the **Daybook** scheme and **My Mac**, then press **⌘R**.
6. To keep it permanently: Product → Archive → Distribute App → Custom → Copy App, then drag `Daybook.app` into **Applications** and open it from there. (Widgets show up most reliably for apps in Applications.)

If Xcode asks to "register" the bundle ID or App Group, let it. Automatic signing handles both.

## Put the widget on your desktop

macOS doesn't let apps place widgets themselves, so you do this once:

1. Open Daybook at least once.
2. Right-click an empty part of the desktop → **Edit Widgets…**
3. Search **Daybook**, pick Small, Medium or Large, and drag it onto the desktop. Click **Done**.

You can also add it from Notification Centre (click the date in the menu bar → Edit Widgets).

## Using it

- **Quick entry:** type and press Return. It understands words at the end:
  - `Email teacher tomorrow 3pm`: tomorrow, with a 3pm reminder
  - `Pack kit friday` · `Plan trip next week` · `Revise tonight` (7pm)
  - `Call mum 9am`: the next 9am
  - Start or end with `!` to mark it important
  - Anything else stays exactly as typed ("Read today's article" is just a title).
- **Lists:** Today (due today, overdue, and important tasks with no date), Upcoming (grouped by day), Inbox (no date), Notes, Completed (restore any task, archive or delete).
- **Editing:** click a task to open the editor on the right: description, important, priority, day, reminder, repeat (daily, weekly, monthly, yearly or every N days/weeks/months/years). Right-click for quick actions. Drag to reorder (when sorted Manually). Press Delete to remove the selected task.
- **Notes:** longer writing with checklists. Pin a note to show it on the widget; its checklist can be ticked from the widget too. Right-click a checklist item to turn it into a task.
- **Search:** the sidebar search finds tasks (including completed and archived ones) and notes.
- **Menu bar:** the checklist icon shows today's tasks with a quick-add box.

### Keyboard shortcuts

| | |
|---|---|
| ⌃⌥Space (from any app) | Open Daybook's quick entry |
| ⌘N / ⇧⌘N | New task / new note |
| ⌘1 – ⌘5 | Today, Upcoming, Inbox, Notes, Completed |
| ⌘↩ | Mark selected task done |
| ⇧⌘I | Mark selected task important |
| ⌥⌘T / ⇧⌥⌘T | Move selected task to today / tomorrow |
| ⇧⌘K | Archive completed tasks |
| ⌘, | Settings |

Shortcuts, Spotlight and Siri get an **Add Task** action too.

### Settings

Name for the greeting · Open at login · Menu bar icon · Global shortcut on/off · Notification status, test notification · Light/dark/system · What the widget shows · Data location, Show in Finder, Export Backup.

## How it fits together

```
┌──────────── Daybook.app ────────────┐        ┌──── DaybookWidget.appex ────┐
│ SwiftUI window, menu bar, settings   │        │ Small / Medium / Large       │
│ AppModel ── change ──┐               │        │ Checkbox = Button(intent:)   │
│ Notification actions ┤               │        │   ToggleTaskIntent ──┐       │
└──────────────────────┼───────────────┘        └──────────────────────┼───────┘
                       ▼                                               ▼
        ┌─────── App Group container (<TeamID>.daybook) ───────────────────┐
        │ daybook.json  (+ daybook.backup.json)                            │
        │ read → change → write, under a file lock; atomic writes          │
        └──────────────────────────────────────────────────────────────────┘
                       │
   after each change:  ├─ ReminderScheduler.sync → macOS notification queue
                       └─ WidgetCenter.reloadAllTimelines → widget redraws
```

- **One source of truth.** All tasks and notes live in one JSON file in the shared App Group folder. The app and the widget both read and write it through `DaybookStore`, which locks the file, reads the latest copy, applies the change and writes it atomically. A tick from the widget and a typed edit can't overwrite each other.
- **Never losing data.** Each save first keeps the previous good file as `daybook.backup.json`. If the main file can't be read, Daybook uses the backup, keeps the damaged file as `daybook.unreadable-….json`, and won't save over it. Items are decoded one by one, so one damaged entry can't hide the rest, and duplicate ids are merged.
- **Widget ticks.** The checkbox is `Button(intent: ToggleTaskIntent)`. It runs inside the widget extension, so the app doesn't need to be open. It saves the change, updates the task's reminder, and the widget redraws. If the app is running, it notices the file change within a moment.
- **Reminders.** `ReminderScheduler.sync` compares what should be scheduled with what macOS has queued and fixes the difference. Each task has one notification id (`daybook.task.<id>`), so editing a reminder replaces it and duplicates can't happen. Completing or deleting a task cancels its reminder and clears it from Notification Centre. macOS delivers scheduled notifications even when Daybook is closed.
- **Notification buttons.** Mark as Done, Snooze 5 Minutes, Snooze 15 Minutes, Snooze 1 Hour, Later Today (6pm if it's before 4pm, otherwise about 3 hours later). Hover a notification and click **Options** to see them.
- **Dates and time zones.** A task's day is stored as a plain calendar date (`2026-11-13`), so "Friday" stays Friday if your time zone changes. A reminder is an exact moment.
- **Repeating tasks.** Ticking one off saves a done copy (it counts toward today's progress and shows in Completed) and moves the task to its next day after today, keeping the reminder's time.

### Code layout

| Folder | What's in it |
|---|---|
| `Shared/Core/` | Plain Swift used by app, widget and tests: models, list rules (`Planner`), every change (`Operations`), quick-entry reading, snooze times, `DaybookStore` |
| `Shared/Apple/` | App Group access, `ReminderScheduler`, widget intents, colours and shared views |
| `Daybook/` | The app: `AppModel`, window, views, menu bar, settings, shortcut, login item |
| `DaybookWidget/` | The widget: timeline and the three sizes |
| `Config/` | `Signing.xcconfig` (your Team ID), Info.plists, entitlements |
| `Tests/` | Tests for `Shared/Core` |

## Tests

The core logic has 25 tests (dates across time zones and daylight saving, repeats, lists, progress, search, quick entry, snooze, saving, two writers at once, damaged files, old data).

```bash
swift test
```

Run it from `daybook-mac/`. It works on a Mac with Xcode, or on Linux with Swift installed.

### Things to check on your Mac

These need a real Mac, so they weren't run when this was built:

1. Add "Pack running shoes", quit Daybook (⌘Q), reopen: it's still there.
2. Add the widget, tick a task on it: it's struck through and the ring moves. Open the app: it's done there too.
3. Add `Test reminder` with a reminder 2 minutes away, then quit Daybook. The notification still arrives. Use Options → Snooze 5 Minutes: it comes back 5 minutes later.
4. Set a reminder, then tick the task off before it's due: no notification comes.
5. Change a reminder's time three times: only one notification arrives.
6. Settings → Notifications → Send a Test Notification.

## Limits and what was done instead

- **Placing the widget:** macOS only lets you add widgets yourself (steps above).
- **Notification buttons:** macOS shows them under **Options** on the banner. Pressing one may start Daybook in the background for a moment to save the change.
- **Ticking from the widget while the app is closed:** the reminder is cancelled from the widget straight away. If macOS doesn't allow that from the widget, it's cancelled the next time Daybook runs. With "Open at login" on, Daybook is normally running.
- **Global shortcut:** fixed at ⌃⌥Space (can be turned off in Settings). It works while Daybook is running, which is why closing the window leaves the app running in the menu bar. Quit from the menu bar icon or ⌘Q.
- **Repeats:** the next reminder is scheduled when you tick the current one off, like Apple Reminders.
- **Sync:** local only for now, as asked. The data file is plain JSON, so iCloud sync can be added later without changing the format.
