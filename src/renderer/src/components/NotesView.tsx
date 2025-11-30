import React, { useEffect, useState } from 'react'
import { useRecorder } from '../hooks/useRecorder'

interface NoteItem {
  id: string
  content: string
  timestamp: number
}

function NotesView(): React.JSX.Element {
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [inputValue, setInputValue] = useState('')
  
  // View States
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc') // desc = newest first

  // Edit States
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  
  // Recording State
  const { isRecording, startRecording, stopRecording } = useRecorder()
  const [isTranscribing, setIsTranscribing] = useState(false)

  useEffect(() => {
    loadNotes()
  }, [])

  const toggleRecording = async () => {
      if (isRecording) {
          const blob = await stopRecording()
          if (blob) {
              setIsTranscribing(true)
              try {
                  const buffer = await blob.arrayBuffer()
                  const text = await window.electron.ipcRenderer.invoke('transcribe-buffer', buffer)
                  if (text) {
                      setInputValue(prev => prev + (prev ? ' ' : '') + text)
                  }
              } catch (error) {
                  console.error("Transcription failed", error)
              } finally {
                  setIsTranscribing(false)
              }
          }
      } else {
          await startRecording()
      }
  }

  const loadNotes = async () => {
    const data = await window.electron.ipcRenderer.invoke('get-notes')
    setNotes(data)
  }

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim()) {
        await window.electron.ipcRenderer.invoke('add-note', inputValue)
        setInputValue('')
        loadNotes()
      }
    }
  }

  const handleDelete = async (id: string) => {
    await window.electron.ipcRenderer.invoke('delete-note', id)
    loadNotes()
  }

  const startEditing = (note: NoteItem) => {
    setEditingId(note.id)
    setEditContent(note.content)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditContent('')
  }

  const saveEdit = async (id: string) => {
    if (editContent.trim()) {
        await window.electron.ipcRenderer.invoke('update-note', id, editContent)
        setEditingId(null)
        setEditContent('')
        loadNotes()
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${dateStr}  ${timeStr}`
  }

  const filteredNotes = notes
    .filter(note => note.content.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
        if (sortOrder === 'desc') return b.timestamp - a.timestamp
        return a.timestamp - b.timestamp
    })

  return (
    <div className="flex-1 h-full bg-white overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 pt-16 pb-8 flex flex-col items-center">
        
        {/* Header */}
        <h1 className="text-2xl font-bold text-zinc-800 mb-8 text-center">
          For quick thoughts you want to come back to
        </h1>

        {/* Input Card */}
        <div className="w-full relative shadow-sm hover:shadow-md transition-shadow duration-300 rounded-2xl">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Take a quick note with your voice"
            className="w-full h-32 p-6 pr-16 bg-white border border-zinc-200 rounded-2xl resize-none focus:outline-none focus:border-zinc-300 focus:ring-0 text-zinc-700 placeholder:text-zinc-400 text-lg shadow-sm"
          />
          <button 
            onClick={toggleRecording}
            disabled={isTranscribing}
            className={`absolute right-4 bottom-4 p-3 rounded-full transition-all text-white ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : isTranscribing ? 'bg-blue-500 cursor-wait' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            {isTranscribing ? (
                // Spinner
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : isRecording ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none"></rect>
                </svg>
            ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
            )}
          </button>
        </div>

        {/* Toolbar */}
        <div className="w-full mt-12 mb-4 flex justify-between items-end border-b border-zinc-100 pb-2 gap-4">
            <div className="flex-1 flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-500 tracking-wider whitespace-nowrap">RECENTS</span>
                {isSearchOpen && (
                    <div className="flex-1 max-w-sm animate-in fade-in slide-in-from-left-2 duration-200">
                        <input 
                            type="text" 
                            autoFocus
                            placeholder="Search notes..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-md text-sm focus:outline-none focus:border-zinc-300"
                        />
                    </div>
                )}
            </div>
            
            <div className="flex gap-2">
                 {/* Search Toggle */}
                 <button 
                    onClick={() => {
                        setIsSearchOpen(!isSearchOpen)
                        if (isSearchOpen) setSearchQuery('')
                    }}
                    className={`p-2 rounded-md transition-colors ${isSearchOpen ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
                    title="Search"
                 >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                 </button>

                 {/* View Mode Toggle */}
                 <button 
                    onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                    className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-md transition-colors"
                    title={viewMode === 'list' ? "Grid View" : "List View"}
                 >
                    {viewMode === 'list' ? (
                         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    ) : (
                         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    )}
                 </button>

                 {/* Sort Toggle */}
                 <button 
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} 
                    className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-md transition-colors"
                    title="Sort Date"
                 >
                    {sortOrder === 'desc' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <polyline points="19 12 12 19 5 12"></polyline>
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                             <line x1="12" y1="19" x2="12" y2="5"></line>
                             <polyline points="5 12 12 5 19 12"></polyline>
                        </svg>
                    )}
                 </button>
            </div>
        </div>

        {/* Notes List */}
        <div className={`w-full pb-12 ${viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'space-y-4'}`}>
            {filteredNotes.map(note => (
                <div key={note.id} className="w-full bg-white border border-zinc-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all group relative flex flex-col">
                    {editingId === note.id ? (
                        <div className="flex-1 flex flex-col gap-2">
                             <textarea 
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="w-full h-full min-h-[100px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-300 resize-none text-zinc-800"
                                autoFocus
                             />
                             <div className="flex gap-2 justify-end">
                                 <button onClick={cancelEditing} className="px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 rounded">Cancel</button>
                                 <button onClick={() => saveEdit(note.id)} className="px-3 py-1 text-xs bg-zinc-800 text-white hover:bg-zinc-700 rounded">Save</button>
                             </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-zinc-800 text-lg font-medium mb-8 leading-relaxed whitespace-pre-wrap break-words">
                                {note.content}
                            </p>
                            <div className="mt-auto flex justify-between items-end">
                                <span className="text-sm text-zinc-400 font-medium">{formatTime(note.timestamp)}</span>
                            </div>

                            {/* Actions (Hover) */}
                            <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                 <button 
                                    onClick={() => startEditing(note)}
                                    className="p-2 text-zinc-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                    title="Edit"
                                 >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                 </button>
                                 <button 
                                    onClick={() => handleDelete(note.id)}
                                    className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Delete"
                                 >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                 </button>
                            </div>
                        </>
                    )}
                </div>
            ))}
            
            {filteredNotes.length === 0 && (
                <div className="col-span-full text-center py-12 text-zinc-300">
                    <p>{searchQuery ? 'No notes found matching your search.' : 'No notes yet.'}</p>
                </div>
            )}
        </div>

      </div>
    </div>
  )
}

export default NotesView