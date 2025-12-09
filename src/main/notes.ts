import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { encryptData, decryptData, detectStorageVersion } from './encryption'

export interface NoteItem {
  id: string
  content: string
  timestamp: number
}

const NOTES_FILE = 'notes.json'

const getNotesPath = (): string => {
  return join(app.getPath('userData'), NOTES_FILE)
}

export const loadNotes = async (): Promise<NoteItem[]> => {
  const path = getNotesPath()
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
      console.log('[Notes] Detected plaintext format, will migrate on next save')
      return Array.isArray(parsed) ? parsed : []
    } else {
      // Version 2 - encrypted format
      try {
        const decrypted = await decryptData(parsed.data)
        return decrypted
      } catch (error) {
        console.error('[Notes] Decryption failed:', error)

        // Create backup of corrupted file
        const backupPath = path + '.corrupted.' + Date.now()
        copyFileSync(path, backupPath)
        console.error('[Notes] Corrupted file backed up to:', backupPath)

        return []
      }
    }
  } catch (error) {
    console.error('[Notes] Failed to load notes:', error)
    return []
  }
}

export const saveNotes = async (notes: NoteItem[]): Promise<void> => {
  const path = getNotesPath()
  try {
    // Encrypt the data
    const encrypted = await encryptData(notes)
    const wrapper = { version: 2 as const, data: encrypted }

    // Write encrypted data
    writeFileSync(path, JSON.stringify(wrapper, null, 2), 'utf-8')
    console.log('[Notes] Saved encrypted notes')
  } catch (error) {
    console.error('[Notes] Failed to save notes:', error)
  }
}

export const addNote = async (content: string): Promise<NoteItem> => {
  const notes = await loadNotes()

  const newItem: NoteItem = {
    id: uuidv4(),
    content,
    timestamp: Date.now()
  }

  // Add to beginning
  notes.unshift(newItem)

  await saveNotes(notes)

  return newItem
}

export const deleteNote = async (id: string): Promise<void> => {
  let notes = await loadNotes()
  notes = notes.filter((item: NoteItem) => item.id !== id)
  await saveNotes(notes)
}

export const updateNote = async (id: string, content: string): Promise<void> => {
  const notes = await loadNotes()
  const index = notes.findIndex((item: NoteItem) => item.id !== id)
  if (index !== -1) {
    notes[index].content = content
    notes[index].timestamp = Date.now()
    await saveNotes(notes)
  }
}
