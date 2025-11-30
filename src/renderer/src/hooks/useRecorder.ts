import { useState, useRef, useCallback } from 'react'

export interface UseRecorderReturn {
  isRecording: boolean
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  audioData: number[]
}

export const useRecorder = (): UseRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false)
  const [audioData, setAudioData] = useState<number[]>(new Array(24).fill(2))
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Setup Audio Context
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.8
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source

      // Visualizer Loop
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

      // MediaRecorder
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Error accessing microphone:', err)
    }
  }, [])

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        setIsRecording(false)
        resolve(null)
        return
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        
        // Cleanup
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        if (audioContextRef.current) audioContextRef.current.close()
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
        }
        
        setIsRecording(false)
        resolve(blob)
      }

      try {
        mediaRecorderRef.current.stop()
      } catch (e) {
        console.error('Error stopping recorder:', e)
        setIsRecording(false)
        resolve(null)
      }
    })
  }, [])

  return {
    isRecording,
    startRecording,
    stopRecording,
    audioData
  }
}
