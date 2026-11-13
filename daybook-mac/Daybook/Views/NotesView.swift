import AppKit
import SwiftUI

/// The notes list beside the selected note.
struct NotesView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        @Bindable var model = model
        let palette = Palette(scheme)
        let notes = model.sortedNotes

        HSplitView {
            VStack(spacing: 0) {
                if notes.isEmpty {
                    ContentUnavailableView {
                        Label("No notes yet", systemImage: "note.text")
                    } description: {
                        Text("Write longer things to remember, with checklists. Press ⇧⌘N.")
                    } actions: {
                        Button("New Note") { model.newNote() }
                    }
                } else {
                    List(selection: $model.selectedNoteID) {
                        ForEach(notes) { note in
                            NoteRow(note: note).tag(note.id)
                                .contextMenu {
                                    Button(note.isPinned ? "Unpin from Widget" : "Pin to Widget") {
                                        model.editNote(note.id) { $0.isPinned.toggle() }
                                    }
                                    Divider()
                                    Button("Delete", role: .destructive) { confirmDelete(note) }
                                }
                        }
                    }
                    .listStyle(.inset)
                    .scrollContentBackground(.hidden)
                    .onDeleteCommand {
                        if let note = model.note(model.selectedNoteID) { confirmDelete(note) }
                    }
                }
            }
            .frame(minWidth: 220, idealWidth: 260, maxWidth: 340)
            .background(palette.paper)

            Group {
                if let id = model.selectedNoteID, model.note(id) != nil {
                    NoteEditorView(noteID: id)
                        .id(id)
                } else {
                    ContentUnavailableView("Select a note", systemImage: "note.text",
                                           description: Text(notes.isEmpty ? "" : "Or press ⇧⌘N to start a new one."))
                }
            }
            .frame(minWidth: 360, maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.paper)
        }
        .navigationTitle("Notes")
        .toolbar {
            ToolbarItem {
                Button { model.newNote() } label: { Label("New Note", systemImage: "square.and.pencil") }
                    .help("New note (⇧⌘N)")
            }
        }
        .onAppear {
            if model.selectedNoteID == nil { model.selectedNoteID = notes.first?.id }
        }
    }

    private func confirmDelete(_ note: Note) {
        let alert = NSAlert()
        alert.messageText = "Delete “\(note.displayTitle)”?"
        alert.informativeText = "This can't be undone."
        alert.addButton(withTitle: "Delete")
        alert.addButton(withTitle: "Cancel")
        alert.buttons.first?.hasDestructiveAction = true
        if alert.runModal() == .alertFirstButtonReturn { model.deleteNote(note.id) }
    }
}

struct NoteRow: View {
    let note: Note
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        let progress = note.checklistProgress
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                if note.isPinned {
                    Image(systemName: "pin.fill").font(.system(size: 9)).foregroundStyle(palette.muted)
                }
                Text(note.displayTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
            }
            HStack(spacing: 6) {
                Text(note.modifiedAt.formatted(.relative(presentation: .named)))
                if progress.total > 0 {
                    Text("\(progress.done)/\(progress.total) ticked")
                }
                if !note.preview.isEmpty {
                    Text(note.preview).lineLimit(1)
                }
            }
            .font(.system(size: 11))
            .foregroundStyle(palette.muted)
        }
        .padding(.vertical, 4)
    }
}

struct NoteEditorView: View {
    let noteID: UUID
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @State private var newItem = ""
    @FocusState private var newItemFocused: Bool

    private var note: Note { model.note(noteID) ?? Note(id: noteID) }

    var body: some View {
        let palette = Palette(scheme)
        let note = self.note
        let progress = note.checklistProgress

        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                TextField("Title", text: bind(\.title), axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(palette.ink)

                Text("Edited " + note.modifiedAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: 11))
                    .foregroundStyle(palette.muted)

                TextEditor(text: bind(\.body))
                    .font(.system(size: 14))
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 160)
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(palette.card))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(palette.hairline))

                HStack {
                    Text("Checklist")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(palette.ink)
                    if progress.total > 0 {
                        Text("\(progress.done) of \(progress.total)")
                            .font(.system(size: 12))
                            .foregroundStyle(palette.muted)
                        ProgressBar(done: progress.done, total: progress.total, height: 3)
                            .frame(width: 60)
                    }
                    Spacer()
                    if progress.done > 0 {
                        Button("Remove Ticked") {
                            model.editNote(noteID) { $0.checklist.removeAll(where: \.isDone) }
                        }
                        .controlSize(.small)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(note.checklist.enumerated()), id: \.element.id) { index, item in
                        ChecklistRow(noteID: noteID, item: item, index: index, count: note.checklist.count)
                    }
                    HStack(spacing: 10) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(palette.muted)
                            .frame(width: 16)
                        TextField("Add an item and press Return", text: $newItem)
                            .textFieldStyle(.plain)
                            .font(.system(size: 13))
                            .focused($newItemFocused)
                            .onSubmit(addItem)
                    }
                    .padding(.top, 2)
                }
            }
            .padding(24)
            .frame(maxWidth: 720, alignment: .leading)
        }
        .toolbar {
            ToolbarItemGroup {
                Toggle(isOn: bind(\.isPinned)) {
                    Label("Pin to Widget", systemImage: note.isPinned ? "pin.fill" : "pin")
                }
                .help("Pinned notes show on the desktop widget")
            }
        }
    }

    private func bind<V>(_ path: WritableKeyPath<Note, V>) -> Binding<V> {
        Binding(get: { note[keyPath: path] },
                set: { value in model.editNote(noteID) { $0[keyPath: path] = value } })
    }

    private func addItem() {
        let text = newItem.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        model.editNote(noteID) { $0.checklist.append(ChecklistItem(text: text)) }
        newItem = ""
        newItemFocused = true
    }
}

struct ChecklistRow: View {
    let noteID: UUID
    let item: ChecklistItem
    let index: Int
    let count: Int
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @State private var hovering = false

    var body: some View {
        let palette = Palette(scheme)
        HStack(spacing: 10) {
            Button {
                withAnimation { update { $0.isDone.toggle() } }
            } label: {
                CheckCircle(isDone: item.isDone, size: 16)
            }
            .buttonStyle(.plain)

            TextField("Item", text: Binding(get: { item.text }, set: { text in update { $0.text = text } }))
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .strikethrough(item.isDone, color: palette.muted)
                .foregroundStyle(item.isDone ? palette.muted : palette.ink)

            Button {
                model.editNote(noteID) { note in note.checklist.removeAll { $0.id == item.id } }
            } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(palette.muted)
            }
            .buttonStyle(.plain)
            .opacity(hovering ? 1 : 0)
            .help("Remove item")
        }
        .onHover { hovering = $0 }
        .contextMenu {
            Button("Make a Task for Today") { model.makeTask(fromChecklistItem: item) }
            Divider()
            Button("Move Up") { move(by: -1) }.disabled(index == 0)
            Button("Move Down") { move(by: 1) }.disabled(index >= count - 1)
            Divider()
            Button("Remove", role: .destructive) {
                model.editNote(noteID) { note in note.checklist.removeAll { $0.id == item.id } }
            }
        }
    }

    private func update(_ change: (inout ChecklistItem) -> Void) {
        model.editNote(noteID) { note in
            if let i = note.checklist.firstIndex(where: { $0.id == item.id }) { change(&note.checklist[i]) }
        }
    }

    private func move(by offset: Int) {
        model.editNote(noteID) { note in
            guard let i = note.checklist.firstIndex(where: { $0.id == item.id }) else { return }
            let j = i + offset
            guard note.checklist.indices.contains(j) else { return }
            note.checklist.swapAt(i, j)
        }
    }
}
