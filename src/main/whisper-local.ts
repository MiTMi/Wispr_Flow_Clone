import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

const execAsync = promisify(exec)

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
    const devPath = path.join(process.cwd(), 'swift-whisper', '.build', 'release', 'whisper-cli')

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
}

/**
 * Transcribe audio file using local WhisperKit
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
    console.log('[WhisperLocal] Getting whisper-cli path...')
    const whisperBinary = getWhisperCLIPath()
    console.log('[WhisperLocal] Binary path:', whisperBinary)
    console.log('[WhisperLocal] Binary exists:', fs.existsSync(whisperBinary))

    // Convert WebM to WAV format (WhisperKit needs AVFoundation-compatible format)
    console.log('[WhisperLocal] Converting WebM to WAV for WhisperKit compatibility...')
    const wavPath = audioFilePath.replace('.webm', '.wav')

    try {
      const { exec } = require('child_process')
      const { promisify } = require('util')
      const execAsync = promisify(exec)

      // Use ffmpeg to convert WebM to WAV (16kHz mono, 16-bit PCM)
      await execAsync(
        `ffmpeg -i "${audioFilePath}" -ar 16000 -ac 1 -sample_fmt s16 "${wavPath}" -y`,
        { timeout: 30000 }
      )
      console.log('[WhisperLocal] Audio converted to WAV successfully')
    } catch (convError) {
      console.error('[WhisperLocal] Audio conversion failed:', convError)
      throw new Error('Failed to convert audio to compatible format. Make sure ffmpeg is installed.')
    }

    // Build command with WAV file
    const args = ['transcribe', wavPath, modelName]
    if (language) {
      args.push(language)
    }

    const command = `"${whisperBinary}" ${args.map((a) => `"${a}"`).join(' ')}`

    console.log('[WhisperLocal] Executing:', command)

    // Execute with generous timeout (WhisperKit can be slow on first run while downloading models)
    const { stdout, stderr } = await execAsync(command, {
      timeout: 120000, // 2 minutes
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    })

    // Log stderr (contains progress messages)
    if (stderr) {
      console.log('[WhisperLocal] Logs:', stderr)
    }

    // Parse JSON result from stdout
    const result: TranscriptionResult = JSON.parse(stdout)

    // Clean up the WAV file
    try {
      if (fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath)
        console.log('[WhisperLocal] Cleaned up temporary WAV file')
      }
    } catch (cleanupError) {
      console.warn('[WhisperLocal] Failed to clean up WAV file:', cleanupError)
    }

    if (result.success && result.transcription) {
      console.log('[WhisperLocal] Transcription successful')
      return result.transcription
    } else {
      throw new Error(result.error || 'Unknown transcription error')
    }
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
