import React, { useEffect, useState } from 'react'

function DictionaryView(): React.JSX.Element {
    const [customInstructions, setCustomInstructions] = useState('')

    useEffect(() => {
        window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
            if (settings.customInstructions) setCustomInstructions(settings.customInstructions)
        })
    }, [])

    const updateSetting = (key: string, value: any) => {
        window.electron.ipcRenderer.send('update-setting', key, value)
    }

    return (
        <div className="flex-1 h-full bg-white overflow-y-auto">
            <div className="max-w-2xl mx-auto p-10">
                <h1 className="text-3xl font-bold text-zinc-900 mb-2">Dictionary</h1>
                <p className="text-zinc-500 mb-10">Teach Flow specific words or instructions.</p>

                <div className="space-y-8">
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-zinc-700">Custom Instructions</label>
                        <div className="relative">
                            <textarea
                                value={customInstructions}
                                onChange={(e) => { setCustomInstructions(e.target.value); updateSetting('customInstructions', e.target.value); }}
                                placeholder='e.g. "Always spell Wispr without an e", "Use British spelling", "Never use emojis"'
                                className="w-full h-48 bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none placeholder:text-zinc-400 text-zinc-900"
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
                        <p className="text-xs text-zinc-500">These instructions will be appended to the system prompt.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default DictionaryView
