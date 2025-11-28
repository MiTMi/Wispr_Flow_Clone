import React, { useEffect, useState, useRef } from 'react'

interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration: number
  wpm: number
}

interface Stats {
  totalWords: number
  weeklyWords: number
  averageWpm: number
}

function HistoryView(): React.JSX.Element {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [stats, setStats] = useState<Stats>({ totalWords: 0, weeklyWords: 0, averageWpm: 0 })
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadData = async () => {
      const historyData = await window.electron.ipcRenderer.invoke('get-history')
      const statsData = await window.electron.ipcRenderer.invoke('get-stats')
      setHistory(historyData)
      setStats(statsData)
    }
    loadData()

    const interval = setInterval(loadData, 5000)

    // Close menu when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      clearInterval(interval)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }
  const handleDelete = (id: string) => {
    window.electron.ipcRenderer.invoke('delete-history-item', id)
    setHistory((prev) => prev.filter((item) => item.id !== id))
    setOpenMenuId(null)
  }

  const groupHistory = (items: HistoryItem[]) => {
    const groups: { [key: string]: HistoryItem[] } = {
      TODAY: [],
      YESTERDAY: []
    }

    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()

    items.forEach((item) => {
      const date = new Date(item.timestamp).toDateString()
      if (date === today) {
        groups['TODAY'].push(item)
      } else if (date === yesterday) {
        groups['YESTERDAY'].push(item)
      }
    })

    return groups
  }

  const groupedHistory = groupHistory(history)

  const renderHistoryItem = (item: HistoryItem, index: number, groupLength: number) => (
    <div
      key={item.id}
      className={`bg-white p-4 flex gap-6 hover:bg-zinc-50 transition-colors group relative ${index !== groupLength - 1 ? 'border-b border-zinc-100' : ''}`}
    >
      <span className="text-xs font-medium text-zinc-400 w-16 pt-1">
        {formatTime(item.timestamp)}
      </span>
      <p className="text-zinc-800 text-sm leading-relaxed flex-1 pr-20">{item.text}</p>

      {/* Actions */}
      <div
        className={`absolute right-4 top-4 flex items-center gap-1 transition-opacity ${openMenuId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <button
          onClick={() => handleCopy(item.id, item.text)}
          className={`p-1.5 rounded-md transition-colors ${copiedId === item.id ? 'text-green-600 bg-green-50' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200'}`}
          title="Copy to clipboard"
        >
          {copiedId === item.id ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          )}
        </button>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpenMenuId(openMenuId === item.id ? null : item.id)
            }}
            className={`p-1.5 rounded-md transition-colors ${openMenuId === item.id ? 'text-zinc-900 bg-zinc-200' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200'}`}
            title="Options"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="12" cy="5" r="1"></circle>
              <circle cx="12" cy="19" r="1"></circle>
            </svg>
          </button>

          {openMenuId === item.id && (
            <div
              ref={menuRef}
              className="absolute right-0 top-8 bg-white shadow-xl border border-zinc-200 rounded-lg w-48 z-20 py-1 flex flex-col animate-in fade-in zoom-in-95 duration-100"
            >
              <button className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 7v6h6"></path>
                  <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
                </svg>
                Undo AI edit
              </button>
              <button className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 4v6h-6"></path>
                  <path d="M1 20v-6h6"></path>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                Retry transcript
              </button>
              <div className="h-px bg-zinc-100 my-1" />
              <button
                onClick={() => handleDelete(item.id)}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete transcript
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex-1 h-full bg-white overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">Welcome back,</h1>
          <div className="flex gap-4 bg-zinc-50 px-4 py-2 rounded-full border border-zinc-100">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">👋</span>
              <span className="text-sm font-medium text-zinc-600">{stats.weeklyWords} week</span>
            </div>
            <div className="w-px bg-zinc-200 h-5 my-auto" />
            <div className="flex items-center gap-1.5">
              <span className="text-lg">🚀</span>
              <span className="text-sm font-medium text-zinc-600">{stats.totalWords} words</span>
            </div>
            <div className="w-px bg-zinc-200 h-5 my-auto" />
            <div className="flex items-center gap-1.5">
              <span className="text-lg">👍</span>
              <span className="text-sm font-medium text-zinc-600">{stats.averageWpm} WPM</span>
            </div>
          </div>
        </div>

        {/* Welcome Banner */}
        <div className="bg-[#FEFCE8] border border-yellow-100 rounded-2xl p-8 mb-12 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-3xl font-serif text-zinc-900 mb-2">
              Make Flow sound like <span className="italic">you</span>
            </h2>
            <p className="text-zinc-600 max-w-lg mb-6 text-sm leading-relaxed">
              Flow adapts to how you write in different apps. Personalize your style for{' '}
              <span className="font-semibold text-zinc-900">
                messages, work chats, emails, and other apps
              </span>{' '}
              so every word sounds like you.
            </p>
            <button className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors flex items-center gap-2">
              Start now
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
            </button>
          </div>
        </div>

        {/* History Feed */}
        <div className="space-y-8 pb-20">
          {groupedHistory['TODAY'].length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 tracking-wider mb-4 uppercase">
                Today
              </h3>
              <div className="space-y-0 border border-zinc-200 rounded-xl overflow-visible">
                {groupedHistory['TODAY'].map((item, index) =>
                  renderHistoryItem(item, index, groupedHistory['TODAY'].length)
                )}
              </div>
            </div>
          )}

          {groupedHistory['YESTERDAY'].length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 tracking-wider mb-4 uppercase">
                Yesterday
              </h3>
              <div className="space-y-0 border border-zinc-200 rounded-xl overflow-visible">
                {groupedHistory['YESTERDAY'].map((item, index) =>
                  renderHistoryItem(item, index, groupedHistory['YESTERDAY'].length)
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default HistoryView
