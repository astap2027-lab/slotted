// swift-tools-version:5.9
// The app's core logic (data, dates, lists, quick entry, storage) as a package,
// so it can be tested with `swift test` without Xcode. The Xcode project compiles
// the same files directly into the app and the widget.
import PackageDescription

let package = Package(
    name: "DaybookCore",
    platforms: [.macOS(.v14)],
    products: [.library(name: "DaybookCore", targets: ["DaybookCore"])],
    targets: [
        .target(name: "DaybookCore", path: "Shared/Core"),
        .testTarget(name: "DaybookCoreTests", dependencies: ["DaybookCore"], path: "Tests/DaybookCoreTests"),
    ]
)
