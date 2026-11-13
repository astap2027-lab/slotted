import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

enum StoreError: LocalizedError {
    case unreadable(String)
    case lockFailed
    case folderUnavailable(String)

    var errorDescription: String? {
        switch self {
        case .unreadable(let detail):
            return "Daybook couldn't read its saved data, so it won't overwrite it. A copy was kept next to it. (\(detail))"
        case .lockFailed:
            return "Daybook couldn't lock its data file. Try again."
        case .folderUnavailable(let detail):
            return "Daybook couldn't open its data folder. (\(detail))"
        }
    }
}

/// Saves everything to one JSON file in the shared App Group folder.
///
/// - The app and the widget both read and write it.
/// - Every change is read-modify-write under a file lock, so a tick from the widget
///   and an edit in the app can't overwrite each other.
/// - Writes are atomic (the new file replaces the old one in one step) and the previous
///   good version is kept as a backup. A file that can't be read is never overwritten.
final class DaybookStore: @unchecked Sendable {
    let directory: URL
    var fileURL: URL { directory.appendingPathComponent("daybook.json") }
    var backupURL: URL { directory.appendingPathComponent("daybook.backup.json") }
    private var lockURL: URL { directory.appendingPathComponent(".daybook.lock") }

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        // Exact seconds, so reading back gives identical values.
        e.dateEncodingStrategy = .secondsSince1970
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .secondsSince1970
        return d
    }()

    init(directory: URL) throws {
        self.directory = directory
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            throw StoreError.folderUnavailable(error.localizedDescription)
        }
    }

    /// Reads the latest saved data.
    func load() throws -> DaybookData {
        try withLock { try readUnlocked() }
    }

    /// Reads the latest data, applies `change`, and saves, all while holding the lock.
    @discardableResult
    func mutate<T>(_ change: (inout DaybookData) throws -> T) throws -> (result: T, data: DaybookData) {
        try withLock {
            var data = try readUnlocked()
            let before = data
            let result = try change(&data)
            if data != before {
                try writeUnlocked(data)
            }
            return (result, data)
        }
    }

    /// Writes `data` as a JSON file anywhere (used by "Export Backup").
    func export(_ data: DaybookData, to url: URL) throws {
        try encoder.encode(data).write(to: url, options: .atomic)
    }

    /// Reads a JSON file in Daybook's format.
    func decodeFile(at url: URL) throws -> DaybookData {
        try decoder.decode(DaybookData.self, from: Data(contentsOf: url))
    }

    // MARK: - Private

    private func readUnlocked() throws -> DaybookData {
        let fm = FileManager.default
        guard fm.fileExists(atPath: fileURL.path) else {
            // First run, or the main file went missing: use the backup if there is one.
            if fm.fileExists(atPath: backupURL.path), let backup = try? decodeFile(at: backupURL) {
                return backup
            }
            return DaybookData()
        }
        do {
            let bytes = try Data(contentsOf: fileURL)
            return try decoder.decode(DaybookData.self, from: bytes)
        } catch {
            // Keep the damaged file for recovery, then try the backup.
            let stamp = Int(Date().timeIntervalSince1970)
            let keep = directory.appendingPathComponent("daybook.unreadable-\(stamp).json")
            if !fm.fileExists(atPath: keep.path) { try? fm.copyItem(at: fileURL, to: keep) }
            if let backup = try? decodeFile(at: backupURL) {
                return backup
            }
            throw StoreError.unreadable(error.localizedDescription)
        }
    }

    private func writeUnlocked(_ data: DaybookData) throws {
        let fm = FileManager.default
        let bytes = try encoder.encode(data)
        if fm.fileExists(atPath: fileURL.path),
           let current = try? Data(contentsOf: fileURL),
           (try? decoder.decode(DaybookData.self, from: current)) != nil {
            // The current file is good: keep it as the backup before replacing it.
            try? current.write(to: backupURL, options: .atomic)
        }
        try bytes.write(to: fileURL, options: .atomic)
    }

    private func withLock<T>(_ body: () throws -> T) throws -> T {
        let fd = open(lockURL.path, O_CREAT | O_RDWR, 0o644)
        guard fd >= 0 else { throw StoreError.lockFailed }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw StoreError.lockFailed }
        defer { flock(fd, LOCK_UN) }
        return try body()
    }
}
