import React, { useEffect, useState } from 'react'

interface DownloadProgress {
  model: string
  progress: number
  downloadedMB?: number
  totalMB?: number
  isLoading?: boolean
}

function ModelDownloadProgress(): React.JSX.Element {
  const [downloadInfo, setDownloadInfo] = useState<DownloadProgress | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleProgress = (_: any, info: DownloadProgress) => {
      setDownloadInfo(info)
      setIsVisible(true)

      // Hide when complete (progress reaches 100%)
      if (info.progress >= 1.0) {
        setTimeout(() => {
          setIsVisible(false)
          setDownloadInfo(null)
        }, 2000) // Keep visible for 2s after completion
      }
    }

    window.electron.ipcRenderer.on('model-download-progress', handleProgress)

    return () => {
      window.electron.ipcRenderer.removeAllListeners('model-download-progress')
    }
  }, [])

  if (!isVisible || !downloadInfo) {
    return <></>
  }

  const progressPercent = Math.round(downloadInfo.progress * 100)
  const isComplete = downloadInfo.progress >= 1.0
  const isLoading = downloadInfo.isLoading === true

  return (
    <div className="fixed top-4 right-4 z-50 bg-white rounded-xl shadow-2xl border border-zinc-200 p-4 w-80 animate-slide-in-right">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {isComplete ? (
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          ) : (
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-purple-600 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 mb-1">
            {isComplete ? 'Model Ready!' : 'Loading WhisperKit Model'}
          </h3>
          <p className="text-xs text-zinc-500 mb-2">
            {downloadInfo.model}
            {downloadInfo.downloadedMB && downloadInfo.totalMB
              ? ` (${downloadInfo.downloadedMB.toFixed(1)} MB / ${downloadInfo.totalMB.toFixed(1)} MB)`
              : ''}
          </p>

          {/* Progress Bar - only show if not indeterminate */}
          {!isLoading && (
            <>
              <div className="w-full bg-zinc-200 rounded-full h-2 mb-1">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    isComplete ? 'bg-green-500' : 'bg-purple-600'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <p className="text-xs text-zinc-400">{progressPercent}%</p>
            </>
          )}

          {/* Loading message and percentage for first-time download */}
          {isLoading && (
            <>
              <p className="text-xs text-zinc-500 italic mb-1">
                First-time download in progress...
              </p>
              <p className="text-sm font-semibold text-purple-600">{progressPercent}%</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ModelDownloadProgress
