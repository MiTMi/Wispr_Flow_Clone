import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI & {
      exportEncryptionKey: () => Promise<{ success: boolean; key?: string; error?: string }>
      importEncryptionKey: (key: string) => Promise<{ success: boolean; error?: string }>
    }
    api: unknown
  }
}
