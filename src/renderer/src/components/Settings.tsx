import { useEffect, useState } from 'react'

function Settings(): React.JSX.Element {
    const [hotkey, setHotkey] = useState('CommandOrControl+Shift+Space')
    const [triggerMode, setTriggerMode] = useState<'toggle' | 'hold'>('toggle')
    const [holdKey, setHoldKey] = useState<number | null>(null)

    const [isRecording, setIsRecording] = useState(false)
    const [isRecordingHoldKey, setIsRecordingHoldKey] = useState(false)

    useEffect(() => {
        // Load initial settings
        window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
            if (settings.hotkey) setHotkey(settings.hotkey)
            if (settings.triggerMode) setTriggerMode(settings.triggerMode)
            if (settings.holdKey) setHoldKey(settings.holdKey)
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
            const mods = keys.filter(k => modifiers.includes(k))
            const others = keys.filter(k => !modifiers.includes(k))
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
                    const hasNonModifier = lastValidCombo.some(k => !modifiers.includes(k))

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

    const handleModeChange = (mode: 'toggle' | 'hold') => {
        setTriggerMode(mode)
        window.electron.ipcRenderer.invoke('update-setting', 'triggerMode', mode)
    }

    const startHoldKeyRecording = () => {
        setIsRecordingHoldKey(true)
        window.electron.ipcRenderer.invoke('start-key-recording')
    }

    const getKeyName = (keycode: number | null): string => {
        if (!keycode) return 'Not Set'

        // Mapping based on uiohook-napi keycodes
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
            58: 'Caps Lock',
            59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6',
            65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12'
        }

        if (map[keycode]) return map[keycode]

        // Fallback for letters (approximate, uiohook uses scancodes which often match ASCII for letters but not always)
        // Actually, uiohook keycodes for A-Z are 30-? No, A is 30.
        // Let's just return the code if unknown for now, or try to be smarter.
        // A=30, S=31, D=32, F=33...

        return `Key Code: ${keycode}`
    }

    return (
        <div className="h-screen w-screen bg-zinc-900 text-white p-6 select-none flex flex-col">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold">Settings</h1>
                <button
                    onClick={() => window.close()}
                    className="text-zinc-400 hover:text-white transition-colors"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <div className="space-y-6">
                {/* Trigger Mode Selection */}
                <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700/50">
                    <label className="block text-sm font-medium text-zinc-300 mb-3">
                        Trigger Mode
                    </label>
                    <div className="flex bg-zinc-900 rounded-md p-1 border border-zinc-700">
                        <button
                            onClick={() => handleModeChange('toggle')}
                            className={`flex-1 py-2 rounded-sm text-sm font-medium transition-colors ${triggerMode === 'toggle' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                        >
                            Toggle (Shortcut)
                        </button>
                        <button
                            onClick={() => handleModeChange('hold')}
                            className={`flex-1 py-2 rounded-sm text-sm font-medium transition-colors ${triggerMode === 'hold' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                        >
                            Push-to-Talk (Hold)
                        </button>
                    </div>
                </div>

                {/* Dynamic Settings based on Mode */}
                {triggerMode === 'toggle' ? (
                    <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700/50">
                        <label className="block text-sm font-medium text-zinc-300 mb-3">
                            Global Shortcut
                        </label>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setIsRecording(true)}
                                className={`px-4 py-3 rounded-md border text-lg font-mono transition-all duration-200 ${isRecording
                                        ? 'bg-red-500/10 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                                        : 'bg-zinc-900 border-zinc-700 hover:border-zinc-600 text-zinc-100'
                                    } w-full text-center outline-none focus:ring-2 focus:ring-blue-500/50`}
                            >
                                {isRecording ? 'Press keys...' : hotkey}
                            </button>
                            <p className="text-xs text-zinc-500 text-center mt-1">
                                {isRecording ? 'Release keys to save' : 'Click to record a new shortcut'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700/50">
                        <label className="block text-sm font-medium text-zinc-300 mb-3">
                            Hold Key
                        </label>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={startHoldKeyRecording}
                                className={`px-4 py-3 rounded-md border text-lg font-mono transition-all duration-200 ${isRecordingHoldKey
                                        ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                                        : 'bg-zinc-900 border-zinc-700 hover:border-zinc-600 text-zinc-100'
                                    } w-full text-center outline-none focus:ring-2 focus:ring-blue-500/50`}
                            >
                                {isRecordingHoldKey ? 'Press single key...' : getKeyName(holdKey)}
                            </button>
                            <p className="text-xs text-zinc-500 text-center mt-1">
                                {isRecordingHoldKey ? 'Press any key to set as trigger' : 'Click to set the key to hold'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
export default Settings
