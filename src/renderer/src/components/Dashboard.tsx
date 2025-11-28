import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import HistoryView from './HistoryView'
import StyleView from './StyleView'
import DictionaryView from './DictionaryView'
import SettingsView from './SettingsView'
import NotesView from './NotesView'

function Dashboard(): React.JSX.Element {
  const [activeView, setActiveView] = useState('home')

  const renderContent = () => {
    switch (activeView) {
      case 'home':
        return <HistoryView />
      case 'style':
        return <StyleView />
      case 'notes':
        return <NotesView />
      case 'dictionary':
        return <DictionaryView />
      case 'settings':
        return <SettingsView />
      case 'snippets':
      case 'help':
      default:
        return (
          <div className="flex-1 bg-white flex flex-col items-center justify-center text-zinc-400">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-900 mb-1">Coming Soon</h2>
            <p className="text-sm">This feature is under development.</p>
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen w-screen bg-white font-sans text-zinc-900 select-none overflow-hidden">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      {renderContent()}
    </div>
  )
}

export default Dashboard
