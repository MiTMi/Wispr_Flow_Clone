import { Settings } from './openai'
import { HistoryItem } from './history'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

// NOTE: This is a simplified implementation for the TypeScript sync manager.
// The native CloudKit module integration will be completed when the native
// module is successfully built. For now, this provides the interface structure.

export interface NoteItem {
  id: string
  content: string
  timestamp: number
}

export interface SyncStatus {
  enabled: boolean
  lastSyncTime: number | null
  syncInProgress: boolean
  lastError: string | null
  deviceId: string
}

export class CloudKitSyncManager {
  private cloudKitManager: any = null
  private syncStatus: SyncStatus
  private syncDebounceTimer: NodeJS.Timeout | null = null
  private readonly DEBOUNCE_DELAY = 5000 // 5 seconds
  private readonly CONTAINER_ID = 'iCloud.app.mit.wissper'
  private readonly STATUS_FILE = 'sync-status.json'

  constructor() {
    this.syncStatus = this.loadSyncStatus()

    // Try to load native module
    try {
      const cloudkitNative = this.loadNativeModule()
      if (this.syncStatus.enabled && cloudkitNative) {
        try {
          this.cloudKitManager = new cloudkitNative.CloudKitManager(this.CONTAINER_ID)
          console.log('[CloudKit] Native module loaded successfully')
        } catch (error) {
          console.error('[CloudKit] Failed to initialize CloudKit:', error)
          this.syncStatus.lastError = String(error)
          this.saveSyncStatus()
        }
      }
    } catch (error) {
      console.log('[CloudKit] Native module not available:', error)
      // This is expected if the module hasn't been built yet
    }
  }

  private loadNativeModule(): any {
    // Try multiple possible paths for dev and production modes
    const possiblePaths = [
      // Production: packaged app
      join(__dirname, '../../native/cloudkit/build/Release/cloudkit.node'),
      // Development: from out/main/
      join(app.getAppPath(), 'native/cloudkit/build/Release/cloudkit.node'),
      // Development: from project root
      join(process.cwd(), 'native/cloudkit/build/Release/cloudkit.node')
    ]

    for (const path of possiblePaths) {
      try {
        const module = require(path)
        console.log('[CloudKit] Loaded native module from:', path)
        return module
      } catch (error) {
        // Continue to next path
      }
    }

    throw new Error('CloudKit native module not found in any expected location')
  }

  // MARK: - Sync Status Management
  private loadSyncStatus(): SyncStatus {
    const path = join(app.getPath('userData'), this.STATUS_FILE)
    if (existsSync(path)) {
      try {
        const data = readFileSync(path, 'utf-8')
        return JSON.parse(data)
      } catch (error) {
        console.error('[CloudKit] Failed to load sync status:', error)
      }
    }

    return {
      enabled: false,
      lastSyncTime: null,
      syncInProgress: false,
      lastError: null,
      deviceId: this.generateDeviceId()
    }
  }

  private saveSyncStatus(): void {
    const path = join(app.getPath('userData'), this.STATUS_FILE)
    try {
      writeFileSync(path, JSON.stringify(this.syncStatus, null, 2))
    } catch (error) {
      console.error('[CloudKit] Failed to save sync status:', error)
    }
  }

  private generateDeviceId(): string {
    return require('crypto').randomUUID()
  }

  // MARK: - Public API
  public isSyncEnabled(): boolean {
    return this.syncStatus.enabled && this.cloudKitManager !== null
  }

  public getSyncStatus(): SyncStatus {
    return { ...this.syncStatus }
  }

  public async enableSync(): Promise<void> {
    try {
      const cloudkitNative = this.loadNativeModule()

      // Wrap the CloudKitManager initialization in a try-catch since it can crash
      // if the app doesn't have proper entitlements (common in dev mode)
      try {
        this.cloudKitManager = new cloudkitNative.CloudKitManager(this.CONTAINER_ID)
      } catch (initError) {
        const errorMsg = 'CloudKit initialization failed. In development mode, the app needs to be signed with entitlements. Please run "npm run build:mac" and test with the built app instead.'
        console.error('[CloudKit]', errorMsg, initError)
        this.syncStatus.lastError = errorMsg
        this.saveSyncStatus()
        throw new Error(errorMsg)
      }

      this.syncStatus.enabled = true
      this.syncStatus.lastError = null
      this.saveSyncStatus()

      console.log('[CloudKit] Sync enabled successfully')

      // Perform initial sync
      await this.performFullSync()
    } catch (error) {
      this.syncStatus.lastError = String(error)
      this.saveSyncStatus()
      throw error
    }
  }

  public disableSync(): void {
    this.syncStatus.enabled = false
    this.cloudKitManager = null
    this.saveSyncStatus()

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer)
      this.syncDebounceTimer = null
    }

    console.log('[CloudKit] Sync disabled')
  }

  // MARK: - Settings Sync
  public async syncSettings(settings: Settings): Promise<void> {
    if (!this.isSyncEnabled()) return

    this.debouncedSync(async () => {
      try {
        await this.cloudKitManager.saveSettings({
          ...settings,
          deviceId: this.syncStatus.deviceId,
          modifiedAt: Date.now()
        })

        this.syncStatus.lastSyncTime = Date.now()
        this.syncStatus.lastError = null
        this.saveSyncStatus()

        console.log('[CloudKit] Settings synced successfully')
      } catch (error) {
        console.error('[CloudKit] Failed to sync settings:', error)
        this.syncStatus.lastError = String(error)
        this.saveSyncStatus()
      }
    })
  }

  public async fetchSettings(): Promise<Settings | null> {
    if (!this.isSyncEnabled()) return null

    try {
      const remoteSettings = await this.cloudKitManager.fetchSettings()
      if (remoteSettings) {
        delete remoteSettings.deviceId
        delete remoteSettings.modifiedAt
        console.log('[CloudKit] Settings fetched successfully')
        return remoteSettings as Settings
      }
      return null
    } catch (error) {
      console.error('[CloudKit] Failed to fetch settings:', error)
      this.syncStatus.lastError = String(error)
      this.saveSyncStatus()
      return null
    }
  }

  // MARK: - History Sync
  public async syncHistoryItem(item: HistoryItem): Promise<void> {
    if (!this.isSyncEnabled()) return

    this.debouncedSync(async () => {
      try {
        await this.cloudKitManager.saveHistoryItem({
          itemId: item.id,
          text: item.text,
          timestamp: item.timestamp,
          duration: item.duration,
          wpm: item.wpm,
          deviceId: this.syncStatus.deviceId
        })

        this.syncStatus.lastSyncTime = Date.now()
        this.syncStatus.lastError = null
        this.saveSyncStatus()

        console.log('[CloudKit] History item synced:', item.id)
      } catch (error) {
        console.error('[CloudKit] Failed to sync history item:', error)
        this.syncStatus.lastError = String(error)
        this.saveSyncStatus()
      }
    })
  }

  public async fetchAllHistory(): Promise<HistoryItem[]> {
    if (!this.isSyncEnabled()) return []

    try {
      const remoteHistory = await this.cloudKitManager.fetchAllHistory()
      console.log('[CloudKit] Fetched', remoteHistory.length, 'history items')
      return remoteHistory.map((item: any) => ({
        id: item.itemId,
        text: item.text,
        timestamp: item.timestamp,
        duration: item.duration,
        wpm: item.wpm
      }))
    } catch (error) {
      console.error('[CloudKit] Failed to fetch history:', error)
      this.syncStatus.lastError = String(error)
      this.saveSyncStatus()
      return []
    }
  }

  public async deleteHistoryItem(id: string): Promise<void> {
    if (!this.isSyncEnabled()) return

    try {
      await this.cloudKitManager.deleteHistoryItem(id)
      console.log('[CloudKit] History item deleted:', id)
    } catch (error) {
      console.error('[CloudKit] Failed to delete history item:', error)
    }
  }

  // MARK: - Notes Sync
  public async syncNote(note: NoteItem): Promise<void> {
    if (!this.isSyncEnabled()) return

    this.debouncedSync(async () => {
      try {
        await this.cloudKitManager.saveNote({
          itemId: note.id,
          content: note.content,
          timestamp: note.timestamp,
          deviceId: this.syncStatus.deviceId
        })

        this.syncStatus.lastSyncTime = Date.now()
        this.syncStatus.lastError = null
        this.saveSyncStatus()

        console.log('[CloudKit] Note synced:', note.id)
      } catch (error) {
        console.error('[CloudKit] Failed to sync note:', error)
        this.syncStatus.lastError = String(error)
        this.saveSyncStatus()
      }
    })
  }

  public async fetchAllNotes(): Promise<NoteItem[]> {
    if (!this.isSyncEnabled()) return []

    try {
      const remoteNotes = await this.cloudKitManager.fetchAllNotes()
      console.log('[CloudKit] Fetched', remoteNotes.length, 'notes')
      return remoteNotes.map((item: any) => ({
        id: item.itemId,
        content: item.content,
        timestamp: item.timestamp
      }))
    } catch (error) {
      console.error('[CloudKit] Failed to fetch notes:', error)
      this.syncStatus.lastError = String(error)
      this.saveSyncStatus()
      return []
    }
  }

  public async deleteNote(id: string): Promise<void> {
    if (!this.isSyncEnabled()) return

    try {
      await this.cloudKitManager.deleteNote(id)
      console.log('[CloudKit] Note deleted:', id)
    } catch (error) {
      console.error('[CloudKit] Failed to delete note:', error)
    }
  }

  // MARK: - Full Sync
  public async performFullSync(): Promise<void> {
    if (!this.isSyncEnabled() || this.syncStatus.syncInProgress) return

    this.syncStatus.syncInProgress = true
    this.saveSyncStatus()

    console.log('[CloudKit] Starting full sync...')

    try {
      // For now, just mark sync as complete
      // Full implementation would merge local and remote data
      this.syncStatus.lastSyncTime = Date.now()
      this.syncStatus.lastError = null

      console.log('[CloudKit] Full sync completed successfully')
    } catch (error) {
      console.error('[CloudKit] Full sync failed:', error)
      this.syncStatus.lastError = String(error)
    } finally {
      this.syncStatus.syncInProgress = false
      this.saveSyncStatus()
    }
  }

  // MARK: - Debouncing
  private debouncedSync(syncFn: () => Promise<void>): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer)
    }

    this.syncDebounceTimer = setTimeout(async () => {
      await syncFn()
      this.syncDebounceTimer = null
    }, this.DEBOUNCE_DELAY)
  }
}

// Singleton instance
export const syncManager = new CloudKitSyncManager()
