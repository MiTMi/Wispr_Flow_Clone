import { app, shell, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import icon from '../../resources/icon.png?asset'
import { processAudio, injectText } from './openai'
import 'dotenv/config'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  // Create the browser window.
  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })



  mainWindow.on('ready-to-show', () => {
    // Don't show on launch, wait for shortcut
    // mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Force Dock Icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = join(__dirname, '../../resources/icon.png')
    app.dock.setIcon(nativeImage.createFromPath(dockIconPath))
  }

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Hide Window IPC
  ipcMain.on('hide-window', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide()
      if (process.platform === 'darwin') app.hide()
      mainWindow.webContents.send('window-hidden')
    }
  })

  // Audio Data Handler (Batch mode - OpenAI)
  ipcMain.on('audio-data', async (_, buffer) => {
    try {
      console.log('[Performance] Received audio data in main process')
      console.time('Audio Processing')
      const startProcessing = performance.now()

      // 1. Process Audio (Transcribe)
      const text = await processAudio(buffer)
      console.log('[Performance] Transcription complete:', text)
      console.timeEnd('Audio Processing')

      // 2. Hide Window to return focus to previous app
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.hide()
        if (process.platform === 'darwin') app.hide()
        mainWindow.webContents.send('window-hidden')
      }

      // 3. Wait for focus to return (small delay)
      await new Promise(resolve => setTimeout(resolve, 50))

      // 4. Inject Text
      if (text) {
        await injectText(text)
      }

      const totalTime = performance.now() - startProcessing
      console.log(`[Performance] Total Main Process Time: ${totalTime.toFixed(2)}ms`)

      // Notify renderer of completion (to reset state)
      if (mainWindow) {
        mainWindow.webContents.send('processing-complete', totalTime)
      }
    } catch (error) {
      console.error('Error processing audio:', error)
    }
  })
  // Create Tray Icon
  const trayIconPath = join(__dirname, '../../resources/tray-icon.png')
  const image = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(image.resize({ width: 32, height: 32 })) // Larger size for better visibility
  tray.setToolTip('Wispr Flow Clone')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Flow', click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide()
            if (process.platform === 'darwin') app.hide()
            mainWindow.webContents.send('window-hidden')
          } else {
            mainWindow.show()
            mainWindow.focus()
            mainWindow.webContents.send('window-shown')
          }
        }
      }
    },
    { label: 'Settings...', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setContextMenu(contextMenu)

  createWindow()

  // Settings Management
  const settingsPath = join(app.getPath('userData'), 'settings.json')
  let settings = {
    hotkey: 'CommandOrControl+Shift+Space',
    triggerMode: 'toggle', // 'toggle' | 'hold'
    holdKey: null as number | null
  }

  const loadSettings = () => {
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8')
        const loaded = JSON.parse(data)
        settings = { ...settings, ...loaded }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const saveSettings = () => {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  loadSettings()

  // uiohook Integration
  let isRecordingKey = false

  try {
    uIOhook.on('keydown', (e) => {
      // Key Recording for Settings
      if (isRecordingKey) {
        settings.holdKey = e.keycode
        saveSettings()
        isRecordingKey = false
        // Notify renderer
        if (settingsWindow) {
          settingsWindow.webContents.send('key-recorded', e.keycode)
        }
        return
      }

      // PTT Logic
      if (settings.triggerMode === 'hold' && settings.holdKey === e.keycode) {
        if (!mainWindow?.isVisible()) {
          mainWindow?.show()
          mainWindow?.focus()
          mainWindow?.webContents.send('window-shown')
        }
      }
    })

    uIOhook.on('keyup', (e) => {
      // PTT Logic
      if (settings.triggerMode === 'hold' && settings.holdKey === e.keycode) {
        if (mainWindow?.isVisible()) {
          // Do NOT hide immediately. Tell renderer to stop recording.
          mainWindow?.webContents.send('window-hidden')
        }
      }
    })

    uIOhook.start()
  } catch (error) {
    console.error('Failed to start uiohook:', error)
  }

  // Settings Window
  let settingsWindow: BrowserWindow | null = null

  const createSettingsWindow = () => {
    if (settingsWindow) {
      settingsWindow.focus()
      return
    }

    settingsWindow = new BrowserWindow({
      width: 400,
      height: 450, // Increased height for new options
      title: 'Settings',
      resizable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/settings`)
    } else {
      settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'settings' })
    }

    settingsWindow.on('closed', () => {
      settingsWindow = null
      isRecordingKey = false // Cancel recording if closed
    })
  }

  // IPC Handlers for Settings
  ipcMain.handle('get-settings', () => settings)

  ipcMain.handle('update-setting', (_, key, value) => {
    // @ts-ignore
    settings[key] = value
    saveSettings()

    if (key === 'hotkey' && settings.triggerMode === 'toggle') {
      globalShortcut.unregisterAll()
      registerGlobalShortcut()
    }

    if (key === 'triggerMode') {
      if (value === 'toggle') {
        registerGlobalShortcut()
      } else {
        globalShortcut.unregisterAll()
      }
    }
  })

  ipcMain.handle('start-key-recording', () => {
    isRecordingKey = true
  })

  // Register Global Shortcut Helper
  const registerGlobalShortcut = () => {
    if (settings.triggerMode !== 'toggle') return

    try {
      globalShortcut.unregisterAll() // Clear old ones
      globalShortcut.register(settings.hotkey, () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            // Do NOT hide immediately. Tell renderer to stop.
            mainWindow.webContents.send('window-hidden')
          } else {
            mainWindow.show()
            mainWindow.focus()
            mainWindow.webContents.send('window-shown')
          }
        }
      })
    } catch (error) {
      console.error('Failed to register shortcut:', error)
    }
  }

  registerGlobalShortcut()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
