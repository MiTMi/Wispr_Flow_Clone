import React, { useEffect, useState } from 'react'

function SettingsView(): React.JSX.Element {
  const [startOnLogin, setStartOnLogin] = useState(false)
  const [triggerMode, setTriggerMode] = useState('toggle')
  const [hotkey, setHotkey] = useState('Super+M')
  const [holdKey, setHoldKey] = useState<number | null>(null)
  
  // Recording States
  const [isRecording, setIsRecording] = useState(false)
  const [displayHotkey, setDisplayHotkey] = useState('') // For visual feedback during recording
  
  const [isRecordingHoldKey, setIsRecordingHoldKey] = useState(false)

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

  useEffect(() => {
    window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
      if (settings.startOnLogin !== undefined) setStartOnLogin(settings.startOnLogin)
      if (settings.triggerMode) setTriggerMode(settings.triggerMode)
      if (settings.hotkey) setHotkey(settings.hotkey)
      if (settings.holdKey) setHoldKey(settings.holdKey)
    })

    const handleKeyRecorded = (_: any, keycode: number) => {
      setHoldKey(keycode)
      setIsRecordingHoldKey(false)
      window.electron.ipcRenderer.invoke('update-setting', 'holdKey', keycode)
    }

    window.electron.ipcRenderer.on('key-recorded', handleKeyRecorded)

    return () => {
      window.electron.ipcRenderer.removeAllListeners('key-recorded')
    }
  }, [])

  // Hotkey Recording Logic (Local)
  useEffect(() => {
    if (!isRecording) return

    const pressedKeys = new Set<string>()
    let lastValidCombo: string[] = []

    const getElectronKey = (e: KeyboardEvent): string | null => {
      const key = e.key
      // Handle modifiers more explicitly
      if (key === 'Meta' || key === 'OS') return 'CommandOrControl'
      if (key === 'Control') return 'Control'
      if (key === 'Alt') return 'Alt'
      if (key === 'Shift') return 'Shift'
      
      // Handle special keys
      if (key === ' ') return 'Space'
      if (key === 'Escape') return 'Escape'
      if (key === 'ArrowUp') return 'Up'
      if (key === 'ArrowDown') return 'Down'
      if (key === 'ArrowLeft') return 'Left'
      if (key === 'ArrowRight') return 'Right'
      if (key === 'Enter') return 'Return'
      if (key === 'Backspace') return 'Backspace'
      if (key === 'Tab') return 'Tab'
      
      // Standard keys: Only use if single character (A, B, 1, etc.)
      // Note: e.key can be "Dead", "Process" etc. ignore those.
      if (key.length === 1) return key.toUpperCase()
      
      // Function keys
      if (/^F\d+$/.test(key)) return key
      
      return null
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
      
      // Update visual feedback
      setDisplayHotkey(currentCombo.join('+'))
      lastValidCombo = currentCombo
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
            // Cancel if only modifiers were pressed
            window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
              if (settings.hotkey) setHotkey(settings.hotkey)
            })
          }
        }
        setIsRecording(false)
      }
    }

    const handleBlur = () => {
      // If user clicks away, cancel recording
      setIsRecording(false)
      window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
        if (settings.hotkey) setHotkey(settings.hotkey)
      })
    }

    // Use window capture to ensure we get events
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', handleBlur)

    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', handleBlur)
    }
  }, [isRecording])

  const startRecording = () => {
    setDisplayHotkey('') // Reset visual state
    setIsRecording(true)
  }

  const toggleRecordingHoldKey = () => {
    if (isRecordingHoldKey) {
      setIsRecordingHoldKey(false)
      window.electron.ipcRenderer.invoke('stop-key-recording')
    } else {
      setIsRecordingHoldKey(true)
      window.electron.ipcRenderer.invoke('start-key-recording')
    }
  }

  return (
    <div className="flex-1 h-full bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto p-10">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Settings</h1>
        <p className="text-zinc-500 mb-10">Manage application preferences and shortcuts.</p>

        <div className="space-y-10">
          {/* General */}
          <section className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-2">
              General
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-zinc-900">Start on Login</div>
                <div className="text-sm text-zinc-500">
                  Automatically start Flow when you log in.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={startOnLogin}
                  onChange={(e) => {
                    setStartOnLogin(e.target.checked)
                    updateSetting('startOnLogin', e.target.checked)
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </section>

          {/* Shortcuts */}
          <section className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-2">
              Shortcuts
            </h2>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-zinc-700">Trigger Mode</label>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setTriggerMode('toggle')
                    updateSetting('triggerMode', 'toggle')
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all ${triggerMode === 'toggle'
                      ? 'bg-purple-50 border-purple-500 text-purple-700'
                      : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                >
                  Toggle (Press to Start/Stop)
                </button>
                <button
                  onClick={() => {
                    setTriggerMode('hold')
                    updateSetting('triggerMode', 'hold')
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all ${triggerMode === 'hold'
                      ? 'bg-purple-50 border-purple-500 text-purple-700'
                      : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                >
                  Push-to-Talk (Hold to Speak)
                </button>
              </div>
            </div>

            {triggerMode === 'toggle' ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700">Global Shortcut</label>
                <button
                  onClick={startRecording}
                  className={`w-full py-3 px-4 rounded-xl border text-left transition-all ${isRecording
                      ? 'bg-red-50 border-red-500 text-red-600 animate-pulse'
                      : 'bg-white border-zinc-200 text-zinc-900 hover:border-zinc-300'
                    }`}
                >
                  {isRecording ? (displayHotkey || 'Press any key combination...') : hotkey}
                </button>
                <p className="text-xs text-zinc-500">Click to record a new shortcut.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700">Push-to-Talk Key</label>
                <button
                  onClick={toggleRecordingHoldKey}
                  className={`w-full py-3 px-4 rounded-xl border text-left transition-all ${isRecordingHoldKey
                      ? 'bg-red-50 border-red-500 text-red-600 animate-pulse'
                      : 'bg-white border-zinc-200 text-zinc-900 hover:border-zinc-300'
                    }`}
                >
                  {isRecordingHoldKey
                    ? 'Press any key (Click again to cancel)...'
                    : holdKey
                      ? getKeyName(holdKey)
                      : 'Click to set key'}
                </button>
                <p className="text-xs text-zinc-500">Click to record the key you want to hold.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default SettingsView
