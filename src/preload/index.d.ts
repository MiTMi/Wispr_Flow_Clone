import { ElectronAPI } from '@electron-toolkit/preload'

export interface SyncStatus {
  enabled: boolean
  lastSyncTime: number | null
  syncInProgress: boolean
  lastError: string | null
  deviceId: string
}

declare global {
  interface Window {
    electron: ElectronAPI & {
      getSyncStatus: () => Promise<SyncStatus>
      enableSync: () => Promise<{ success: boolean; error?: string }>
      disableSync: () => Promise<{ success: boolean }>
      manualSync: () => Promise<{ success: boolean; error?: string }>
    }
    api: unknown
  }
}
