# WhisperKit Implementation Guide

## Detailed Technical Explanation: Implementing On-Device Transcription with WhisperKit

---

## Table of Contents
1. [What is WhisperKit?](#what-is-whisperkit)
2. [Technical Architecture](#technical-architecture)
3. [Requirements](#requirements)
4. [Step-by-Step Implementation](#step-by-step-implementation)
5. [Model Selection & Management](#model-selection--management)
6. [Performance Considerations](#performance-considerations)
7. [Code Examples](#code-examples)
8. [Integration with Your App](#integration-with-your-app)
9. [Testing & Optimization](#testing--optimization)
10. [Deployment Considerations](#deployment-considerations)

---

## What is WhisperKit?

### Overview
**WhisperKit** is Apple's optimized implementation of OpenAI's Whisper speech recognition models, designed to run efficiently on Apple Silicon (M1/M2/M3/M4) chips using CoreML.

### Key Features:
- **On-device processing**: Audio never leaves the device
- **CoreML optimized**: Takes advantage of Apple's Neural Engine
- **Multiple model sizes**: Tiny, Base, Small, Medium, Large variants
- **Multi-language support**: 99+ languages like cloud Whisper
- **Offline capable**: Works without internet connection
- **Privacy-first**: Zero data transmission to external servers

### GitHub Repository:
https://github.com/argmaxinc/WhisperKit

---

## Technical Architecture

### How WhisperKit Works:

```
Audio Input (WebM/WAV)
        ↓
Audio Preprocessing
(Convert to 16kHz mono PCM)
        ↓
WhisperKit CoreML Model
(Runs on Neural Engine + GPU)
        ↓
Transcription Output (Text)
```

### Components Required:

1. **WhisperKit Swift Package**
   - Swift library for Whisper inference
   - Handles model loading and audio processing
   - Provides async API for transcription

2. **CoreML Models**
   - Whisper models converted to CoreML format
   - Stored locally or downloaded on-demand
   - Sizes: 40MB (tiny) to 1.5GB (large-v3)

3. **Audio Processing Pipeline**
   - Convert WebM to compatible format
   - Resample to 16kHz mono
   - Feed to WhisperKit

4. **Swift-to-Electron Bridge**
   - Native Node.js addon or Swift IPC
   - Communicate between Electron and Swift code
   - Pass audio buffers and receive text

---

## Requirements

### Hardware Requirements:

✅ **Minimum**:
- Apple Silicon Mac (M1, M1 Pro, M1 Max, M1 Ultra)
- 8GB RAM (for tiny/base models)
- 2GB free disk space

✅ **Recommended**:
- M2/M3/M4 chip (better Neural Engine performance)
- 16GB+ RAM (for medium/large models)
- 5GB free disk space

❌ **Not Supported**:
- Intel Macs (no Neural Engine, would be too slow)
- Older Apple Silicon (A-series chips in iPads could work but not tested)

### Software Requirements:

- **macOS**: 13.0 (Ventura) or later
- **Xcode**: 15.0+ (for Swift toolchain)
- **Swift**: 5.9+
- **Node.js**: 18+ (your current setup)
- **Electron**: 28+ (your current version)

### Development Tools:

- **Xcode Command Line Tools**: For compiling Swift
- **CocoaPods or Swift Package Manager**: For dependency management
- **node-gyp**: For building native addons (if using C++ bridge)

---

## Step-by-Step Implementation

### Phase 1: Add WhisperKit Dependency

#### Option A: Swift Package (Recommended)

1. **Create a Swift package in your project**:

```bash
cd /path/to/wispr-flow-clone
mkdir swift-whisper
cd swift-whisper
swift package init --type library
```

2. **Edit `Package.swift`**:

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WisprWhisper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "WisprWhisper",
            targets: ["WisprWhisper"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/argmaxinc/WhisperKit.git", from: "0.7.0")
    ],
    targets: [
        .target(
            name: "WisprWhisper",
            dependencies: ["WhisperKit"]
        ),
    ]
)
```

3. **Build the package**:

```bash
swift build -c release
```

---

### Phase 2: Create Swift Bridge Module

#### Create `Sources/WisprWhisper/TranscriptionService.swift`:

```swift
import Foundation
import WhisperKit
import AVFoundation

@available(macOS 13, *)
public class TranscriptionService {
    private var whisperKit: WhisperKit?
    private var modelPath: String?

    public init() {}

    // Initialize WhisperKit with specified model
    public func initialize(modelName: String = "openai_whisper-base") async throws {
        print("[WhisperKit] Initializing with model: \(modelName)")

        // Check if model exists locally, otherwise download
        let modelPath = try await downloadModelIfNeeded(modelName: modelName)

        // Initialize WhisperKit
        whisperKit = try await WhisperKit(
            modelFolder: modelPath,
            computeOptions: .init(
                audioEncoderCompute: .cpuAndNeuralEngine,
                textDecoderCompute: .cpuAndNeuralEngine
            ),
            verbose: true
        )

        print("[WhisperKit] Initialized successfully")
    }

    // Transcribe audio file
    public func transcribe(audioFilePath: String, language: String? = nil) async throws -> String {
        guard let whisperKit = whisperKit else {
            throw NSError(domain: "TranscriptionService", code: 1,
                         userInfo: [NSLocalizedDescriptionKey: "WhisperKit not initialized"])
        }

        print("[WhisperKit] Transcribing audio file: \(audioFilePath)")

        // Load audio file
        let audioBuffer = try loadAudioFile(at: audioFilePath)

        // Transcribe
        let result = try await whisperKit.transcribe(
            audioArray: audioBuffer,
            language: language
        )

        // Extract text from segments
        let transcription = result.segments
            .map { $0.text }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        print("[WhisperKit] Transcription complete: \(transcription)")
        return transcription
    }

    // Download model if not present
    private func downloadModelIfNeeded(modelName: String) async throws -> String {
        let modelDir = getModelDirectory()
        let modelPath = modelDir.appendingPathComponent(modelName)

        // Check if model already exists
        if FileManager.default.fileExists(atPath: modelPath.path) {
            print("[WhisperKit] Model already exists at: \(modelPath.path)")
            return modelPath.path
        }

        // Download model
        print("[WhisperKit] Downloading model: \(modelName)")
        try FileManager.default.createDirectory(at: modelDir, withIntermediateDirectories: true)

        // WhisperKit will download automatically when initialized
        // Models are downloaded from HuggingFace
        return modelPath.path
    }

    // Get model storage directory
    private func getModelDirectory() -> URL {
        let appSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first!

        return appSupport
            .appendingPathComponent("wispr-flow-clone")
            .appendingPathComponent("whisper-models")
    }

    // Load audio file and convert to required format
    private func loadAudioFile(at path: String) throws -> [Float] {
        let url = URL(fileURLWithPath: path)
        let file = try AVAudioFile(forReading: url)

        let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 16000, // Whisper requires 16kHz
            channels: 1,       // Mono
            interleaved: false
        )!

        let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: AVAudioFrameCount(file.length)
        )!

        try file.read(into: buffer)

        // Convert to array of floats
        let floatArray = Array(UnsafeBufferPointer(
            start: buffer.floatChannelData?[0],
            count: Int(buffer.frameLength)
        ))

        return floatArray
    }

    // List available models
    public func listAvailableModels() -> [String] {
        return [
            "openai_whisper-tiny",        // ~40MB, fastest
            "openai_whisper-tiny.en",     // English only
            "openai_whisper-base",        // ~80MB, good balance
            "openai_whisper-base.en",     // English only
            "openai_whisper-small",       // ~250MB, better accuracy
            "openai_whisper-small.en",    // English only
            "openai_whisper-medium",      // ~800MB, high accuracy
            "openai_whisper-medium.en",   // English only
            "openai_whisper-large-v3"     // ~1.5GB, best accuracy
        ]
    }

    // Get model size info
    public func getModelInfo(modelName: String) -> [String: Any] {
        let modelSizes: [String: Int] = [
            "openai_whisper-tiny": 40,
            "openai_whisper-tiny.en": 40,
            "openai_whisper-base": 80,
            "openai_whisper-base.en": 80,
            "openai_whisper-small": 250,
            "openai_whisper-small.en": 250,
            "openai_whisper-medium": 800,
            "openai_whisper-medium.en": 800,
            "openai_whisper-large-v3": 1500
        ]

        return [
            "name": modelName,
            "sizeMB": modelSizes[modelName] ?? 0,
            "multilingual": !modelName.hasSuffix(".en")
        ]
    }
}
```

---

### Phase 3: Create IPC Bridge (Electron ↔ Swift)

You have **two options** for bridging:

#### Option A: Command-Line Bridge (Simpler)

Create a Swift executable that Electron spawns as a child process.

**Create `Sources/WisprWhisper/main.swift`**:

```swift
import Foundation

@available(macOS 13, *)
@main
struct WhisperCLI {
    static func main() async {
        let args = CommandLine.arguments

        guard args.count >= 3 else {
            print("Usage: whisper-cli <audio-file> <model-name> [language]")
            exit(1)
        }

        let audioFile = args[1]
        let modelName = args[2]
        let language = args.count > 3 ? args[3] : nil

        do {
            let service = TranscriptionService()
            try await service.initialize(modelName: modelName)
            let transcription = try await service.transcribe(
                audioFilePath: audioFile,
                language: language
            )

            // Output JSON result
            let result = ["transcription": transcription, "success": true] as [String : Any]
            let jsonData = try JSONSerialization.data(withJSONObject: result)
            let jsonString = String(data: jsonData, encoding: .utf8)!
            print(jsonString)

        } catch {
            let errorResult = ["error": error.localizedDescription, "success": false]
            let jsonData = try! JSONSerialization.data(withJSONObject: errorResult)
            let jsonString = String(data: jsonData, encoding: .utf8)!
            print(jsonString)
            exit(1)
        }
    }
}
```

**Build executable**:

```bash
swift build -c release
# Executable will be at: .build/release/WisprWhisper
```

**Use from Electron**:

```typescript
// src/main/whisper-local.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export async function transcribeLocal(
  audioFilePath: string,
  modelName: string = 'openai_whisper-base',
  language?: string
): Promise<string> {
  const whisperBinary = path.join(
    process.resourcesPath,
    'whisper-cli'
  )

  const args = [audioFilePath, modelName]
  if (language) args.push(language)

  const command = `"${whisperBinary}" ${args.map(a => `"${a}"`).join(' ')}`

  try {
    const { stdout } = await execAsync(command, { timeout: 60000 })
    const result = JSON.parse(stdout)

    if (result.success) {
      return result.transcription
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('[WhisperLocal] Transcription failed:', error)
    throw error
  }
}
```

---

#### Option B: Native Node.js Addon (More Complex, Better Performance)

Use `node-gyp` to create a native addon that calls Swift code directly.

**Create `binding.gyp`**:

```json
{
  "targets": [
    {
      "target_name": "whisper_addon",
      "sources": ["src/native/whisper_addon.mm"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "13.0"
      },
      "link_settings": {
        "libraries": [
          "-framework Foundation",
          "-framework AVFoundation",
          "$(PROJECT_DIR)/swift-whisper/.build/release/libWisprWhisper.a"
        ]
      }
    }
  ]
}
```

**Create `src/native/whisper_addon.mm`** (Objective-C++ bridge):

```objc
#include <napi.h>
#import <Foundation/Foundation.h>

// Forward declare Swift function
extern "C" const char* transcribeAudioFile(const char* audioPath, const char* modelName, const char* language);

Napi::String TranscribeMethod(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2-3 arguments").ThrowAsJavaScriptException();
        return Napi::String::New(env, "");
    }

    std::string audioPath = info[0].As<Napi::String>().Utf8Value();
    std::string modelName = info[1].As<Napi::String>().Utf8Value();
    std::string language = info.Length() > 2 ? info[2].As<Napi::String>().Utf8Value() : "";

    const char* result = transcribeAudioFile(
        audioPath.c_str(),
        modelName.c_str(),
        language.empty() ? nullptr : language.c_str()
    );

    return Napi::String::New(env, result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "transcribe"),
                Napi::Function::New(env, TranscribeMethod));
    return exports;
}

NODE_API_MODULE(whisper_addon, Init)
```

**Build**:

```bash
npm install node-gyp node-addon-api
npx node-gyp configure build
```

**Use from Electron**:

```typescript
// src/main/whisper-local.ts
import whisperAddon from '../../build/Release/whisper_addon.node'

export async function transcribeLocal(
  audioFilePath: string,
  modelName: string = 'openai_whisper-base',
  language?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const result = whisperAddon.transcribe(audioFilePath, modelName, language)
      resolve(result)
    } catch (error) {
      reject(error)
    }
  })
}
```

---

### Phase 4: Integrate with Your App

**Update `src/main/openai.ts`** to support dual-mode transcription:

```typescript
import { transcribeLocal } from './whisper-local'

export interface TranscriptionMode {
  mode: 'cloud' | 'local'
  localModel?: string // e.g., 'openai_whisper-base'
}

export async function processAudio(
  buffer: ArrayBuffer,
  settings: Settings & { transcriptionMode?: TranscriptionMode }
): Promise<string> {
  try {
    // 1. Write buffer to temp file
    const tempFilePath = path.join(os.tmpdir(), `wispr_recording_${Date.now()}.webm`)
    fs.writeFileSync(tempFilePath, Buffer.from(buffer))

    let rawText: string

    // 2. Transcribe based on mode
    if (settings.transcriptionMode?.mode === 'local') {
      console.time('Local Transcription (WhisperKit)')

      rawText = await transcribeLocal(
        tempFilePath,
        settings.transcriptionMode.localModel || 'openai_whisper-base',
        settings.language === 'auto' ? undefined : settings.language
      )

      console.timeEnd('Local Transcription (WhisperKit)')
    } else {
      // Cloud mode (existing Groq API)
      console.time('Cloud Transcription (Groq)')

      const transcription = await getOpenAI().audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-large-v3-turbo',
        language: settings.language === 'auto' ? undefined : settings.language
      })
      rawText = transcription.text.trim()

      console.timeEnd('Cloud Transcription (Groq)')
    }

    console.log('Raw Transcription:', rawText)

    // 3. Securely delete temp file
    secureDelete(tempFilePath)

    // 4. Continue with formatting...
    // (rest of your existing code)

    return formattedText
  } catch (error) {
    console.error('[Transcription] Error:', error)
    throw error
  }
}
```

---

### Phase 5: Add UI Controls

**Update `src/renderer/src/components/SettingsView.tsx`**:

```typescript
const [transcriptionMode, setTranscriptionMode] = useState<'cloud' | 'local'>('cloud')
const [localModel, setLocalModel] = useState<string>('openai_whisper-base')

// In your settings UI:
<section className="space-y-6">
  <h2>Transcription Settings</h2>

  <div className="space-y-4">
    <label>
      <input
        type="radio"
        value="cloud"
        checked={transcriptionMode === 'cloud'}
        onChange={(e) => setTranscriptionMode('cloud')}
      />
      Cloud Mode (Groq API) - Faster, requires internet
    </label>

    <label>
      <input
        type="radio"
        value="local"
        checked={transcriptionMode === 'local'}
        onChange={(e) => setTranscriptionMode('local')}
      />
      On-Device Mode (WhisperKit) - Private, works offline
    </label>
  </div>

  {transcriptionMode === 'local' && (
    <div>
      <label>Model Size:</label>
      <select
        value={localModel}
        onChange={(e) => setLocalModel(e.target.value)}
      >
        <option value="openai_whisper-tiny">Tiny (40MB) - Fastest</option>
        <option value="openai_whisper-base">Base (80MB) - Balanced</option>
        <option value="openai_whisper-small">Small (250MB) - Better accuracy</option>
        <option value="openai_whisper-medium">Medium (800MB) - High accuracy</option>
      </select>
    </div>
  )}
</section>
```

---

## Model Selection & Management

### Available Models:

| Model | Size | Speed | Accuracy | Languages | Use Case |
|-------|------|-------|----------|-----------|----------|
| tiny | 40MB | Very Fast | Fair | 99+ | Quick notes, low-end hardware |
| tiny.en | 40MB | Very Fast | Fair | English only | English-only users |
| base | 80MB | Fast | Good | 99+ | **Recommended default** |
| base.en | 80MB | Fast | Good | English only | English-only users |
| small | 250MB | Medium | Better | 99+ | Higher accuracy needs |
| medium | 800MB | Slow | High | 99+ | Professional use |
| large-v3 | 1.5GB | Very Slow | Highest | 99+ | Maximum accuracy |

### Model Download Strategy:

**Option 1: Bundle with app** (Recommended for base model)
- Include `base` model in app bundle
- App works immediately after installation
- Larger initial download (adds ~80MB to app size)

**Option 2: Download on-demand**
- First launch prompts user to download model
- Shows progress bar during download
- Smaller initial app size

**Option 3: Hybrid**
- Bundle `tiny` model (40MB) for immediate use
- Let users download larger models if desired
- Best user experience

### Implementation:

```typescript
// src/main/model-manager.ts
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'

export class ModelManager {
  private modelDir: string

  constructor() {
    this.modelDir = path.join(
      app.getPath('userData'),
      'whisper-models'
    )

    if (!fs.existsSync(this.modelDir)) {
      fs.mkdirSync(this.modelDir, { recursive: true })
    }
  }

  async downloadModel(
    modelName: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const modelUrl = `https://huggingface.co/argmaxinc/whisperkit-coreml/resolve/main/${modelName}`
    const modelPath = path.join(this.modelDir, modelName)

    // Check if already exists
    if (fs.existsSync(modelPath)) {
      console.log('[ModelManager] Model already exists:', modelName)
      return
    }

    console.log('[ModelManager] Downloading model:', modelName)

    return new Promise((resolve, reject) => {
      https.get(modelUrl, (response) => {
        const totalSize = parseInt(response.headers['content-length'] || '0', 10)
        let downloadedSize = 0

        const fileStream = fs.createWriteStream(modelPath)

        response.on('data', (chunk) => {
          downloadedSize += chunk.length
          if (onProgress && totalSize > 0) {
            onProgress((downloadedSize / totalSize) * 100)
          }
        })

        response.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close()
          console.log('[ModelManager] Model downloaded successfully')
          resolve()
        })

        fileStream.on('error', reject)
      }).on('error', reject)
    })
  }

  listInstalledModels(): string[] {
    if (!fs.existsSync(this.modelDir)) {
      return []
    }

    return fs.readdirSync(this.modelDir)
  }

  deleteModel(modelName: string): void {
    const modelPath = path.join(this.modelDir, modelName)
    if (fs.existsSync(modelPath)) {
      fs.rmSync(modelPath, { recursive: true })
      console.log('[ModelManager] Deleted model:', modelName)
    }
  }
}
```

---

## Performance Considerations

### Expected Performance:

| Hardware | Model | Real-time Factor | 10s Audio |
|----------|-------|------------------|-----------|
| M1 | tiny | 0.1x | ~1 second |
| M1 | base | 0.15x | ~1.5 seconds |
| M1 | small | 0.3x | ~3 seconds |
| M2 | tiny | 0.08x | ~0.8 seconds |
| M2 | base | 0.12x | ~1.2 seconds |
| M2 | small | 0.25x | ~2.5 seconds |
| M3 | tiny | 0.06x | ~0.6 seconds |
| M3 | base | 0.10x | ~1 second |
| M3 | small | 0.20x | ~2 seconds |

**Real-time factor**: 0.1x means 10 seconds of audio transcribes in 1 second.

### Optimization Tips:

1. **Use smaller models for real-time**:
   - `tiny` or `base` for interactive use
   - `small`+ for batch processing

2. **Preload models**:
   - Initialize WhisperKit on app launch
   - Keep instance in memory (don't recreate each time)

3. **Audio preprocessing**:
   - Convert to 16kHz mono BEFORE sending to WhisperKit
   - Use ffmpeg for efficient conversion

4. **Multi-threading**:
   - WhisperKit already uses Neural Engine efficiently
   - Don't block main thread during transcription

5. **Memory management**:
   - Large models use more RAM
   - Monitor memory usage with large batches

---

## Code Examples

### Complete Integration Example:

```typescript
// src/main/transcription-service.ts

import { transcribeLocal } from './whisper-local'
import { getOpenAI } from './openai'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

export interface TranscriptionOptions {
  mode: 'cloud' | 'local'
  localModel?: string
  language?: string
}

export class TranscriptionService {
  async transcribe(
    audioBuffer: ArrayBuffer,
    options: TranscriptionOptions
  ): Promise<string> {
    // 1. Write to temp file
    const tempPath = path.join(
      os.tmpdir(),
      `wispr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.webm`
    )
    fs.writeFileSync(tempPath, Buffer.from(audioBuffer))

    try {
      let transcription: string

      // 2. Transcribe based on mode
      if (options.mode === 'local') {
        console.log('[Transcription] Using local WhisperKit')
        transcription = await transcribeLocal(
          tempPath,
          options.localModel || 'openai_whisper-base',
          options.language
        )
      } else {
        console.log('[Transcription] Using cloud API (Groq)')
        const result = await getOpenAI().audio.transcriptions.create({
          file: fs.createReadStream(tempPath),
          model: 'whisper-large-v3-turbo',
          language: options.language
        })
        transcription = result.text
      }

      return transcription.trim()

    } finally {
      // 3. Always clean up temp file
      this.secureDelete(tempPath)
    }
  }

  private secureDelete(filePath: string): void {
    try {
      const stats = fs.statSync(filePath)
      const randomData = crypto.randomBytes(stats.size)
      fs.writeFileSync(filePath, randomData)
      fs.unlinkSync(filePath)
    } catch (error) {
      console.error('[Transcription] Failed to delete temp file:', error)
    }
  }
}
```

---

## Testing & Optimization

### Testing Checklist:

- [ ] Test with different model sizes
- [ ] Test with various audio lengths (5s, 30s, 2min, 5min)
- [ ] Test in different languages
- [ ] Test offline functionality (disconnect internet)
- [ ] Test on different Mac hardware (M1, M2, M3)
- [ ] Test memory usage with large models
- [ ] Test concurrent transcriptions
- [ ] Compare accuracy: cloud vs local
- [ ] Measure performance benchmarks
- [ ] Test error handling (invalid audio, missing models)

### Performance Benchmarks:

```typescript
// src/main/__tests__/transcription-benchmark.ts

async function benchmarkTranscription() {
  const service = new TranscriptionService()
  const testAudio = fs.readFileSync('./test-audio-10s.webm')

  // Benchmark cloud
  console.time('Cloud (Groq)')
  await service.transcribe(testAudio.buffer, { mode: 'cloud' })
  console.timeEnd('Cloud (Groq)')

  // Benchmark local - tiny
  console.time('Local (tiny)')
  await service.transcribe(testAudio.buffer, {
    mode: 'local',
    localModel: 'openai_whisper-tiny'
  })
  console.timeEnd('Local (tiny)')

  // Benchmark local - base
  console.time('Local (base)')
  await service.transcribe(testAudio.buffer, {
    mode: 'local',
    localModel: 'openai_whisper-base'
  })
  console.timeEnd('Local (base)')
}
```

---

## Deployment Considerations

### App Bundle Structure:

```
wispr-flow-clone.app/
├── Contents/
│   ├── MacOS/
│   │   ├── wispr-flow-clone (main Electron app)
│   │   └── whisper-cli (Swift executable)
│   ├── Resources/
│   │   ├── app.asar (Electron code)
│   │   └── whisper-models/
│   │       └── openai_whisper-base/ (bundled model)
│   └── Frameworks/
│       └── (Electron frameworks)
```

### electron-builder Configuration:

Update `electron-builder.yml` or `package.json`:

```json
{
  "build": {
    "mac": {
      "extraResources": [
        {
          "from": "swift-whisper/.build/release/whisper-cli",
          "to": "whisper-cli"
        },
        {
          "from": "models/openai_whisper-base",
          "to": "whisper-models/openai_whisper-base"
        }
      ]
    }
  }
}
```

### Code Signing:

WhisperKit models and Swift binaries need to be signed:

```bash
# Sign Swift executable
codesign --force --deep --sign "Developer ID Application: Your Name" \
  ./dist/mac/wispr-flow-clone.app/Contents/MacOS/whisper-cli

# Sign the app
codesign --force --deep --sign "Developer ID Application: Your Name" \
  ./dist/mac/wispr-flow-clone.app
```

---

## Summary: What You Need to Do

### Minimum Implementation (Command-Line Bridge):

1. **Create Swift package** with WhisperKit dependency
2. **Write Swift transcription service** (TranscriptionService.swift)
3. **Create CLI executable** (main.swift)
4. **Build Swift binary** (`swift build -c release`)
5. **Add TypeScript wrapper** to spawn CLI process (whisper-local.ts)
6. **Update processAudio()** to support dual-mode
7. **Add UI toggle** in Settings for cloud vs local
8. **Bundle Swift binary** with electron-builder
9. **Test on real hardware** (M1+ Mac)

### Estimated Time:
- **Initial implementation**: 1 week
- **Testing and optimization**: 3-5 days
- **UI polish and model management**: 2-3 days
- **Total**: ~2 weeks

### Estimated App Size Increase:
- Swift binary: ~5MB
- WhisperKit framework: ~10MB
- Base model (bundled): ~80MB
- **Total**: ~95MB additional

### User Experience:
- **First launch**: Works immediately with bundled model
- **Settings**: Toggle between Cloud (fast) and On-Device (private)
- **Model management**: Download additional models if desired
- **Offline mode**: Works without internet when using local

---

## Next Steps

1. **Prototype** with command-line bridge (easiest path)
2. **Test performance** on your M-series Mac
3. **Compare quality** between Groq and WhisperKit
4. **Get user feedback** on speed vs privacy tradeoff
5. **Optimize** based on real-world usage

---

## Resources

- **WhisperKit GitHub**: https://github.com/argmaxinc/WhisperKit
- **WhisperKit Documentation**: https://argmaxinc.github.io/WhisperKit/
- **CoreML Documentation**: https://developer.apple.com/documentation/coreml
- **Swift Package Manager**: https://swift.org/package-manager/
- **Electron Native Addons**: https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules

---

**Document Version**: 1.0
**Last Updated**: 2025-12-10
**Author**: WhisperKit Implementation Guide
