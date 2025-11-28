import { useEffect, useState } from 'react'

function Settings(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState('general')

  // Settings State
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+Space')
  const [triggerMode, setTriggerMode] = useState<'toggle' | 'hold'>('toggle')
  const [holdKey, setHoldKey] = useState<number | null>(null)
  const [startOnLogin, setStartOnLogin] = useState(false)
  const [style, setStyle] = useState('polished')
  const [language, setLanguage] = useState('auto')
  const [customInstructions, setCustomInstructions] = useState('')

  const [isRecording, setIsRecording] = useState(false)
  const [isRecordingHoldKey, setIsRecordingHoldKey] = useState(false)

  useEffect(() => {
    // Load initial settings
    window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
      if (settings.hotkey) setHotkey(settings.hotkey)
      if (settings.triggerMode) setTriggerMode(settings.triggerMode)
      if (settings.holdKey) setHoldKey(settings.holdKey)
      if (settings.startOnLogin !== undefined) setStartOnLogin(settings.startOnLogin)
      if (settings.style) setStyle(settings.style)
      if (settings.language) setLanguage(settings.language)
      if (settings.customInstructions) setCustomInstructions(settings.customInstructions)
    })

    // Listen for hold key recording
    const onKeyRecorded = (_: any, keycode: number) => {
      setHoldKey(keycode)
      setIsRecordingHoldKey(false)
    }

    window.electron.ipcRenderer.on('key-recorded', onKeyRecorded)

    return () => {
      window.electron.ipcRenderer.removeAllListeners('key-recorded')
    }
  }, [])

  // ... (Existing Hotkey Logic - Preserved) ...
  useEffect(() => {
    if (!isRecording) return

    const pressedKeys = new Set<string>()
    let lastValidCombo: string[] = []

    const getElectronKey = (e: KeyboardEvent): string | null => {
      const key = e.key
      if (key === 'Meta') return 'CommandOrControl'
      if (key === 'Control') return 'Control'
      if (key === 'Alt') return 'Alt'
      if (key === 'Shift') return 'Shift'
      if (key === ' ') return 'Space'
      if (key === 'Escape') return 'Escape'
      if (key === 'ArrowUp') return 'Up'
      if (key === 'ArrowDown') return 'Down'
      if (key === 'ArrowLeft') return 'Left'
      if (key === 'ArrowRight') return 'Right'
      if (key === 'Enter') return 'Return'
      if (key.length === 1) return key.toUpperCase()
      return key.length > 1 ? key : null
    }

    const sortKeys = (keys: string[]): string[] => {
      const modifiers = ['CommandOrControl', 'Control', 'Alt', 'Shift']
      const mods = keys.filter((k) => modifiers.includes(k))
      const others = keys.filter((k) => !modifiers.includes(k))
      mods.sort((a, b) => modifiers.indexOf(a) - modifiers.indexOf(b))
      return [...mods, ...others]
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      const key = getElectronKey(e)
      if (!key) return

      if (key === 'Escape' && pressedKeys.size === 0) {
        setIsRecording(false)
        return
      }

      pressedKeys.add(key)
      const currentCombo = sortKeys(Array.from(pressedKeys))
      lastValidCombo = currentCombo
      setHotkey(currentCombo.join('+'))
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      const key = getElectronKey(e)
      if (key) pressedKeys.delete(key)

      if (pressedKeys.size === 0) {
        if (lastValidCombo.length > 0) {
          const modifiers = ['CommandOrControl', 'Control', 'Alt', 'Shift']
          const hasNonModifier = lastValidCombo.some((k) => !modifiers.includes(k))

          if (hasNonModifier) {
            const finalHotkey = lastValidCombo.join('+')
            setHotkey(finalHotkey)
            window.electron.ipcRenderer.invoke('update-setting', 'hotkey', finalHotkey)
          } else {
            window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
              if (settings.hotkey) setHotkey(settings.hotkey)
            })
          }
        }
        setIsRecording(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return (): void => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [isRecording])

  const updateSetting = (key: string, value: any) => {
    window.electron.ipcRenderer.invoke('update-setting', key, value)
  }

  const getKeyName = (keycode: number | null): string => {
    if (!keycode) return 'Not Set'
    const map: Record<number, string> = {
      56: 'Left Option',
      3640: 'Right Option',
      29: 'Left Control',
      3613: 'Right Control',
      42: 'Left Shift',
      54: 'Right Shift',
      3675: 'Left Command',
      3676: 'Right Command',
      57: 'Space',
      1: 'Escape',
      28: 'Enter',
      14: 'Backspace',
      15: 'Tab',
      58: 'Caps Lock'
    }
    return map[keycode] || `Key Code: ${keycode}`
  }

  const SidebarItem = ({
    id,
    label,
    icon
  }: {
    id: string
    label: string
    icon: React.ReactNode
  }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === id
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
        }`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-white select-none overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-900/80 border-r border-zinc-800 p-6 flex flex-col gap-2 backdrop-blur-xl">
        <div className="mb-8 px-2">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Wispr Flow
          </h1>
          <p className="text-xs text-zinc-500 mt-1">v1.0.0</p>
        </div>

        <SidebarItem
          id="general"
          label="General"
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          }
        />
        <SidebarItem
          id="ai"
          label="AI Personality"
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
              <path d="M12 2a10 10 0 0 1 10 10"></path>
              <path d="M12 22a10 10 0 0 1-10-10"></path>
              <path d="M2 12h10"></path>
            </svg>
          }
        />
        <SidebarItem
          id="shortcuts"
          label="Shortcuts"
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
              <line x1="6" y1="12" x2="18" y2="12"></line>
            </svg>
          }
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 bg-zinc-950 p-10 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-8">
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-semibold mb-6">General Settings</h2>

              {/* Start on Login */}
              <div className="flex items-center justify-between bg-zinc-900/50 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all">
                <div>
                  <div className="font-medium text-zinc-200">Start on Login</div>
                  <div className="text-sm text-zinc-500 mt-1">
                    Launch automatically when you sign in
                  </div>
                </div>
                <button
                  onClick={() => {
                    setStartOnLogin(!startOnLogin)
                    updateSetting('startOnLogin', !startOnLogin)
                  }}
                  className={`w-12 h-6 rounded-full transition-colors relative ${startOnLogin ? 'bg-blue-600' : 'bg-zinc-700'}`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${startOnLogin ? 'left-7' : 'left-1'}`}
                  ></div>
                </button>
              </div>

              {/* Input Language */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-zinc-400">Input Language</label>
                <div className="relative">
                  <select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value)
                      updateSetting('language', e.target.value)
                    }}
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm appearance-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  >
                    <option value="auto">✨ Auto-Detect (Default)</option>
                    <option value="en">🇺🇸 English</option>
                    <option value="he">🇮🇱 Hebrew (עברית)</option>
                    <option value="fr">🇫🇷 French (Français)</option>
                    <option value="es">🇪🇸 Spanish (Español)</option>
                    <option value="de">🇩🇪 German (Deutsch)</option>
                    <option value="it">🇮🇹 Italian (Italiano)</option>
                    <option value="pt">🇵🇹 Portuguese (Português)</option>
                    <option value="ru">🇷🇺 Russian (Русский)</option>
                    <option value="ja">🇯🇵 Japanese (日本語)</option>
                    <option value="zh">🇨🇳 Chinese (中文)</option>
                  </select>
                  <div className="absolute right-4 top-3.5 pointer-events-none text-zinc-500">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-zinc-500">
                  Force a specific language for faster detection on short phrases.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-semibold mb-6">AI Personality</h2>

              {/* Style & Tone */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-zinc-400">Style & Tone</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'polished', label: 'Polished', desc: 'Fixes grammar, professional' },
                    { id: 'casual', label: 'Casual', desc: 'Verbatim, relaxed vibe' },
                    { id: 'bullet', label: 'Bullet Points', desc: 'Converts to a list' },
                    { id: 'summary', label: 'Summary', desc: 'Concise paragraph' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setStyle(opt.id)
                        updateSetting('style', opt.id)
                      }}
                      className={`p-4 rounded-xl border text-left transition-all ${style === opt.id
                          ? 'bg-blue-600/10 border-blue-500 text-blue-400 ring-1 ring-blue-500/50'
                          : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:bg-zinc-900'
                        }`}
                    >
                      <div className="font-medium text-sm mb-1">{opt.label}</div>
                      <div className="text-xs opacity-70">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Instructions */}
              <div className="space-y-3 pt-4">
                <label className="block text-sm font-medium text-zinc-400">
                  Custom Instructions
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => {
                    setCustomInstructions(e.target.value)
                    updateSetting('customInstructions', e.target.value)
                  }}
                  placeholder='e.g. "Always spell Wispr without an e", "Use British spelling", "Never use emojis"'
                  className="w-full h-32 bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none placeholder:text-zinc-700"
                />
                <p className="text-xs text-zinc-500">
                  These instructions will be appended to the system prompt.
                  <button
                    onClick={() => window.electron.ipcRenderer.send('open-examples-window')}
                    className="ml-2 text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    Read more
                  </button>
                </p>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-semibold mb-6">Shortcuts</h2>

              <div className="bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 flex mb-6">
                <button
                  onClick={() => {
                    setTriggerMode('toggle')
                    updateSetting('triggerMode', 'toggle')
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${triggerMode === 'toggle' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Toggle Mode
                </button>
                <button
                  onClick={() => {
                    setTriggerMode('hold')
                    updateSetting('triggerMode', 'hold')
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${triggerMode === 'hold' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Push-to-Talk
                </button>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-8 flex flex-col items-center justify-center text-center">
                <div className="mb-4 p-4 bg-zinc-950 rounded-full border border-zinc-800">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-zinc-400"
                  >
                    <path d="M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0"></path>
                    <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0"></path>
                  </svg>
                </div>

                {triggerMode === 'toggle' ? (
                  <>
                    <h3 className="text-lg font-medium mb-2">Global Shortcut</h3>
                    <p className="text-sm text-zinc-500 mb-6 max-w-xs">
                      Press this key combination to start/stop recording from anywhere.
                    </p>
                    <button
                      onClick={() => setIsRecording(true)}
                      className={`px-8 py-4 rounded-xl border text-xl font-mono transition-all ${isRecording
                          ? 'bg-red-500/10 border-red-500 text-red-400 animate-pulse ring-2 ring-red-500/20'
                          : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:bg-zinc-900'
                        }`}
                    >
                      {isRecording ? 'Press keys...' : hotkey}
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium mb-2">Push-to-Talk Key</h3>
                    <p className="text-sm text-zinc-500 mb-6 max-w-xs">
                      Hold this key to record. Release to stop.
                    </p>
                    <button
                      onClick={() => {
                        setIsRecordingHoldKey(true)
                        window.electron.ipcRenderer.invoke('start-key-recording')
                      }}
                      className={`px-8 py-4 rounded-xl border text-xl font-mono transition-all ${isRecordingHoldKey
                          ? 'bg-blue-500/10 border-blue-500 text-blue-400 animate-pulse ring-2 ring-blue-500/20'
                          : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:bg-zinc-900'
                        }`}
                    >
                      {isRecordingHoldKey ? 'Press Key...' : getKeyName(holdKey)}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default Settings
