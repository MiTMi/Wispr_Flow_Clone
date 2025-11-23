import { useEffect, useState, useRef } from 'react'

import Settings from './components/Settings'

function App(): React.JSX.Element {
  const [currentView, setCurrentView] = useState('flow')
  const [isListening, setIsListening] = useState(false)
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
        analyser.fftSize = 128 // Higher resolution
        analyser.smoothingTimeConstant = 0.8 // Smoother transition
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        audioContextRef.current = audioContext
        analyserRef.current = analyser
        sourceRef.current = source

        // Start Visualizer Loop
        const updateVisualizer = (): void => {
          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(dataArray)

          // Create 12 bars from low frequencies (voice range)
          const bars: number[] = []
          const step = Math.floor(dataArray.length / 24) // Use more of the spectrum

          for (let i = 0; i < 12; i++) {
            const value = dataArray[i * step + 2] // Skip very low freq
            // Scale value to height (min 4, max 24)
            bars.push(Math.max(4, (value / 255) * 24))
          }

          // Mirror the bars for symmetry
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
          const startTime = performance.now()
          console.log('[Performance] Recording stopped at:', new Date().toISOString())

          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const buffer = await blob.arrayBuffer()

          console.log('[Performance] Sending audio to main process...')
          window.electron.ipcRenderer.send('audio-data', buffer)

          // Listen for completion (we need to add a listener for this in main or just infer from UI state if we had one)
          // Actually, the main process handles everything after 'audio-data'. 
          // We should ask main to send a 'processing-complete' event to measure full round trip.
        }

        mediaRecorder.start()
      } catch (err) {
        console.error('Error accessing microphone:', err)
      }
    }

    const stopRecording = (): void => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      }

      // Cleanup Audio Context
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (audioContextRef.current) audioContextRef.current.close()
    }

    const onShow = (): void => {
      setIsListening(true)
      startRecording()
    }

    const onHide = (): void => {
      setIsListening(false)
      stopRecording()
    }

    window.electron.ipcRenderer.on('window-shown', onShow)
    window.electron.ipcRenderer.on('window-hidden', onHide)

    window.electron.ipcRenderer.on('processing-complete', (_: any, mainTime: number) => {
      console.timeEnd('Total Latency')
      console.log(`[Performance] Main Process took: ${mainTime.toFixed(2)}ms`)
    })

    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('window-shown')
      window.electron.ipcRenderer.removeAllListeners('window-hidden')
      window.electron.ipcRenderer.removeAllListeners('processing-complete')
    }
  }, [currentView])

  const handleStop = (): void => {
    setIsListening(false)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
    }
    window.electron.ipcRenderer.send('hide-window')
  }

  const handleCancel = (): void => {
    setIsListening(false)
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
    <div className="flex items-center justify-center h-screen w-screen bg-transparent select-none">
      <div className="flex items-center gap-5 px-5 py-3 bg-black rounded-full border border-zinc-800 shadow-2xl min-w-[300px] justify-between">
        {/* Close Button (Grey Circle with X) */}
        <button
          onClick={handleCancel}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors group"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300 group-hover:text-white">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Visualizer (Mirrored Bars) */}
        <div className="flex items-center gap-[2px] h-8 justify-center flex-1 mx-2">
          {audioData.map((height, i) => (
            <div
              key={i}
              className="w-1 bg-white rounded-full transition-all duration-75 ease-out"
              style={{ height: `${height}px` }}
            ></div>
          ))}
        </div>

        {/* Stop Button (Red Circle with Square) */}
        <button
          onClick={handleStop}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 transition-colors shadow-[0_0_10px_rgba(239,68,68,0.4)]"
        >
          <div className="w-3 h-3 bg-white rounded-[2px]"></div>
        </button>
      </div>
    </div>
  )
}

export default App
