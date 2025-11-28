import React from 'react'

function ExamplesWindow(): React.JSX.Element {
  return (
    <div className="h-screen w-screen bg-zinc-950 text-white p-6 select-none flex flex-col overflow-y-auto font-sans">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Custom Instruction Examples
        </h1>
        <button
          onClick={() => window.close()}
          className="text-zinc-500 hover:text-white transition-colors p-1 hover:bg-zinc-800 rounded-full"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className="space-y-4 text-sm text-zinc-300">
        <p className="text-zinc-500 mb-4">
          Copy and paste these into the Custom Instructions box to guide the AI.
        </p>

        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors">
          <h3 className="font-semibold text-blue-400 mb-2">Names & Spelling</h3>
          <ul className="list-disc list-inside space-y-1 text-zinc-300">
            <li>"Always spell the app name as 'Wispr'."</li>
            <li>"My name is spelled 'Michael', not 'Micheal'."</li>
            <li>"Refer to the company as 'Google DeepMind'."</li>
          </ul>
        </div>

        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors">
          <h3 className="font-semibold text-purple-400 mb-2">Formatting & Grammar</h3>
          <ul className="list-disc list-inside space-y-1 text-zinc-300">
            <li>"Always use British spelling (colour, centre)."</li>
            <li>"Format dates as DD/MM/YYYY."</li>
            <li>"Start every bullet point with an emoji."</li>
          </ul>
        </div>

        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors">
          <h3 className="font-semibold text-green-400 mb-2">Tone & Style</h3>
          <ul className="list-disc list-inside space-y-1 text-zinc-300">
            <li>"Never use emojis."</li>
            <li>"Keep sentences short and punchy."</li>
            <li>"Sound extremely professional and formal."</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ExamplesWindow
