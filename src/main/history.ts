import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { encryptData, decryptData, detectStorageVersion } from './encryption'

export interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration: number // in seconds
  wpm: number
}

export interface Stats {
  totalWords: number
  weeklyWords: number
  averageWpm: number
}

const HISTORY_FILE = 'history.json'

const getHistoryPath = (): string => {
  return join(app.getPath('userData'), HISTORY_FILE)
}

export const loadHistory = async (): Promise<HistoryItem[]> => {
  const path = getHistoryPath()
  if (!existsSync(path)) {
    return []
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw)

    // Detect storage format version
    const version = detectStorageVersion(parsed)

    if (version === 1) {
      // Old plaintext format - return as-is, will encrypt on next save
      console.log('[History] Detected plaintext format, will migrate on next save')
      return Array.isArray(parsed) ? parsed : []
    } else {
      // Version 2 - encrypted format
      try {
        const decrypted = await decryptData(parsed.data)
        return decrypted
      } catch (error) {
        console.error('[History] Decryption failed:', error)

        // Create backup of corrupted file
        const backupPath = path + '.corrupted.' + Date.now()
        copyFileSync(path, backupPath)
        console.error('[History] Corrupted file backed up to:', backupPath)

        return []
      }
    }
  } catch (error) {
    console.error('[History] Failed to load history:', error)
    return []
  }
}

export const saveHistory = async (history: HistoryItem[]): Promise<void> => {
  const path = getHistoryPath()
  try {
    // Encrypt the data
    const encrypted = await encryptData(history)
    const wrapper = { version: 2 as const, data: encrypted }

    // Write encrypted data
    writeFileSync(path, JSON.stringify(wrapper, null, 2), 'utf-8')
    console.log('[History] Saved encrypted history')
  } catch (error) {
    console.error('[History] Failed to save history:', error)
  }
}

export const addHistoryEntry = async (text: string, durationMs: number): Promise<HistoryItem> => {
  const history = await loadHistory()

  const wordCount = text.trim().split(/\s+/).length
  const durationMin = durationMs / 1000 / 60
  const wpm = durationMin > 0 ? Math.round(wordCount / durationMin) : 0

  const newItem: HistoryItem = {
    id: uuidv4(),
    text,
    timestamp: Date.now(),
    duration: durationMs / 1000,
    wpm
  }

  // Add to beginning
  history.unshift(newItem)

  // Limit to last 1000 entries
  if (history.length > 1000) {
    history.length = 1000
  }

  await saveHistory(history)

  return newItem
}

export const getStats = async (): Promise<Stats> => {
  const history = await loadHistory()
  const now = Date.now()
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000

  let totalWords = 0
  let weeklyWords = 0
  let totalWpm = 0
  let wpmCount = 0

  history.forEach((item: HistoryItem) => {
    const words = item.text.trim().split(/\s+/).length
    totalWords += words

    if (item.timestamp > oneWeekAgo) {
      weeklyWords += words
    }

    if (item.wpm > 0) {
      totalWpm += item.wpm
      wpmCount++
    }
  })

  return {
    totalWords,
    weeklyWords,
    averageWpm: wpmCount > 0 ? Math.round(totalWpm / wpmCount) : 0
  }
}

export const deleteHistoryItem = async (id: string): Promise<void> => {
  let history = await loadHistory()
  history = history.filter((item: HistoryItem) => item.id !== id)
  await saveHistory(history)
}
