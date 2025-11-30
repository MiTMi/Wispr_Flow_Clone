import { useEffect, useState, useRef } from 'react'

import ExamplesWindow from './components/ExamplesWindow'

import Dashboard from './components/Dashboard'

function App(): React.JSX.Element {
  const [currentView, setCurrentView] = useState('flow')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioData, setAudioData] = useState<number[]>(new Array(24).fill(2)) // 24 bars
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // New state for the waiting pill and hint
  const [showHint, setShowHint] = useState(false)
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+Space') // Default value

  // Recording Logic extracted from useEffect
  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Setup Audio Context for Visualizer
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.8
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source

      // Start Visualizer Loop
      const updateVisualizer = (): void => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(dataArray)

        const bars: number[] = []
        const step = Math.floor(dataArray.length / 24)

        for (let i = 0; i < 12; i++) {
          const value = dataArray[i * step + 2]
          bars.push(Math.max(2, (value / 255) * 12))
        }

        const mirroredBars = [...bars.slice().reverse(), ...bars]
        setAudioData(mirroredBars)

        animationFrameRef.current = requestAnimationFrame(updateVisualizer)
      }
      updateVisualizer()

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e): void => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async (): Promise<void> => {
        console.time('Total Latency')
        console.log('[Performance] Recording stopped at:', new Date().toISOString())

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const buffer = await blob.arrayBuffer()

        console.log('[Performance] Sending audio to main process...')
        window.electron.ipcRenderer.send('audio-data', buffer)
      }

      mediaRecorder.start()
      setIsListening(true)
      setIsProcessing(false)
    } catch (err) {
      console.error('Error accessing microphone:', err)
    }
  }

  const stopRecording = (): void => {
    // Delay stopping to capture trailing audio after key release
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      }

      // Cleanup Audio Context
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (audioContextRef.current) audioContextRef.current.close()
    }, 100) // Reduced delay for speed
  }

  useEffect(() => {
    // Load initial settings for hotkey
    window.electron.ipcRenderer.invoke('get-settings').then((settings) => {
      if (settings.hotkey) setHotkey(settings.hotkey)
    })
    // ... (rest of checkHash logic)

    // Check hash for routing
    const checkHash = (): void => {
      const hash = window.location.hash
      if (hash === '#/settings' || hash === '#settings') {
        setCurrentView('settings')
      } else if (hash === '#/examples' || hash === '#examples') {
        setCurrentView('examples')
      } else {
        setCurrentView('flow')
      }
    }

    checkHash()
    window.addEventListener('hashchange', checkHash)
    return (): void => window.removeEventListener('hashchange', checkHash)
  }, [])

  // Register IPC listeners once on mount - they should always be active
  useEffect(() => {
    const onShow = (): void => {
      // Only start recording if we're in flow view
      if (window.location.hash === '' || window.location.hash === '#/' || window.location.hash === '#/flow') {
        startRecording()
      }
    }

    const onHide = (): void => {
      // Key released or stop requested -> Switch to processing state
      setIsListening(false)
      setIsProcessing(true)
      stopRecording()
    }

    const onReset = (): void => {
      // Processing complete -> Reset to idle state
      setIsListening(false)
      setIsProcessing(false)
    }

    window.electron.ipcRenderer.on('window-shown', onShow)
    window.electron.ipcRenderer.on('window-hidden', onHide)
    window.electron.ipcRenderer.on('reset-ui', onReset)

    // Signal to main process that renderer is ready
    console.log('[Renderer] IPC listeners registered, ready to receive events')

    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('window-shown')
      window.electron.ipcRenderer.removeAllListeners('window-hidden')
      window.electron.ipcRenderer.removeAllListeners('reset-ui')
    }
  }, []) // Empty dependency array - register once on mount

  // Sync recording state with Main for toggle logic
  useEffect(() => {
    window.electron.ipcRenderer.send('recording-state-changed', isListening)
  }, [isListening])

  // Sync window mode (size/position) with Main
  useEffect(() => {
    window.electron.ipcRenderer.send('set-window-mode', currentView)
  }, [currentView])

  // Interactive Area Handlers (Click-through logic)
  const ignoreMouseEvents = useRef(true) // Track current state
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Safety check
      if (!containerRef.current) return

      // Check if mouse is over the pill container
      const isOver = containerRef.current.contains(e.target as Node)

      if (isOver) {
        // We are hovering the pill
        if (ignoreMouseEvents.current) {
          ignoreMouseEvents.current = false
          window.electron.ipcRenderer.send('set-ignore-mouse-events', false)
        }
      } else {
        // We are outside the pill
        if (!ignoreMouseEvents.current) {
          ignoreMouseEvents.current = true
          window.electron.ipcRenderer.send('set-ignore-mouse-events', true, { forward: true })
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const handleCancel = (): void => {
    setIsListening(false)
    setIsProcessing(false)
    if (mediaRecorderRef.current) {
      chunksRef.current = [] // Clear chunks to prevent processing
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
    }
    window.electron.ipcRenderer.send('hide-window')
  }

  // ...

  if (currentView === 'settings') {
    return <Dashboard />
  }

  if (currentView === 'examples') {
    return <ExamplesWindow />
  }

  const formatHotkeyForDisplay = (key: string): string => {
    try {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      if (isMac) {
        return key.replace('CommandOrControl', '⌘').replace('Shift', '⇧').replace('Space', 'Space')
      }
      return key.replace('CommandOrControl', 'Ctrl')
    } catch (e) {
      return key
    }
  }

  return (
    <div className="h-screen w-screen flex items-end justify-center pb-2 bg-transparent select-none overflow-hidden">
      <div className="relative" ref={containerRef}>
        {(isListening || isProcessing) ? (
          // Active recording/processing pill
          <div
            className={`flex items-center gap-3 px-4 py-2 bg-black/90 backdrop-blur-xl rounded-full border border-zinc-800 shadow-2xl min-w-[200px] justify-between transition-all duration-300 pointer-events-auto ${isProcessing ? 'scale-105 border-blue-500/50' : ''}`}
          >
            {/* Close Button */}
            <button
              onClick={handleCancel}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors group"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-400 group-hover:text-white"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            {/* Visualizer / Processing State */}
            <div className="flex items-end gap-[2px] h-5 justify-center flex-1 mx-2 pb-1">
              {isProcessing ? (
                // Processing Animation (Indeterminate Wave)
                <div className="flex gap-1 items-center h-full">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-blue-500 rounded-full animate-pulse"
                      style={{ height: '12px', animationDelay: `${i * 0.1}s` }}
                    ></div>
                  ))}
                </div>
              ) : (
                // Audio Visualizer
                audioData.map((height, i) => (
                  <div
                    key={i}
                    className="w-1 bg-white rounded-full transition-all duration-75 ease-out"
                    style={{ height: `${height}px` }}
                  ></div>
                ))
              )}
            </div>

            {/* Status Indicator (Wrapped for centering) */}
            <div className="w-6 h-6 flex items-center justify-center">
              <div
                className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-blue-500 animate-ping' : isListening ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`}
              ></div>
            </div>
          </div>
        ) : (
          // Waiting for recording pill
          <div
            className="relative pointer-events-auto"
            onMouseEnter={() => setShowHint(true)}
            onMouseLeave={() => setShowHint(false)}
            onClick={startRecording}
          >
            {showHint && (
              <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-md text-zinc-100 text-sm font-medium px-4 py-2 rounded-full shadow-xl whitespace-nowrap border border-zinc-800 animate-in fade-in slide-in-from-bottom-2 duration-200">
                Click or hold <span className="text-white font-bold mx-1">{formatHotkeyForDisplay(hotkey || 'Super+M')}</span> to start dictating
              </div>
            )}
            <div className="w-20 h-6 bg-black/40 hover:bg-black/60 border border-zinc-700/50 hover:border-zinc-500 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer backdrop-blur-sm">
              <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App