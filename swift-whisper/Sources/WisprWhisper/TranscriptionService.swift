import Foundation
import WhisperKit
import AVFoundation

@available(macOS 13, *)
public class TranscriptionService {
    private var whisperKit: WhisperKit?
    private var modelName: String?

    public init() {}

    /// Initialize WhisperKit with specified model and progress callback
    public func initialize(modelName: String = "openai/whisper-base", progressCallback: ((Double) -> Void)? = nil) async throws {
        fputs("[WhisperKit] Initializing with model: \(modelName)\n", stderr)
        self.modelName = modelName

        // If progress callback provided, track progress updates
        if let callback = progressCallback {
            // Report initial progress
            callback(0.0)

            // Use an actor to safely share state between tasks
            actor ProgressTracker {
                var isComplete = false

                func markComplete() {
                    isComplete = true
                }

                func checkComplete() -> Bool {
                    return isComplete
                }
            }

            let tracker = ProgressTracker()

            // Start progress polling task
            let progressTask = Task {
                var lastProgress = 0.0
                while await !tracker.checkComplete() {
                    try? await Task.sleep(nanoseconds: 200_000_000) // 200ms

                    // Simulate progress (since WhisperKit doesn't expose real download progress)
                    lastProgress = min(lastProgress + 0.05, 0.95)
                    callback(lastProgress)
                }
            }

            // Initialize WhisperKit
            whisperKit = try await WhisperKit(
                model: modelName,
                verbose: false,
                logLevel: .error,
                prewarm: true
            )

            // Mark complete and wait for progress task to finish
            await tracker.markComplete()
            await progressTask.value

            // Report 100% complete
            callback(1.0)
        } else {
            // No progress tracking - just initialize
            whisperKit = try await WhisperKit(
                model: modelName,
                verbose: false,
                logLevel: .error,
                prewarm: true
            )
        }

        fputs("[WhisperKit] Initialized successfully\n", stderr)
    }

    /// Transcribe audio file
    public func transcribe(audioFilePath: String, language: String? = nil) async throws -> String {
        guard let whisperKit = whisperKit else {
            throw NSError(
                domain: "TranscriptionService",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "WhisperKit not initialized"]
            )
        }

        fputs("[WhisperKit] Transcribing audio file: \(audioFilePath)\n", stderr)

        // Check if file exists
        guard FileManager.default.fileExists(atPath: audioFilePath) else {
            throw NSError(
                domain: "TranscriptionService",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Audio file not found: \(audioFilePath)"]
            )
        }

        // Transcribe with optimized settings for speed
        // Performance optimizations:
        // - temperatureFallbackCount: 1 (reduce temperature retries for faster processing)
        // - skipSpecialTokens: true (faster decoding)
        let options = DecodingOptions(
            language: language,
            temperatureFallbackCount: 1,
            skipSpecialTokens: true
        )
        let result = try await whisperKit.transcribe(
            audioPath: audioFilePath,
            decodeOptions: options
        )

        // Extract text from result - result is array of TranscriptionResult
        guard !result.isEmpty else {
            throw NSError(
                domain: "TranscriptionService",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "No transcription result"]
            )
        }

        // Combine all segments from all results
        var transcription = ""
        for transcriptionResult in result {
            for segment in transcriptionResult.segments {
                transcription += segment.text + " "
            }
        }

        transcription = transcription.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)

        fputs("[WhisperKit] Transcription complete: \(transcription)\n", stderr)
        return transcription
    }

    /// List available models
    public static func listAvailableModels() -> [String] {
        return [
            "tiny",
            "tiny.en",
            "base",
            "base.en",
            "small",
            "small.en",
            "medium",
            "medium.en",
            "large-v3"
        ]
    }

    /// Get model size information
    public static func getModelInfo(modelName: String) -> [String: Any] {
        let modelSizes: [String: Int] = [
            "tiny": 40,
            "tiny.en": 40,
            "base": 80,
            "base.en": 80,
            "small": 250,
            "small.en": 250,
            "medium": 800,
            "medium.en": 800,
            "large-v3": 1500
        ]

        return [
            "name": modelName,
            "sizeMB": modelSizes[modelName] ?? 0,
            "multilingual": !modelName.hasSuffix(".en")
        ]
    }
}
