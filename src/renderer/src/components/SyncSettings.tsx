import { useState, useEffect } from 'react'
import type { SyncStatus } from '../../../preload/index.d'

export function SyncSettings() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadSyncStatus()

    // Poll status every 5 seconds
    const interval = setInterval(loadSyncStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadSyncStatus = async () => {
    try {
      const status = await window.electron.getSyncStatus()
      setSyncStatus(status)
    } catch (error) {
      console.error('Failed to load sync status:', error)
    }
  }

  const handleToggleSync = async () => {
    setLoading(true)
    try {
      if (syncStatus?.enabled) {
        await window.electron.disableSync()
      } else {
        const result = await window.electron.enableSync()
        if (!result.success) {
          alert(`Failed to enable sync: ${result.error}`)
        }
      }
      await loadSyncStatus()
    } catch (error) {
      alert(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleManualSync = async () => {
    setLoading(true)
    try {
      const result = await window.electron.manualSync()
      if (!result.success) {
        alert(`Sync failed: ${result.error}`)
      }
      await loadSyncStatus()
    } catch (error) {
      alert(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  if (!syncStatus) {
    return <div className="text-sm text-zinc-500">Loading sync settings...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-zinc-900">Enable iCloud Sync</div>
          <div className="text-sm text-zinc-500">
            Sync your settings, history, and notes across all your devices
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={syncStatus.enabled}
            onChange={handleToggleSync}
            disabled={loading}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
        </label>
      </div>

      {syncStatus.enabled && (
        <>
          <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-600">Last Sync:</span>
              <span className="text-sm font-medium text-zinc-900">
                {formatLastSync(syncStatus.lastSyncTime)}
              </span>
            </div>

            {syncStatus.syncInProgress && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600">Status:</span>
                <span className="text-sm font-medium text-purple-600 flex items-center">
                  <svg
                    className="animate-spin h-4 w-4 mr-2"
                    xmlns="http://www.w3.org/2000/svg"
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
                  Syncing...
                </span>
              </div>
            )}

            {syncStatus.lastError && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600">Error:</span>
                <span className="text-sm font-medium text-red-600">
                  {syncStatus.lastError}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-600">Device ID:</span>
              <span className="text-sm font-mono text-zinc-500">
                {syncStatus.deviceId.slice(0, 8)}...
              </span>
            </div>
          </div>

          <button
            onClick={handleManualSync}
            disabled={loading || syncStatus.syncInProgress}
            className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {syncStatus.syncInProgress ? 'Syncing...' : 'Sync Now'}
          </button>

          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h4 className="font-semibold text-purple-900 mb-2 text-sm">What's Synced?</h4>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• App settings and preferences</li>
              <li>• Transcription history (last 1000 items)</li>
              <li>• All your notes</li>
            </ul>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 className="font-semibold text-green-900 mb-2 text-sm">Privacy & Security</h4>
            <p className="text-sm text-green-800">
              Your data is encrypted end-to-end using Apple's CloudKit. Only you can access
              your data using your iCloud account.
            </p>
          </div>
        </>
      )}

      {!syncStatus.enabled && (
        <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200">
          <p className="text-sm text-zinc-600">
            Enable iCloud Sync to automatically backup and sync your data across all your
            devices signed into the same iCloud account.
          </p>
        </div>
      )}
    </div>
  )
}
