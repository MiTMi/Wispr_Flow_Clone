// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "WisprWhisper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "whisper-cli",
            targets: ["WisprWhisper"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/argmaxinc/WhisperKit.git", from: "0.7.0")
    ],
    targets: [
        .executableTarget(
            name: "WisprWhisper",
            dependencies: ["WhisperKit"]
        ),
    ]
)
