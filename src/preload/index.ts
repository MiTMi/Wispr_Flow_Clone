import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// CloudKit Sync APIs
const syncAPI = {
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  enableSync: () => ipcRenderer.invoke('enable-sync'),
  disableSync: () => ipcRenderer.invoke('disable-sync'),
  manualSync: () => ipcRenderer.invoke('manual-sync')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', { ...electronAPI, ...syncAPI })
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = { ...electronAPI, ...syncAPI }
  // @ts-ignore (define in dts)
  window.api = api
}
