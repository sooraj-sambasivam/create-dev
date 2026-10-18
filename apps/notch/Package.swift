// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "CreateTray",
    platforms: [.macOS(.v14)],
    dependencies: [
        // Pinned to an exact released tag (MIT).
        .package(url: "https://github.com/MrKai77/DynamicNotchKit", exact: "1.1.0")
    ],
    targets: [
        .executableTarget(
            name: "CreateTray",
            dependencies: [.product(name: "DynamicNotchKit", package: "DynamicNotchKit")],
            path: "Sources/CreateTray",
            linkerSettings: [
                // Embeds LSUIElement + usage strings so even the bare binary is a menu-bar agent.
                .unsafeFlags(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", "Resources/Info.plist"])
            ]
        )
    ]
)
