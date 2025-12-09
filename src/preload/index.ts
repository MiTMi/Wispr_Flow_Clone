import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Encryption key management APIs
const encryptionAPI = {
  exportEncryptionKey: () => ipcRenderer.invoke('export-encryption-key'),
  importEncryptionKey: (key: string) => ipcRenderer.invoke('import-encryption-key', key)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', { ...electronAPI, ...encryptionAPI })
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = { ...electronAPI, ...encryptionAPI }
  // @ts-ignore (define in dts)
  window.api = api
}
