import React, { useEffect, useState } from 'react'

interface DictionaryEntry {
  id: string
  term: string
  replacement: string
}

function DictionaryView(): React.JSX.Element {
  const [customInstructions, setCustomInstructions] = useState('')
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[]>([])
  const [newTerm, setNewTerm] = useState('')
  const [newReplacement, setNewReplacement] = useState('')

  useEffect(() => {
    window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
      if (settings.customInstructions) setCustomInstructions(settings.customInstructions)
      if (settings.dictionaryEntries) setDictionaryEntries(settings.dictionaryEntries)
    })
  }, [])

  const updateSetting = (key: string, value: any) => {
    window.electron.ipcRenderer.invoke('update-setting', key, value)
  }

  const addEntry = () => {
    if (!newTerm.trim() || !newReplacement.trim()) return

    const entry: DictionaryEntry = {
      id: Date.now().toString(),
      term: newTerm.trim(),
      replacement: newReplacement.trim()
    }

    const updated = [...dictionaryEntries, entry]
    setDictionaryEntries(updated)
    updateSetting('dictionaryEntries', updated)
    setNewTerm('')
    setNewReplacement('')
  }

  const removeEntry = (id: string) => {
    const updated = dictionaryEntries.filter((e) => e.id !== id)
    setDictionaryEntries(updated)
    updateSetting('dictionaryEntries', updated)
  }

  return (
    <div className="flex-1 h-full bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto p-10">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Personal Dictionary</h1>
        <p className="text-zinc-500 mb-10">
          Add custom words, names, and phrases so Flow transcribes them correctly.
        </p>

        <div className="space-y-8">
          {/* Dictionary Entries */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-700">Dictionary Entries</label>

            {/* Add New Entry Form */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-purple-900 mb-1.5">
                    When you say...
                  </label>
                  <input
                    type="text"
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') addEntry()
                    }}
                    placeholder='e.g. "wisp err"'
                    className="w-full bg-white border border-purple-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-purple-900 mb-1.5">
                    Type this instead
                  </label>
                  <input
                    type="text"
                    value={newReplacement}
                    onChange={(e) => setNewReplacement(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') addEntry()
                    }}
                    placeholder='e.g. "Wispr"'
                    className="w-full bg-white border border-purple-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                  />
                </div>
              </div>
              <button
                onClick={addEntry}
                disabled={!newTerm.trim() || !newReplacement.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                Add to Dictionary
              </button>
            </div>

            {/* Dictionary Entries List */}
            {dictionaryEntries.length > 0 ? (
              <div className="space-y-2 mt-4">
                {dictionaryEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between bg-white border border-zinc-200 rounded-lg px-4 py-3 hover:border-zinc-300 transition-colors group"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1">
                        <span className="text-sm text-zinc-500 line-through">{entry.term}</span>
                      </div>
                      <div className="text-zinc-400">→</div>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-zinc-900">
                          {entry.replacement}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-all text-sm font-medium ml-4"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-400 text-sm">
                No dictionary entries yet. Add your first one above!
              </div>
            )}
          </div>

          {/* Custom Instructions */}
          <div className="space-y-3 pt-4 border-t border-zinc-200">
            <label className="block text-sm font-medium text-zinc-700">
              Advanced: Custom Instructions
            </label>
            <div className="relative">
              <textarea
                value={customInstructions}
                onChange={(e) => {
                  setCustomInstructions(e.target.value)
                  updateSetting('customInstructions', e.target.value)
                }}
                placeholder='e.g. "Use British spelling", "Never use emojis", "Start every sentence with a capital letter"'
                className="w-full h-32 bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none placeholder:text-zinc-400 text-zinc-900"
              />
              <div className="absolute bottom-3 right-3">
                <button
                  onClick={() => window.electron.ipcRenderer.send('open-examples-window')}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  View Examples
                </button>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              General formatting instructions that will be appended to the AI prompt.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DictionaryView
