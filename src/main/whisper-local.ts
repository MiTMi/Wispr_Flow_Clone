import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import readline from 'readline'

const execAsync = promisify(exec)

// Persistent daemon process
let daemonProcess: ChildProcess | null = null
let daemonReady = false
let currentModel: string | null = null
let pendingRequests: Map<string, {
  resolve: (value: string) => void
  reject: (reason: any) => void
}> = new Map()

/**
 * Get path to the whisper-cli executable
 * In development: use the binary from swift-whisper/.build/release/
 * In production: use the bundled binary from app resources
 */
function getWhisperCLIPath(): string {
  if (app.isPackaged) {
    // Production: bundled with app
    return path.join(process.resourcesPath, 'whisper-cli')
  } else {
    // Development: use the built binary
    const devPath = path.join(process.cwd(), 'swift-whisper', '.build', 'arm64-apple-macosx', 'release', 'whisper-cli')

    if (!fs.existsSync(devPath)) {
      throw new Error(
        `WhisperCLI binary not found at ${devPath}. Please build it first:\n  cd swift-whisper && swift build -c release`
      )
    }

    return devPath
  }
}

export interface LocalTranscriptionOptions {
  modelName?: string
  language?: string
}

export interface TranscriptionResult {
  success: boolean
  transcription?: string
  model?: string
  audioFile?: string
  error?: string
  status?: string
  progress?: number
  downloadedBytes?: number
  totalBytes?: number
}

/**
 * Start the WhisperKit daemon process with a specific model
 * This keeps the model loaded in memory for fast subsequent transcriptions
 */
async function startDaemon(modelName: string): Promise<void> {
  if (daemonProcess && currentModel === modelName && daemonReady) {
    console.log(`[WhisperDaemon] Already running with model: ${modelName}`)
    return
  }

  // Stop existing daemon if different model
  if (daemonProcess && currentModel !== modelName) {
    console.log(`[WhisperDaemon] Switching from ${currentModel} to ${modelName}`)
    stopDaemon()
  }

  console.log(`[WhisperDaemon] Starting daemon with model: ${modelName}`)
  const whisperBinary = getWhisperCLIPath()

  daemonProcess = spawn(whisperBinary, ['daemon', modelName])
  currentModel = modelName
  daemonReady = false

  // Handle stdout (JSON responses)
  let jsonBuffer = ''
  let braceCount = 0

  daemonProcess.stdout?.on('data', (data) => {
    const chunk = data.toString()

    for (const char of chunk) {
      jsonBuffer += char

      if (char === '{') {
        braceCount++
      } else if (char === '}') {
        braceCount--

        // Complete JSON object received
        if (braceCount === 0 && jsonBuffer.trim().length > 0) {
          try {
            const result: TranscriptionResult = JSON.parse(jsonBuffer.trim())
            jsonBuffer = '' // Reset buffer

            console.log('[WhisperDaemon] Received:', JSON.stringify(result))

            if (result.status === 'loading' || result.status === 'downloading') {
              // Model is loading/downloading - emit to renderer
              const progressPercent = Math.round((result.progress || 0) * 100)
              console.log(`[WhisperDaemon] Loading model: ${result.model} (${progressPercent}%)`)

              // Emit loading event to renderer
              const mainWindow = (global as any).getMainWindow?.()
              if (mainWindow) {
                mainWindow.webContents.send('model-download-progress', {
                  model: result.model,
                  progress: result.progress || 0,
                  isLoading: true
                })
              }
            } else if (result.status === 'ready') {
              // Model loaded - emit completion to renderer
              const mainWindow = (global as any).getMainWindow?.()
              if (mainWindow) {
                mainWindow.webContents.send('model-download-progress', {
                  model: result.model,
                  progress: 1, // Complete
                  isLoading: false
                })
              }
              console.log('[WhisperDaemon] Model loaded and ready!')
              daemonReady = true
            } else if (result.audioFile && pendingRequests.has(result.audioFile)) {
              const request = pendingRequests.get(result.audioFile)!
              pendingRequests.delete(result.audioFile)

              if (result.success && result.transcription) {
                request.resolve(result.transcription)
              } else {
                request.reject(new Error(result.error || 'Transcription failed'))
              }
            }
          } catch (e) {
            console.error('[WhisperDaemon] JSON parse error:', e)
            jsonBuffer = '' // Reset on error
            braceCount = 0
          }
        }
      }
    }
  })

  // Handle stderr (logs)
  daemonProcess.stderr?.on('data', (data) => {
    console.log('[WhisperDaemon]', data.toString().trim())
  })

  // Handle process exit
  daemonProcess.on('exit', (code) => {
    console.log(`[WhisperDaemon] Process exited with code ${code}`)
    daemonProcess = null
    daemonReady = false
    currentModel = null

    // Reject all pending requests
    for (const [audioFile, request] of pendingRequests) {
      request.reject(new Error('Daemon process exited unexpectedly'))
    }
    pendingRequests.clear()
  })

  // Wait for ready signal
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Daemon startup timeout'))
    }, 30000)

    const checkReady = setInterval(() => {
      if (daemonReady) {
        clearTimeout(timeout)
        clearInterval(checkReady)
        resolve()
      }
    }, 100)
  })
}

/**
 * Stop the WhisperKit daemon process
 */
function stopDaemon(): void {
  if (daemonProcess) {
    console.log('[WhisperDaemon] Stopping daemon...')
    daemonProcess.stdin?.write('quit\n')
    daemonProcess.kill()
    daemonProcess = null
    daemonReady = false
    currentModel = null
  }
}

// Cleanup on app quit
app.on('will-quit', () => {
  stopDaemon()
})

/**
 * Transcribe audio file using local WhisperKit (with persistent daemon for speed)
 */
export async function transcribeLocal(
  audioFilePath: string,
  options: LocalTranscriptionOptions = {}
): Promise<string> {
  const {
    modelName = 'base',
    language
  } = options

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('[WhisperLocal] 🎯 STARTING LOCAL TRANSCRIPTION')
  console.log('[WhisperLocal] Model:', modelName)
  console.log('[WhisperLocal] Language:', language || 'auto-detect')
  console.log('[WhisperLocal] Audio file:', audioFilePath)
  console.log('[WhisperLocal] File exists:', fs.existsSync(audioFilePath))
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Verify audio file exists
  if (!fs.existsSync(audioFilePath)) {
    const error = `Audio file not found: ${audioFilePath}`
    console.error('[WhisperLocal] ❌ ERROR:', error)
    throw new Error(error)
  }

  try {
    // Convert WebM to WAV format (WhisperKit needs AVFoundation-compatible format)
    console.log('[WhisperLocal] Converting WebM to WAV for WhisperKit compatibility...')
    console.time('[WhisperLocal] ⏱️  Audio Conversion Time')
    const wavPath = audioFilePath.replace('.webm', '.wav')

    try {
      // Use ffmpeg to convert WebM to WAV (16kHz mono, 16-bit PCM)
      await execAsync(
        `ffmpeg -i "${audioFilePath}" -ar 16000 -ac 1 -sample_fmt s16 "${wavPath}" -y`,
        { timeout: 30000 }
      )
      console.timeEnd('[WhisperLocal] ⏱️  Audio Conversion Time')
      console.log('[WhisperLocal] Audio converted to WAV successfully')
    } catch (convError) {
      console.timeEnd('[WhisperLocal] ⏱️  Audio Conversion Time')
      console.error('[WhisperLocal] Audio conversion failed:', convError)
      throw new Error('Failed to convert audio to compatible format. Make sure ffmpeg is installed.')
    }

    // Ensure daemon is running with correct model
    console.time('[WhisperLocal] ⏱️  Daemon Startup Time')
    await startDaemon(modelName)
    console.timeEnd('[WhisperLocal] ⏱️  Daemon Startup Time')

    // Send transcription request to daemon
    console.time('[WhisperLocal] ⏱️  WhisperKit Transcription Time')
    const transcription = await new Promise<string>((resolve, reject) => {
      pendingRequests.set(wavPath, { resolve, reject })

      const request = JSON.stringify({
        audioFile: wavPath,
        language: language || undefined
      })

      daemonProcess?.stdin?.write(request + '\n')

      // Timeout after 120 seconds
      setTimeout(() => {
        if (pendingRequests.has(wavPath)) {
          pendingRequests.delete(wavPath)
          reject(new Error('Transcription timeout'))
        }
      }, 120000)
    })
    console.timeEnd('[WhisperLocal] ⏱️  WhisperKit Transcription Time')

    // Clean up the WAV file
    try {
      if (fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath)
        console.log('[WhisperLocal] Cleaned up temporary WAV file')
      }
    } catch (cleanupError) {
      console.warn('[WhisperLocal] Failed to clean up WAV file:', cleanupError)
    }

    console.log('[WhisperLocal] Transcription successful')
    return transcription
  } catch (error) {
    console.error('[WhisperLocal] Transcription failed:', error)

    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        throw new Error(
          'WhisperCLI binary not found. Please ensure it is built and available.'
        )
      } else if (error.message.includes('timeout')) {
        throw new Error(
          'Transcription timed out. This can happen on first run while downloading models. Please try again.'
        )
      }
    }

    throw error
  }
}

/**
 * List available WhisperKit models
 */
export async function listAvailableModels(): Promise<string[]> {
  try {
    const whisperBinary = getWhisperCLIPath()
    const command = `"${whisperBinary}" list-models`

    const { stdout } = await execAsync(command, { timeout: 10000 })
    const result = JSON.parse(stdout)

    if (result.success && Array.isArray(result.models)) {
      return result.models
    }

    return []
  } catch (error) {
    console.error('[WhisperLocal] Failed to list models:', error)
    return []
  }
}

/**
 * Check if WhisperKit is available (binary exists)
 */
export function isWhisperKitAvailable(): boolean {
  try {
    const whisperBinary = getWhisperCLIPath()
    return fs.existsSync(whisperBinary)
  } catch {
    return false
  }
}

/**
 * Get recommended model based on hardware
 * (Future enhancement: could detect M1/M2/M3 and recommend accordingly)
 */
export function getRecommendedModel(): string {
  // For now, default to base model which works well on all Apple Silicon
  return 'base'
}
