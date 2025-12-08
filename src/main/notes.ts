import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'

export interface NoteItem {
  id: string
  content: string
  timestamp: number
}

const NOTES_FILE = 'notes.json'

const getNotesPath = (): string => {
  return join(app.getPath('userData'), NOTES_FILE)
}

export const loadNotes = (): NoteItem[] => {
  const path = getNotesPath()
  if (!existsSync(path)) {
    return []
  }
  try {
    const data = readFileSync(path, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Failed to load notes:', error)
    return []
  }
}

export const saveNotes = (notes: NoteItem[]): void => {
  const path = getNotesPath()
  try {
    writeFileSync(path, JSON.stringify(notes, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save notes:', error)
  }
}

export const addNote = async (content: string): Promise<NoteItem> => {
  const notes = loadNotes()

  const newItem: NoteItem = {
    id: uuidv4(),
    content,
    timestamp: Date.now()
  }

  // Add to beginning
  notes.unshift(newItem)

  saveNotes(notes)

  return newItem
}

export const deleteNote = async (id: string): Promise<void> => {
  let notes = loadNotes()
  notes = notes.filter((item) => item.id !== id)
  saveNotes(notes)
}

export const updateNote = async (id: string, content: string): Promise<void> => {
  const notes = loadNotes()
  const index = notes.findIndex((item) => item.id !== id)
  if (index !== -1) {
    notes[index].content = content
    notes[index].timestamp = Date.now()
    saveNotes(notes)
  }
}
