import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { app } from 'electron'
import dotenv from 'dotenv'

// Explicitly load .env from project root
const envPath = path.join(process.cwd(), '.env')
dotenv.config({ path: envPath })

console.log('Loading .env from:', envPath)
console.log('API Key present:', !!process.env.OPENAI_API_KEY)

let openai: OpenAI | null = null

function getOpenAI(): OpenAI {
    if (!openai) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is missing. Please check your .env file.')
        }
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            dangerouslyAllowBrowser: false
        })
    }
    return openai
}

export async function processAudio(buffer: ArrayBuffer): Promise<string> {
    try {
        // 1. Write buffer to temp file
        const tempFilePath = path.join(os.tmpdir(), `wispr_recording_${Date.now()}.webm`)
        fs.writeFileSync(tempFilePath, Buffer.from(buffer))

        // 2. Transcribe with Whisper
        const transcription = await getOpenAI().audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: 'whisper-1',
            language: 'en' // Force English
        })

        const rawText = transcription.text
        console.log('Raw Transcription:', rawText)

        // 3. Format with GPT-4o
        const completion = await getOpenAI().chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that formats dictated text. Remove filler words (um, uh, like), fix grammar, and ensure smooth flow. Do not change the meaning. Output ONLY the formatted text.'
                },
                { role: 'user', content: rawText }
            ],
            model: 'gpt-4o',
        })

        const formattedText = completion.choices[0].message.content || rawText
        console.log('Formatted Text:', formattedText)

        // 4. Inject Text
        await injectText(formattedText)

        // Cleanup
        fs.unlinkSync(tempFilePath)

        return formattedText
    } catch (error) {
        console.error('Error processing audio:', error)
        throw error
    }
}

async function injectText(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Escape double quotes and backslashes for AppleScript string
        const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

        // Use clipboard for faster and more reliable pasting
        const scriptContent = `
      set the clipboard to "${safeText}"
      delay 0.5
      tell application "System Events"
        key code 9 using command down
      end tell
    `

        const scriptPath = path.join(os.tmpdir(), `wispr_inject_${Date.now()}.scpt`)
        fs.writeFileSync(scriptPath, scriptContent)

        exec(`osascript "${scriptPath}"`, (error) => {
            // Cleanup script file
            try { fs.unlinkSync(scriptPath) } catch (e) { /* ignore */ }

            if (error) {
                console.error('Error injecting text:', error)
                reject(error)
            } else {
                resolve()
            }
        })
    })
}
