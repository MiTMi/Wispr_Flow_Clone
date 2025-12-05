import React, { useEffect, useState } from 'react'

function StyleView(): React.JSX.Element {
  const [style, setStyle] = useState('smart')
  const [language, setLanguage] = useState('auto')

  useEffect(() => {
    window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
      // Migrate old styles to 'smart'
      const currentStyle = settings.style
      if (currentStyle && currentStyle !== 'verbatim') {
        setStyle('smart')
        // Update backend to smart if it's using an old style
        if (
          currentStyle !== 'smart' &&
          ['polished', 'casual', 'bullet-points', 'summary'].includes(currentStyle)
        ) {
          updateSetting('style', 'smart')
        }
      } else {
        setStyle(currentStyle || 'smart')
      }
      if (settings.language) setLanguage(settings.language)
    })
  }, [])

  const updateSetting = (key: string, value: unknown): void => {
    window.electron.ipcRenderer.invoke('update-setting', key, value)
  }

  return (
    <div className="flex-1 h-full bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto p-10">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Formatting</h1>
        <p className="text-zinc-500 mb-10">
          Choose how Flow processes your dictation.
        </p>

        <div className="space-y-8">
          {/* Style Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-700">Formatting Mode</label>
            <div className="grid grid-cols-1 gap-3">
              {[
                {
                  id: 'smart',
                  label: '✨ Smart Formatting (Recommended)',
                  desc: 'Automatically detects context and applies intelligent formatting: cleans up stutters, removes false starts, formats lists, and structures emails/messages naturally.'
                },
                {
                  id: 'verbatim',
                  label: 'Verbatim',
                  desc: 'Exact word-for-word transcription with no formatting or corrections applied.'
                }
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    setStyle(option.id)
                    updateSetting('style', option.id)
                  }}
                  className={`p-5 rounded-xl border text-left transition-all ${style === option.id
                      ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                      : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                >
                  <div
                    className={`font-medium mb-2 ${style === option.id ? 'text-purple-900' : 'text-zinc-900'}`}
                  >
                    {option.label}
                  </div>
                  <div
                    className={`text-sm leading-relaxed ${style === option.id ? 'text-purple-700' : 'text-zinc-500'}`}
                  >
                    {option.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Language Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-700">Input Language</label>
            <div className="relative">
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value)
                  updateSetting('language', e.target.value)
                }}
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm appearance-none focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-zinc-900"
              >
                <option value="auto">✨ Auto-Detect (Multilingual)</option>
                <option value="en">🇺🇸 English</option>
                <option value="he">🇮🇱 Hebrew</option>
                <option value="fr">🇫🇷 French</option>
                <option value="es">🇪🇸 Spanish</option>
                <option value="de">🇩🇪 German</option>
                <option value="it">🇮🇹 Italian</option>
                <option value="pt">🇵🇹 Portuguese</option>
                <option value="ru">🇷🇺 Russian</option>
                <option value="ja">🇯🇵 Japanese</option>
                <option value="ko">🇰🇷 Korean</option>
                <option value="zh">🇨🇳 Chinese</option>
              </select>
              <div className="absolute right-4 top-3.5 pointer-events-none text-zinc-400">
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
              Select "Auto-Detect" to speak in any supported language.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StyleView
