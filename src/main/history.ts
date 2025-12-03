import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { syncManager } from './cloudkit-sync'

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

export const loadHistory = (): HistoryItem[] => {
  const path = getHistoryPath()
  if (!existsSync(path)) {
    return []
  }
  try {
    const data = readFileSync(path, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Failed to load history:', error)
    return []
  }
}

export const saveHistory = (history: HistoryItem[]): void => {
  const path = getHistoryPath()
  try {
    writeFileSync(path, JSON.stringify(history, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save history:', error)
  }
}

export const addHistoryEntry = async (text: string, durationMs: number): Promise<HistoryItem> => {
  const history = loadHistory()

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

  saveHistory(history)

  // Sync to CloudKit
  await syncManager.syncHistoryItem(newItem)

  return newItem
}

export const getStats = (): Stats => {
  const history = loadHistory()
  const now = Date.now()
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000

  let totalWords = 0
  let weeklyWords = 0
  let totalWpm = 0
  let wpmCount = 0

  history.forEach((item) => {
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
  let history = loadHistory()
  history = history.filter((item) => item.id !== id)
  saveHistory(history)

  // Delete from CloudKit
  await syncManager.deleteHistoryItem(id)
}
