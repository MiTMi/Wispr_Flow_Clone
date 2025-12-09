import React, { useEffect, useState } from 'react'

function SettingsView(): React.JSX.Element {
  const [startOnLogin, setStartOnLogin] = useState(false)
  const [triggerMode, setTriggerMode] = useState('toggle')
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+Space') // Internal Electron format
  const [keyMessage, setKeyMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)

  // Detect if running on macOS
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  // Convert Electron accelerator format to user-friendly display
  const formatHotkeyForDisplay = (accelerator: string): string => {
    return accelerator
      .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
      .replace(/Control/g, isMac ? '⌃' : 'Ctrl')
      .replace(/Alt/g, isMac ? '⌥' : 'Alt')
      .replace(/Shift/g, isMac ? '⇧' : 'Shift')
      .replace(/\+/g, ' + ')
  }
  const [holdKey, setHoldKey] = useState<number | null>(null)

  // Recording States
  const [isRecording, setIsRecording] = useState(false)
  const [displayHotkey, setDisplayHotkey] = useState('') // For visual feedback during recording

  const [isRecordingHoldKey, setIsRecordingHoldKey] = useState(false)

  // Helper function to update settings
  const updateSetting = (key: string, value: unknown): void => {
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

    // Track pressed keys by their code (more reliable than key)
    const pressedCodes = new Set<string>()
    let lastValidCombo: string[] = []
    let finalizeTimeout: ReturnType<typeof setTimeout> | null = null

    // Map e.code to Electron accelerator format
    const getElectronKeyFromCode = (code: string): string | null => {
      // Modifiers
      if (code === 'MetaLeft' || code === 'MetaRight') return 'CommandOrControl'
      if (code === 'ControlLeft' || code === 'ControlRight') return 'Control'
      if (code === 'AltLeft' || code === 'AltRight') return 'Alt'
      if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'

      // Special keys
      if (code === 'Space') return 'Space'
      if (code === 'Escape') return 'Escape'
      if (code === 'ArrowUp') return 'Up'
      if (code === 'ArrowDown') return 'Down'
      if (code === 'ArrowLeft') return 'Left'
      if (code === 'ArrowRight') return 'Right'
      if (code === 'Enter' || code === 'NumpadEnter') return 'Return'
      if (code === 'Backspace') return 'Backspace'
      if (code === 'Tab') return 'Tab'
      if (code === 'Delete') return 'Delete'

      // Letter keys (KeyA -> A)
      if (code.startsWith('Key')) return code.slice(3).toUpperCase()

      // Digit keys (Digit1 -> 1)
      if (code.startsWith('Digit')) return code.slice(5)

      // Numpad digits
      if (code.startsWith('Numpad') && code.length === 7) return code.slice(6)

      // Function keys (F1-F12)
      if (/^F\d+$/.test(code)) return code

      // Other common keys
      if (code === 'Minus') return '-'
      if (code === 'Equal') return '='
      if (code === 'BracketLeft') return '['
      if (code === 'BracketRight') return ']'
      if (code === 'Backslash') return '\\'
      if (code === 'Semicolon') return ';'
      if (code === 'Quote') return "'"
      if (code === 'Comma') return ','
      if (code === 'Period') return '.'
      if (code === 'Slash') return '/'
      if (code === 'Backquote') return '`'

      return null
    }

    const sortKeys = (keys: string[]): string[] => {
      const modifiers = ['CommandOrControl', 'Control', 'Alt', 'Shift']
      const mods = keys.filter((k) => modifiers.includes(k))
      const others = keys.filter((k) => !modifiers.includes(k))
      mods.sort((a, b) => modifiers.indexOf(a) - modifiers.indexOf(b))
      return [...mods, ...others]
    }

    const tryFinalize = (): void => {
      if (lastValidCombo.length === 0) return

      const modifiers = ['CommandOrControl', 'Control', 'Alt', 'Shift']
      const hasNonModifier = lastValidCombo.some((k) => !modifiers.includes(k))

      // Require at least 3 keys total (e.g., Cmd + Shift + Space)
      if (hasNonModifier && lastValidCombo.length >= 3) {
        // Valid combo with at least one non-modifier key and 3+ keys total
        const finalHotkey = lastValidCombo.join('+')
        setHotkey(finalHotkey)
        updateSetting('hotkey', finalHotkey)
        stopRecording(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      // Clear any pending finalize
      if (finalizeTimeout) {
        clearTimeout(finalizeTimeout)
        finalizeTimeout = null
      }

      const electronKey = getElectronKeyFromCode(e.code)
      if (!electronKey) return

      // Escape cancels recording
      if (electronKey === 'Escape') {
        stopRecording(true)
        return
      }

      // Track by code for reliable up/down matching
      pressedCodes.add(e.code)

      // Build display combo from all pressed keys
      const electronKeys = Array.from(pressedCodes)
        .map((c) => getElectronKeyFromCode(c))
        .filter((k): k is string => k !== null)

      // Deduplicate (e.g., ShiftLeft and ShiftRight both map to Shift)
      const uniqueKeys = [...new Set(electronKeys)]
      const currentCombo = sortKeys(uniqueKeys)

      // Update visual feedback
      setDisplayHotkey(currentCombo.join('+'))
      lastValidCombo = currentCombo

      // Check if we have a valid combo (non-modifier + at least 3 keys) - if so, schedule finalization
      const modifiers = ['CommandOrControl', 'Control', 'Alt', 'Shift']
      const hasNonModifier = currentCombo.some((k) => !modifiers.includes(k))

      if (hasNonModifier && currentCombo.length >= 3) {
        // Finalize after a short delay (allows for additional key presses)
        finalizeTimeout = setTimeout(() => {
          tryFinalize()
        }, 500)
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      // Remove by code
      pressedCodes.delete(e.code)

      // When all keys are released and we have a valid combo, finalize immediately
      if (pressedCodes.size === 0 && lastValidCombo.length > 0) {
        if (finalizeTimeout) {
          clearTimeout(finalizeTimeout)
          finalizeTimeout = null
        }
        tryFinalize()
      }
    }

    const stopRecording = (cancelled: boolean): void => {
      if (finalizeTimeout) {
        clearTimeout(finalizeTimeout)
        finalizeTimeout = null
      }
      setIsRecording(false)
      setDisplayHotkey('')
      window.electron.ipcRenderer.send('resume-global-shortcut')

      if (cancelled) {
        // Restore original hotkey from settings
        window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
          if (settings.hotkey) setHotkey(settings.hotkey)
        })
      }
    }

    const handleBlur = (): void => {
      // If window loses focus and we have a valid combo (3+ keys), save it
      if (lastValidCombo.length >= 3) {
        const modifiers = ['CommandOrControl', 'Control', 'Alt', 'Shift']
        const hasNonModifier = lastValidCombo.some((k) => !modifiers.includes(k))
        if (hasNonModifier) {
          tryFinalize()
          return
        }
      }
      // Otherwise cancel
      stopRecording(true)
    }

    // Use window capture to ensure we get events
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', handleBlur)

    return (): void => {
      if (finalizeTimeout) {
        clearTimeout(finalizeTimeout)
      }
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', handleBlur)
    }
  }, [isRecording])

  const startRecording = () => {
    window.electron.ipcRenderer.send('pause-global-shortcut')
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

  const handleExportKey = async () => {
    try {
      const result = await window.electron.exportEncryptionKey()

      if (result.success && result.key) {
        // Copy key to clipboard
        navigator.clipboard.writeText(result.key)

        setKeyMessage({
          type: 'success',
          text: `Encryption key copied to clipboard! Keep this key safe and secure. Anyone with this key can decrypt your data.`
        })

        // Clear message after 10 seconds
        setTimeout(() => setKeyMessage(null), 10000)
      } else {
        setKeyMessage({
          type: 'error',
          text: `Failed to export key: ${result.error || 'Unknown error'}`
        })
        setTimeout(() => setKeyMessage(null), 5000)
      }
    } catch (error) {
      setKeyMessage({
        type: 'error',
        text: `Failed to export key: ${String(error)}`
      })
      setTimeout(() => setKeyMessage(null), 5000)
    }
  }

  const handleImportKey = async () => {
    const key = prompt(
      'Paste your encryption key:\n\n⚠️ WARNING: This will replace your current encryption key. Make sure you have the correct key from a previous export.'
    )

    if (!key || key.trim() === '') {
      setKeyMessage({
        type: 'info',
        text: 'Import cancelled - no key provided'
      })
      setTimeout(() => setKeyMessage(null), 3000)
      return
    }

    try {
      const result = await window.electron.importEncryptionKey(key.trim())

      if (result.success) {
        setKeyMessage({
          type: 'success',
          text: 'Encryption key imported successfully! Your data will now be decrypted with this key.'
        })
        setTimeout(() => setKeyMessage(null), 5000)
      } else {
        setKeyMessage({
          type: 'error',
          text: `Failed to import key: ${result.error || 'Invalid key format or length'}`
        })
        setTimeout(() => setKeyMessage(null), 5000)
      }
    } catch (error) {
      setKeyMessage({
        type: 'error',
        text: `Failed to import key: ${String(error)}`
      })
      setTimeout(() => setKeyMessage(null), 5000)
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
                  {isRecording
                    ? (displayHotkey ? formatHotkeyForDisplay(displayHotkey) : 'Press 3 keys (e.g., ⌘ + ⇧ + Space)...')
                    : formatHotkeyForDisplay(hotkey)}
                </button>
                <p className="text-xs text-zinc-500">Click to record a new shortcut (requires 3 keys).</p>
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

          {/* Encryption Key Backup */}
          <section className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-2">
              Encryption Key Backup
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="font-semibold text-purple-900 mb-2 text-sm">What is this?</h4>
                <p className="text-sm text-purple-800 mb-3">
                  All your data (history, notes, and settings) is automatically encrypted on your device.
                  Export your encryption key to recover your data if you change computers or reinstall the OS.
                </p>
                <p className="text-sm font-semibold text-purple-900">
                  ⚠️ Keep this key safe and secure - anyone with this key can decrypt your data!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleExportKey}
                  className="py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Export Encryption Key
                </button>
                <button
                  onClick={handleImportKey}
                  className="py-2.5 px-4 bg-zinc-600 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Import Encryption Key
                </button>
              </div>

              {keyMessage && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    keyMessage.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : keyMessage.type === 'error'
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : 'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}
                >
                  {keyMessage.text}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default SettingsView
