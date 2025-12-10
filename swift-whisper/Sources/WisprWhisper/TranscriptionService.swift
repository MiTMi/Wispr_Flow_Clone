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
        print("[WhisperKit] Initializing with model: \(modelName)")
        self.modelName = modelName

        // Initialize WhisperKit with the model
        whisperKit = try await WhisperKit(
            model: modelName,
            verbose: true,
            logLevel: .debug
        )

        print("[WhisperKit] Initialized successfully")
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

        print("[WhisperKit] Transcribing audio file: \(audioFilePath)")

        // Check if file exists
        guard FileManager.default.fileExists(atPath: audioFilePath) else {
            throw NSError(
                domain: "TranscriptionService",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Audio file not found: \(audioFilePath)"]
            )
        }

        // Transcribe with language setting
        let options = DecodingOptions(language: language)
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

        print("[WhisperKit] Transcription complete: \(transcription)")
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
