import Foundation

/// The App Group shared by the app and the widget.
///
/// The identifier is "<your Team ID>.daybook". It is filled in at build time from
/// `Config/Signing.xcconfig` into both Info.plist files (key `DaybookAppGroup`) and
/// both entitlements files, so the code never hard-codes a team.
enum AppGroup {
    static var identifier: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "DaybookAppGroup") as? String,
              !value.isEmpty, !value.contains("$("), !value.hasPrefix(".") else { return nil }
        return value
    }

    /// `~/Library/Group Containers/<group>/Library/Application Support/Daybook`
    static var dataDirectory: URL? {
        guard let identifier,
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
        else { return nil }
        return container
            .appendingPathComponent("Library", isDirectory: true)
            .appendingPathComponent("Application Support", isDirectory: true)
            .appendingPathComponent("Daybook", isDirectory: true)
    }

    /// Settings both processes read (greeting name, widget options).
    static var defaults: UserDefaults {
        if let identifier, let shared = UserDefaults(suiteName: identifier) { return shared }
        return .standard
    }

    static func makeStore() throws -> DaybookStore {
        guard let directory = dataDirectory else {
            throw StoreError.folderUnavailable(
                "The App Group isn't set up. Set your Team ID in Config/Signing.xcconfig and build again.")
        }
        return try DaybookStore(directory: directory)
    }
}

/// Keys for settings kept in `AppGroup.defaults`.
enum SharedKey {
    static let userName = "userName"
    static let widgetShowsCompleted = "widgetShowsCompleted"
    static let widgetShowsNote = "widgetShowsNote"
}

/// Links the widget opens in the app.
enum DaybookLink {
    static let scheme = "daybook"
    static var today: URL { URL(string: "daybook://today")! }
    static var quickAdd: URL { URL(string: "daybook://quickadd")! }
    static func task(_ id: UUID) -> URL { URL(string: "daybook://task/\(id.uuidString)")! }
    static func note(_ id: UUID) -> URL { URL(string: "daybook://note/\(id.uuidString)")! }
}
