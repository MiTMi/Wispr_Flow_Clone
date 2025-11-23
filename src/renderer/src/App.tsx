import { useEffect, useState, useRef } from 'react'

import Settings from './components/Settings'

function App(): React.JSX.Element {
  const [currentView, setCurrentView] = useState('flow')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioData, setAudioData] = useState<number[]>(new Array(24).fill(4)) // 24 bars
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    // Check hash for routing
    const checkHash = (): void => {
      const hash = window.location.hash
      if (hash === '#/settings' || hash === '#settings') {
        setCurrentView('settings')
      } else {
        setCurrentView('flow')
      }
    }

    checkHash()
    window.addEventListener('hashchange', checkHash)
    return (): void => window.removeEventListener('hashchange', checkHash)
  }, [])

  useEffect(() => {
    if (currentView !== 'flow') return

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
            bars.push(Math.max(4, (value / 255) * 24))
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
      }, 500) // 500ms delay
    }

    const onShow = (): void => {
      setIsListening(true)
      setIsProcessing(false)
      startRecording()
    }

    const onHide = (): void => {
      // When key is released (hide requested), we stop recording but keep window open for processing
      setIsListening(false)
      setIsProcessing(true)
      stopRecording()
    }

    window.electron.ipcRenderer.on('window-shown', onShow)
    window.electron.ipcRenderer.on('window-hidden', onHide)

    window.electron.ipcRenderer.on('processing-complete', (_: any, mainTime: number) => {
      console.timeEnd('Total Latency')
      console.log(`[Performance] Main Process took: ${mainTime.toFixed(2)}ms`)

      // Keep visible for a moment to show completion, then hide
      setTimeout(() => {
        setIsProcessing(false)
        window.electron.ipcRenderer.send('hide-window')
      }, 500)
    })

    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('window-shown')
      window.electron.ipcRenderer.removeAllListeners('window-hidden')
      window.electron.ipcRenderer.removeAllListeners('processing-complete')
    }
  }, [currentView])

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

  if (currentView === 'settings') {
    return <Settings />
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-transparent select-none justify-end pb-10 items-center">
      <div className={`flex items-center gap-5 px-5 py-3 bg-black/90 backdrop-blur-xl rounded-full border border-zinc-800 shadow-2xl min-w-[300px] justify-between transition-all duration-300 ${isProcessing ? 'scale-105 border-blue-500/50' : ''}`}>
        {/* Close Button */}
        <button
          onClick={handleCancel}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors group"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-white">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Visualizer / Processing State */}
        <div className="flex items-center gap-[3px] h-8 justify-center flex-1 mx-4">
          {isProcessing ? (
            // Processing Animation (Indeterminate Wave)
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-1.5 bg-blue-500 rounded-full animate-pulse" style={{ height: '16px', animationDelay: `${i * 0.1}s` }}></div>
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

        {/* Status Indicator */}
        <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-blue-500 animate-ping' : isListening ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`}></div>
      </div>
    </div>
  )
}

export default App
