import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  screen
} from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { uIOhook } from 'uiohook-napi'
import { loadHistory, getStats, deleteHistoryItem } from './history'
import { loadNotes, addNote, deleteNote, updateNote } from './notes'
import icon from '../../resources/icon.png?asset'
import { processAudio, injectText, Settings } from './openai'
import 'dotenv/config'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  // Create the browser window.
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workArea

  // Initial size for pill mode - increased height to accommodate tooltip
  const width = 400
  const height = 250 
  // Center horizontally in work area, position at bottom of work area with padding
  const x = Math.round(workAreaX + (workAreaWidth - width) / 2)
  const y = Math.round(workAreaY + workAreaHeight - height) // Removed -20 padding

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false, // Keep false initially, show in ready-to-show
    frame: false,
    transparent: true,
    resizable: true, // Allow programmatic resize via setBounds
    alwaysOnTop: true,
    hasShadow: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Listen for display changes (resolution changes, monitor connect/disconnect)
  const updateWindowBounds = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Re-center if in flow mode (simplified logic, ideally we track mode)
      // For now, let the set-window-mode handler handle shifts
    }
  }

  screen.on('display-added', updateWindowBounds)
  screen.on('display-removed', updateWindowBounds)
  screen.on('display-metrics-changed', updateWindowBounds)

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      // mainWindow.webContents.openDevTools()
      mainWindow.show()
      // START IN CLICK-THROUGH MODE
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
    }
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

// Helper function to ensure window matches current display before showing
// This is critical for fixing positioning issues when resolution changes
function ensureWindowMatchesDisplay(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const { width, height } = screen.getPrimaryDisplay().bounds
    console.log(
      `[Display Fix] Ensuring window matches display with manual offset: ${width}x${height} at -100,0`
    )
    mainWindow.setBounds({
      x: -100,
      y: 0,
      width: width + 200,
      height: height
    })
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
    app.dock.setIcon(nativeImage.createFromPath(icon))
    app.dock.show()
  }

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Hide Window IPC (Logical hide - stop recording/processing UI)
  ipcMain.on('hide-window', () => {
    if (mainWindow) {
      mainWindow.webContents.send('window-hidden')
    }
  })

  // IPC for resizing window based on view
  ipcMain.on('set-window-mode', (event, mode) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workArea

    if (mode === 'flow') {
      const width = 400
      const height = 250
      const x = Math.round(workAreaX + (workAreaWidth - width) / 2)
      const y = Math.round(workAreaY + workAreaHeight - height) // Removed -20 padding
      win.setBounds({ x, y, width, height })
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      // Enable click-through with forwarding
      win.setIgnoreMouseEvents(true, { forward: true })
    } else {
      // Settings or other large views
      const width = 1000
      const height = 700
      const x = Math.round(workAreaX + (workAreaWidth - width) / 2)
      const y = Math.round(workAreaY + (workAreaHeight - height) / 2)
      win.setBounds({ x, y, width, height })
      win.setAlwaysOnTop(false) // Settings doesn't need to be always on top
      win.center()
      // Disable click-through for settings
      win.setIgnoreMouseEvents(false)
    }
  })

  // IPC for click-through transparency
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setIgnoreMouseEvents(ignore, options)
  })

  ipcMain.handle('transcribe-buffer', async (_, buffer) => {
    try {
      console.log('[Performance] Processing note audio buffer...')
      const text = await processAudio(buffer, settings)
      return text
    } catch (error) {
      console.error('Error transcribing note buffer:', error)
      return ''
    }
  })

  // Audio Data Handler (Batch mode - OpenAI)
  ipcMain.on('audio-data', async (_, buffer) => {
    try {
      console.log('[Performance] Received audio data in main process')
      console.time('Audio Processing')
      const startProcessing = performance.now()

      // 1. Process Audio (Transcribe)
      const text = await processAudio(buffer, settings)
      console.log('[Performance] Transcription complete:', text)
      console.timeEnd('Audio Processing')

      // 2. Hide Window (Logical)
      if (mainWindow) {
        mainWindow.webContents.send('window-hidden')
      }

      // 3. Handle Text
      if (text) {
        // Case B: General Flow (Inject Text)
        // Wait for focus to return
        await new Promise((resolve) => setTimeout(resolve, 300))

        // Temporarily hide the app to yield focus to the previous application
        if (process.platform === 'darwin') {
          app.hide()
        }
        await injectText(text)
      }

      const totalTime = performance.now() - startProcessing
      console.log(`[Performance] Total Main Process Time: ${totalTime.toFixed(2)}ms`)

      // Reset UI to idle state immediately
      if (mainWindow) {
        mainWindow.webContents.send('reset-ui')
        
        // Restore pill if we hid the app (Only for General Flow)
        if (text) {
             setTimeout(() => {
                if (process.platform === 'darwin') {
                   app.show()
                   mainWindow?.showInactive()
                } else {
                   mainWindow?.showInactive()
                }
             }, 200)
        }
      }
    } catch (error) {
      console.error('Error processing audio:', error)
      // Ensure UI resets even on error
      if (mainWindow) {
        mainWindow.webContents.send('reset-ui')
      }
    }
  })
  // Create Tray Icon
  const image = nativeImage.createFromPath(icon)
  if (process.platform === 'darwin') {
    image.setTemplateImage(true)
  }
  tray = new Tray(image.resize({ width: 22, height: 22 })) // Standard size for macOS menu bar
  tray.setToolTip('Wispr Flow Clone')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings...', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setContextMenu(contextMenu)

  createWindow()

  // Settings Management
  const settingsPath = join(app.getPath('userData'), 'settings.json')
  let settings: Settings = {
    hotkey: 'CommandOrControl+Shift+Space',
    triggerMode: 'toggle', // 'toggle' | 'hold'
    holdKey: null as number | null,
    startOnLogin: false,
    style: 'polished',
    language: 'auto',
    customInstructions: ''
  }

  const loadSettings = () => {
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8')
        const loaded = JSON.parse(data)
        settings = { ...settings, ...loaded }

        // Sync login item settings
        if (typeof settings.startOnLogin === 'boolean') {
          app.setLoginItemSettings({ openAtLogin: settings.startOnLogin })
        }
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
        // Prevent immediate trigger from autorepeat
        ignorePTTKey = e.keycode
        
        // Resume global shortcuts
        registerGlobalShortcut()
        // Notify renderer
        if (settingsWindow) {
          settingsWindow.webContents.send('key-recorded', e.keycode)
        }
        return
      }

      // Escape to Stop Recording
      if (e.keycode === 1 && isRecordingState) {
        if (mainWindow) {
          mainWindow.webContents.send('window-hidden')
        }
        return
      }

      // PTT Logic
      if (
        settings.triggerMode === 'hold' && 
        settings.holdKey === e.keycode && 
        e.keycode !== ignorePTTKey
      ) {
        // Just send signal, window is always visible
        mainWindow?.webContents.send('window-shown')
        mainWindow?.focus()
      }
    })

    uIOhook.on('keyup', (e) => {
      // Clear ignore flag on release
      if (ignorePTTKey === e.keycode) {
        ignorePTTKey = null
        return
      }

      // PTT Logic
      if (settings.triggerMode === 'hold' && settings.holdKey === e.keycode) {
        // Send signal
        mainWindow?.webContents.send('window-hidden')
      }
    })

    uIOhook.start()
  } catch (error) {
    console.error('Failed to start uiohook:', error)
  }

  // Settings Window
  
  const createSettingsWindow = () => {
    if (settingsWindow) {
      if (settingsWindow.isDestroyed()) {
        settingsWindow = null
      } else {
        settingsWindow.focus()
        return
      }
    }

    settingsWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Settings',
      resizable: true,
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

    // Handle closing properly
    settingsWindow.on('closed', () => {
      settingsWindow = null
      isRecordingKey = false
    })

    // Also handle close event to be safe
    settingsWindow.on('close', () => {
      isRecordingKey = false
    })
  }

  // Examples Window
  let examplesWindow: BrowserWindow | null = null

  const createExamplesWindow = () => {
    if (examplesWindow) {
      if (examplesWindow.isDestroyed()) {
        examplesWindow = null
      } else {
        examplesWindow.focus()
        return
      }
    }

    examplesWindow = new BrowserWindow({
      width: 500,
      height: 600,
      title: 'Custom Instruction Examples',
      resizable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      examplesWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/examples`)
    } else {
      examplesWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'examples' })
    }

    examplesWindow.on('closed', () => {
      examplesWindow = null
    })
  }

  ipcMain.on('open-examples-window', () => {
    createExamplesWindow()
  })

  ipcMain.handle('start-key-recording', () => {
    isRecordingKey = true
    // Pause global shortcuts to prevent conflicts while recording PTT
    globalShortcut.unregisterAll()
  })

  ipcMain.handle('stop-key-recording', () => {
    isRecordingKey = false
    // Resume global shortcuts
    registerGlobalShortcut()
  })

  // Handlers for Renderer's Local Shortcut Recording
  ipcMain.on('pause-global-shortcut', () => {
    globalShortcut.unregisterAll()
  })

  ipcMain.on('resume-global-shortcut', () => {
    registerGlobalShortcut()
  })

  // History Handlers
  ipcMain.handle('get-history', () => {
    return loadHistory()
  })

  ipcMain.handle('get-stats', () => {
    return getStats()
  })

  ipcMain.handle('delete-history-item', (_, id) => {
    deleteHistoryItem(id)
  })

  // Notes Handlers
  ipcMain.handle('get-notes', () => {
    return loadNotes()
  })

  ipcMain.handle('add-note', (_, content) => {
    return addNote(content)
  })

  ipcMain.handle('delete-note', (_, id) => {
    deleteNote(id)
  })

  ipcMain.handle('update-note', (_, id, content) => {
    updateNote(id, content)
  })

  // IPC Handlers for Settings
  ipcMain.handle('get-settings', () => settings)

  ipcMain.handle('update-setting', (_, key, value) => {
    // @ts-ignore: Dynamic assignment to typed object
    settings[key] = value
    saveSettings()

    if (key === 'startOnLogin') {
      app.setLoginItemSettings({ openAtLogin: value })
    }

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

  // Track logical recording state in Main to handle Toggle Shortcut correctly
  let isRecordingState = false
  // Track key to ignore (to prevent PTT auto-triggering after recording due to repeat)
  let ignorePTTKey: number | null = null

  ipcMain.on('recording-state-changed', (_, isRecording) => {
    isRecordingState = isRecording
  })

  // Register Global Shortcut Helper
  const registerGlobalShortcut = () => {
    if (settings.triggerMode !== 'toggle') return

    try {
      globalShortcut.unregisterAll() // Clear old ones
      globalShortcut.register(settings.hotkey, () => {
        if (mainWindow) {
          if (isRecordingState) {
            // Stop
            mainWindow.webContents.send('window-hidden')
          } else {
            // Start
            mainWindow.webContents.send('window-shown')
            mainWindow.focus() // Ensure focus for PTT
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow && !mainWindow.isVisible()) {
      ensureWindowMatchesDisplay()
      mainWindow.show()
    }
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
