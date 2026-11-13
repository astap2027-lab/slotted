import SwiftUI

struct ContentView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        @Bindable var model = model
        let palette = Palette(scheme)

        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 280)
        } detail: {
            Group {
                if !model.searchText.trimmingCharacters(in: .whitespaces).isEmpty {
                    SearchResultsView()
                } else if model.selection == .notes {
                    NotesView()
                } else {
                    TaskListView(section: model.selection)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.paper)
        }
        .searchable(text: $model.searchText, placement: .sidebar, prompt: "Search tasks and notes")
        .inspector(isPresented: inspectorShown) {
            if let id = model.selectedTaskID {
                TaskEditorView(taskID: id)
                    .inspectorColumnWidth(min: 270, ideal: 310, max: 420)
            }
        }
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                Text(toast)
                    .font(.callout.weight(.medium))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.regularMaterial, in: Capsule())
                    .overlay(Capsule().strokeBorder(palette.hairline))
                    .padding(.bottom, 18)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .sheet(isPresented: $model.showOnboarding) {
            OnboardingView()
                .environment(model)
        }
        .alert("Something went wrong", isPresented: errorShown) {
            Button("OK") { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
        .onOpenURL { url in model.open(url) }
        .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
        .frame(minWidth: 760, minHeight: 480)
    }

    private var inspectorShown: Binding<Bool> {
        Binding(
            get: { model.selection != .notes && model.task(model.selectedTaskID) != nil },
            set: { shown in if !shown { model.selectedTaskID = nil } })
    }

    private var errorShown: Binding<Bool> {
        Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })
    }
}

struct SidebarView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette(scheme)
        let progress = model.progress

        List(selection: selection) {
            Section {
                ForEach(SidebarItem.allCases) { item in
                    Label(item.title, systemImage: item.icon)
                        .badge(model.count(for: item))
                        .tag(item)
                }
            } header: {
                HStack(spacing: 10) {
                    ProgressRing(done: progress.done, total: progress.total, size: 30, lineWidth: 3)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(model.planner.greeting(name: AppGroup.defaults.string(forKey: SharedKey.userName)))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(palette.ink)
                            .lineLimit(1)
                        Text(progress.total == 0 ? DaybookFormat.shortDate(model.now)
                             : "\(progress.done) of \(progress.total) done today")
                            .font(.system(size: 11))
                            .foregroundStyle(palette.muted)
                    }
                }
                .padding(.vertical, 8)
                .textCase(nil)
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .bottom) {
            if model.notificationsBlocked {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Notifications are off", systemImage: "bell.slash")
                        .font(.caption.weight(.semibold))
                    Text("Reminders can't alert you until notifications are allowed for Daybook.")
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Open Notification Settings") { model.openNotificationSettings() }
                        .controlSize(.small)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(palette.card))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(palette.hairline))
                .padding(10)
            }
        }
    }

    private var selection: Binding<SidebarItem?> {
        Binding(get: { model.selection }, set: { item in
            if let item {
                model.searchText = ""
                model.selection = item
            }
        })
    }
}
