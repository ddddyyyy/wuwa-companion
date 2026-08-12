// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "WuWaCompanion",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "WuWaCompanion", targets: ["WuWaCompanion"])
    ],
    targets: [
        .target(name: "WuWaCore"),
        .executableTarget(name: "WuWaCompanion", dependencies: ["WuWaCore"]),
        .testTarget(name: "WuWaCoreTests", dependencies: ["WuWaCore"])
    ]
)

