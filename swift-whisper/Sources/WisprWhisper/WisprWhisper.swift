import Foundation

@available(macOS 13, *)
@main
struct WhisperCLI {
    static func main() async {
        let args = CommandLine.arguments

        // Usage: whisper-cli <command> [args]
        guard args.count >= 2 else {
            printError("Usage: whisper-cli <command> [args]\nCommands:\n  transcribe <audio-file> <model-name> [language]\n  list-models\n  daemon <model-name> (persistent mode)")
            exit(1)
        }

        let command = args[1]

        do {
            switch command {
            case "transcribe":
                try await handleTranscribe(args: Array(args.dropFirst(2)))

            case "list-models":
                handleListModels()

            case "daemon":
                try await handleDaemon(args: Array(args.dropFirst(2)))

            default:
                printError("Unknown command: \(command)")
                exit(1)
            }
        } catch {
            printError("Error: \(error.localizedDescription)")
            exit(1)
        }
    }

    static func handleTranscribe(args: [String]) async throws {
        guard args.count >= 2 else {
            printError("Usage: whisper-cli transcribe <audio-file> <model-name> [language]")
            exit(1)
        }

        let audioFile = args[0]
        let modelName = args[1]
        let language = args.count > 2 ? args[2] : nil

        // Validate audio file exists
        guard FileManager.default.fileExists(atPath: audioFile) else {
            throw NSError(
                domain: "WhisperCLI",
                code: 404,
                userInfo: [NSLocalizedDescriptionKey: "Audio file not found: \(audioFile)"]
            )
        }

        let service = TranscriptionService()

        // Initialize with model
        print("[WhisperCLI] Initializing model: \(modelName)", to: &standardError)
        try await service.initialize(modelName: modelName)

        // Transcribe
        print("[WhisperCLI] Transcribing...", to: &standardError)
        let transcription = try await service.transcribe(
            audioFilePath: audioFile,
            language: language
        )

        // Output JSON result to stdout
        let result: [String: Any] = [
            "success": true,
            "transcription": transcription,
            "model": modelName,
            "audioFile": audioFile
        ]

        printJSON(result)
    }

    static func handleListModels() {
        let models = TranscriptionService.listAvailableModels()
        let result: [String: Any] = [
            "success": true,
            "models": models
        ]
        printJSON(result)
    }

    static func handleDaemon(args: [String]) async throws {
        guard args.count >= 1 else {
            printError("Usage: whisper-cli daemon <model-name>")
            exit(1)
        }

        let modelName = args[0]

        // Initialize once and keep loaded
        print("[WhisperDaemon] Starting daemon mode with model: \(modelName)", to: &standardError)

        // Print loading message for UI (simpler approach - no real-time progress)
        printJSON(["status": "loading", "model": modelName])

        let service = TranscriptionService()
        try await service.initialize(modelName: modelName)

        print("[WhisperDaemon] Model loaded and ready. Waiting for transcription requests...", to: &standardError)

        // Print ready signal to stdout
        printJSON(["status": "ready", "model": modelName])

        // Read from stdin line by line
        while let line = readLine() {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)

            if trimmed == "quit" {
                print("[WhisperDaemon] Received quit command, exiting...", to: &standardError)
                break
            }

            // Parse JSON request: {"audioFile": "path", "language": "en"}
            guard let data = trimmed.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                  let audioFile = json["audioFile"] else {
                printError("Invalid request format. Expected JSON: {\"audioFile\": \"path\", \"language\": \"en\"}")
                continue
            }

            let language = json["language"]

            do {
                let transcription = try await service.transcribe(
                    audioFilePath: audioFile,
                    language: language
                )

                let result: [String: Any] = [
                    "success": true,
                    "transcription": transcription,
                    "audioFile": audioFile
                ]
                printJSON(result)
            } catch {
                let errorResult: [String: Any] = [
                    "success": false,
                    "error": error.localizedDescription
                ]
                printJSON(errorResult)
            }
        }

        print("[WhisperDaemon] Daemon stopped", to: &standardError)
    }

    // MARK: - Helper Functions

    static func printJSON(_ object: [String: Any]) {
        do {
            // Use compact JSON (no pretty printing) for easier parsing
            let jsonData = try JSONSerialization.data(withJSONObject: object, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
                fflush(stdout) // Ensure immediate output
            }
        } catch {
            printError("Failed to encode JSON: \(error)")
            exit(1)
        }
    }

    static func printError(_ message: String) {
        print("ERROR: \(message)", to: &standardError)
        let errorResult: [String: Any] = [
            "success": false,
            "error": message
        ]
        if let jsonData = try? JSONSerialization.data(withJSONObject: errorResult),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
    }
}

// Extension to print to stderr
extension FileHandle: @retroactive TextOutputStream {
    public func write(_ string: String) {
        if let data = string.data(using: .utf8) {
            self.write(data)
        }
    }
}

var standardError = FileHandle.standardError
