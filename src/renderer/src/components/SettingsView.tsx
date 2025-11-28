import React, { useEffect, useState } from 'react'

function SettingsView(): React.JSX.Element {
  const [startOnLogin, setStartOnLogin] = useState(false)
  const [triggerMode, setTriggerMode] = useState('toggle')
  const [hotkey, setHotkey] = useState('Super+M')
  const [holdKey, setHoldKey] = useState<number | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isRecordingHoldKey, setIsRecordingHoldKey] = useState(false)

  useEffect(() => {
    window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
      if (settings.startOnLogin !== undefined) setStartOnLogin(settings.startOnLogin)
      if (settings.triggerMode) setTriggerMode(settings.triggerMode)
      if (settings.hotkey) setHotkey(settings.hotkey)
      if (settings.holdKey) setHoldKey(settings.holdKey)
    })

    const handleRecorded = (_: any, key: string) => {
      setHotkey(key)
      setIsRecording(false)
      window.electron.ipcRenderer.invoke('update-setting', 'hotkey', key)
    }

    const handleHoldRecorded = (_: any, keycode: number) => {
      setHoldKey(keycode)
      setIsRecordingHoldKey(false)
      window.electron.ipcRenderer.invoke('update-setting', 'holdKey', keycode)
    }

    window.electron.ipcRenderer.on('hotkey-recorded', handleRecorded)
    window.electron.ipcRenderer.on('hold-key-recorded', handleHoldRecorded)

    return () => {
      window.electron.ipcRenderer.removeAllListeners('hotkey-recorded')
      window.electron.ipcRenderer.removeAllListeners('hold-key-recorded')
    }
  }, [])

  const updateSetting = (key: string, value: any) => {
    window.electron.ipcRenderer.invoke('update-setting', key, value)
  }

  const startRecording = () => {
    setIsRecording(true)
    window.electron.ipcRenderer.invoke('start-key-recording')
  }

  const startRecordingHoldKey = () => {
    setIsRecordingHoldKey(true)
    window.electron.ipcRenderer.invoke('start-key-recording')
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
                  {isRecording ? 'Press any key combination...' : hotkey}
                </button>
                <p className="text-xs text-zinc-500">Click to record a new shortcut.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700">Push-to-Talk Key</label>
                <button
                  onClick={startRecordingHoldKey}
                  className={`w-full py-3 px-4 rounded-xl border text-left transition-all ${isRecordingHoldKey
                      ? 'bg-red-50 border-red-500 text-red-600 animate-pulse'
                      : 'bg-white border-zinc-200 text-zinc-900 hover:border-zinc-300'
                    }`}
                >
                  {isRecordingHoldKey
                    ? 'Press any key...'
                    : holdKey
                      ? `Key Code: ${holdKey}`
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
