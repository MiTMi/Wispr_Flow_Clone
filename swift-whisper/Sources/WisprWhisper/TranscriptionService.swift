import Foundation
import WhisperKit
import AVFoundation

@available(macOS 13, *)
public class TranscriptionService {
    private var whisperKit: WhisperKit?
    private var modelName: String?

    public init() {}

    /// Initialize WhisperKit with specified model
    public func initialize(modelName: String = "openai/whisper-base") async throws {
        fputs("[WhisperKit] Initializing with model: \(modelName)\n", stderr)
        self.modelName = modelName

        // Initialize WhisperKit with the model
        // Performance optimizations:
        // - verbose: false (reduce overhead from logging)
        // - logLevel: .error (only show errors, not debug info)
        // - prewarm: true (warm up CoreML for faster first inference)
        whisperKit = try await WhisperKit(
            model: modelName,
            verbose: false,
            logLevel: .error,
            prewarm: true
        )

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
