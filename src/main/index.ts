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
import { initializeEncryption, encryptData, decryptData, detectStorageVersion, exportMasterKey, importMasterKey } from './encryption'
import 'dotenv/config'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let mainWindowReady = false // Track when renderer is ready to receive IPC

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

  // Mark window as ready when DOM is loaded
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindowReady = true
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
app.whenReady().then(async () => {
  // Initialize encryption system FIRST
  try {
    await initializeEncryption()
    console.log('[App] Encryption initialized successfully')
  } catch (error) {
    console.error('[App] Failed to initialize encryption:', error)
  }

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
        // Wait for focus to return (aggressively reduced to 10ms for testing)
        await new Promise((resolve) => setTimeout(resolve, 10))

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

  // Settings Management - LOAD BEFORE creating window and tray menu
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

  const loadSettings = async () => {
    try {
      // Load local settings first
      if (fs.existsSync(settingsPath)) {
        const raw = fs.readFileSync(settingsPath, 'utf-8')
        const parsed = JSON.parse(raw)

        // Detect storage format version
        const version = detectStorageVersion(parsed)

        if (version === 1) {
          // Old plaintext format - load directly, will encrypt on next save
          console.log('[Settings] Detected plaintext format, will migrate on next save')
          settings = { ...settings, ...parsed }
        } else {
          // Version 2 - encrypted format
          try {
            const decrypted = await decryptData(parsed.data)
            settings = { ...settings, ...decrypted }
            console.log('[Settings] Loaded encrypted settings')
          } catch (error) {
            console.error('[Settings] Decryption failed, using defaults:', error)
          }
        }
      }

      // Sync login item settings
      if (typeof settings.startOnLogin === 'boolean') {
        app.setLoginItemSettings({ openAtLogin: settings.startOnLogin })
      }
    } catch (error) {
      console.error('[Settings] Failed to load settings:', error)
    }
  }

  const saveSettings = async () => {
    try {
      // Encrypt the settings
      const encrypted = await encryptData(settings)
      const wrapper = { version: 2 as const, data: encrypted }

      // Write encrypted data
      fs.writeFileSync(settingsPath, JSON.stringify(wrapper, null, 2))
      console.log('[Settings] Saved encrypted settings')
    } catch (error) {
      console.error('[Settings] Failed to save settings:', error)
    }
  }

  // Load settings FIRST
  await loadSettings()

  // Language options for tray menu (all Whisper-supported languages)
  const languages = [
    { code: 'en', label: '🇺🇸 English' },
    { code: 'zh', label: '🇨🇳 Chinese' },
    { code: 'de', label: '🇩🇪 German' },
    { code: 'es', label: '🇪🇸 Spanish' },
    { code: 'ru', label: '🇷🇺 Russian' },
    { code: 'ko', label: '🇰🇷 Korean' },
    { code: 'fr', label: '🇫🇷 French' },
    { code: 'ja', label: '🇯🇵 Japanese' },
    { code: 'pt', label: '🇵🇹 Portuguese' },
    { code: 'pl', label: '🇵🇱 Polish' },
    { code: 'ca', label: '🇪🇸 Catalan' },
    { code: 'nl', label: '🇳🇱 Dutch' },
    { code: 'sv', label: '🇸🇪 Swedish' },
    { code: 'it', label: '🇮🇹 Italian' },
    { code: 'id', label: '🇮🇩 Indonesian' },
    { code: 'hi', label: '🇮🇳 Hindi' },
    { code: 'fi', label: '🇫🇮 Finnish' },
    { code: 'vi', label: '🇻🇳 Vietnamese' },
    { code: 'he', label: '🇮🇱 Hebrew' },
    { code: 'uk', label: '🇺🇦 Ukrainian' },
    { code: 'el', label: '🇬🇷 Greek' },
    { code: 'ms', label: '🇲🇾 Malay' },
    { code: 'cs', label: '🇨🇿 Czech' },
    { code: 'ro', label: '🇷🇴 Romanian' },
    { code: 'da', label: '🇩🇰 Danish' },
    { code: 'hu', label: '🇭🇺 Hungarian' },
    { code: 'ta', label: '🇮🇳 Tamil' },
    { code: 'no', label: '🇳🇴 Norwegian' },
    { code: 'th', label: '🇹🇭 Thai' },
    { code: 'ur', label: '🇵🇰 Urdu' },
    { code: 'hr', label: '🇭🇷 Croatian' },
    { code: 'bg', label: '🇧🇬 Bulgarian' },
    { code: 'lt', label: '🇱🇹 Lithuanian' },
    { code: 'la', label: '🏛️ Latin' },
    { code: 'mi', label: '🇳🇿 Maori' },
    { code: 'ml', label: '🇮🇳 Malayalam' },
    { code: 'cy', label: '🏴󠁧󠁢󠁷󠁬󠁳󠁿 Welsh' },
    { code: 'sk', label: '🇸🇰 Slovak' },
    { code: 'te', label: '🇮🇳 Telugu' },
    { code: 'lv', label: '🇱🇻 Latvian' },
    { code: 'bn', label: '🇧🇩 Bengali' },
    { code: 'sr', label: '🇷🇸 Serbian' },
    { code: 'az', label: '🇦🇿 Azerbaijani' },
    { code: 'sl', label: '🇸🇮 Slovenian' },
    { code: 'kn', label: '🇮🇳 Kannada' },
    { code: 'et', label: '🇪🇪 Estonian' },
    { code: 'mk', label: '🇲🇰 Macedonian' },
    { code: 'br', label: '🇫🇷 Breton' },
    { code: 'eu', label: '🇪🇸 Basque' },
    { code: 'is', label: '🇮🇸 Icelandic' },
    { code: 'hy', label: '🇦🇲 Armenian' },
    { code: 'ne', label: '🇳🇵 Nepali' },
    { code: 'mn', label: '🇲🇳 Mongolian' },
    { code: 'bs', label: '🇧🇦 Bosnian' },
    { code: 'kk', label: '🇰🇿 Kazakh' },
    { code: 'sq', label: '🇦🇱 Albanian' },
    { code: 'sw', label: '🇰🇪 Swahili' },
    { code: 'gl', label: '🇪🇸 Galician' },
    { code: 'mr', label: '🇮🇳 Marathi' },
    { code: 'pa', label: '🇮🇳 Punjabi' },
    { code: 'si', label: '🇱🇰 Sinhala' },
    { code: 'km', label: '🇰🇭 Khmer' },
    { code: 'sn', label: '🇿🇼 Shona' },
    { code: 'yo', label: '🇳🇬 Yoruba' },
    { code: 'so', label: '🇸🇴 Somali' },
    { code: 'af', label: '🇿🇦 Afrikaans' },
    { code: 'oc', label: '🇫🇷 Occitan' },
    { code: 'ka', label: '🇬🇪 Georgian' },
    { code: 'be', label: '🇧🇾 Belarusian' },
    { code: 'tg', label: '🇹🇯 Tajik' },
    { code: 'sd', label: '🇵🇰 Sindhi' },
    { code: 'gu', label: '🇮🇳 Gujarati' },
    { code: 'am', label: '🇪🇹 Amharic' },
    { code: 'yi', label: '🇮🇱 Yiddish' },
    { code: 'lo', label: '🇱🇦 Lao' },
    { code: 'uz', label: '🇺🇿 Uzbek' },
    { code: 'fo', label: '🇫🇴 Faroese' },
    { code: 'ht', label: '🇭🇹 Haitian Creole' },
    { code: 'ps', label: '🇦🇫 Pashto' },
    { code: 'tk', label: '🇹🇲 Turkmen' },
    { code: 'nn', label: '🇳🇴 Nynorsk' },
    { code: 'mt', label: '🇲🇹 Maltese' },
    { code: 'sa', label: '🇮🇳 Sanskrit' },
    { code: 'lb', label: '🇱🇺 Luxembourgish' },
    { code: 'my', label: '🇲🇲 Myanmar' },
    { code: 'bo', label: '🇨🇳 Tibetan' },
    { code: 'tl', label: '🇵🇭 Tagalog' },
    { code: 'mg', label: '🇲🇬 Malagasy' },
    { code: 'as', label: '🇮🇳 Assamese' },
    { code: 'tt', label: '🇷🇺 Tatar' },
    { code: 'haw', label: '🇺🇸 Hawaiian' },
    { code: 'ln', label: '🇨🇩 Lingala' },
    { code: 'ha', label: '🇳🇬 Hausa' },
    { code: 'ba', label: '🇷🇺 Bashkir' },
    { code: 'jw', label: '🇮🇩 Javanese' },
    { code: 'su', label: '🇮🇩 Sundanese' }
  ]

  // Helper to format hotkey for display (macOS style)
  const formatHotkeyForDisplay = (accelerator: string): string => {
    const isMac = process.platform === 'darwin'
    return accelerator
      .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
      .replace(/Control/g, isMac ? '⌃' : 'Ctrl')
      .replace(/Alt/g, isMac ? '⌥' : 'Alt')
      .replace(/Shift/g, isMac ? '⇧' : 'Shift')
      .replace(/\+/g, isMac ? '' : '+')
  }

  // Helper to get PTT key name from keycode
  const getKeyName = (keycode: number | null): string => {
    if (!keycode) return 'Not Set'
    const map: Record<number, string> = {
      56: '⌥ Left Option',
      3640: '⌥ Right Option',
      29: '⌃ Left Control',
      3613: '⌃ Right Control',
      42: '⇧ Left Shift',
      54: '⇧ Right Shift',
      3675: '⌘ Left Command',
      3676: '⌘ Right Command',
      57: 'Space',
      1: 'Escape',
      28: 'Enter',
      14: 'Backspace',
      15: 'Tab',
      58: 'Caps Lock'
    }
    return map[keycode] || `Key ${keycode}`
  }

  // Build and set tray context menu
  const buildTrayMenu = () => {
    const languageSubmenu = languages.map((lang) => ({
      label: lang.label,
      type: 'radio' as const,
      checked: settings.language === lang.code,
      click: () => {
        settings.language = lang.code
        saveSettings()
        buildTrayMenu() // Rebuild to update checkmarks
      }
    }))

    // Shortcuts submenu
    const shortcutsSubmenu = [
      {
        label: `Toggle: ${formatHotkeyForDisplay(settings.hotkey)}`,
        click: () => createSettingsWindow('shortcuts')
      },
      {
        label: `Push-to-Talk: ${getKeyName(settings.holdKey)}`,
        click: () => createSettingsWindow('shortcuts')
      }
    ]

    // Privacy Mode indicator
    const privacyMode = settings.transcriptionMode === 'local'
    const privacyIcon = privacyMode ? '🔒' : '☁️'
    const privacyLabel = privacyMode ? 'Privacy Mode (Local AI)' : 'Cloud Mode'

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `${privacyIcon} ${privacyLabel}`,
        type: 'checkbox',
        checked: privacyMode,
        click: () => {
          settings.transcriptionMode = privacyMode ? 'cloud' : 'local'
          saveSettings()
          buildTrayMenu() // Rebuild to update checkmark and label
        }
      },
      { type: 'separator' },
      {
        label: 'Shortcuts',
        submenu: shortcutsSubmenu
      },
      {
        label: 'Language',
        submenu: languageSubmenu
      },
      { type: 'separator' },
      { label: 'Settings...', click: () => createSettingsWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])

    tray?.setContextMenu(contextMenu)
  }

  // Build initial tray menu
  buildTrayMenu()

  // Then create window
  createWindow()

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
        // Update tray menu with new PTT key
        buildTrayMenu()
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

      // PTT Logic - Only active when holdKey is explicitly configured
      // Requires holdKey to be set (not null) and match the pressed key
      if (settings.holdKey !== null && settings.holdKey === e.keycode && e.keycode !== ignorePTTKey) {
        // Ensure mainWindow is ready before sending
        if (mainWindowReady && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('window-shown')
          mainWindow.focus()
        }
      }
    })

    uIOhook.on('keyup', (e) => {
      // Clear ignore flag on release
      if (ignorePTTKey === e.keycode) {
        ignorePTTKey = null
        return
      }

      // PTT Logic - Only active when holdKey is explicitly configured
      if (settings.holdKey !== null && settings.holdKey === e.keycode) {
        // Ensure mainWindow is ready before sending
        if (mainWindowReady && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('window-hidden')
        }
      }
    })

    uIOhook.start()
  } catch (error) {
    console.error('Failed to start uiohook:', error)
  }

  // Settings Window
  
  const createSettingsWindow = (tab?: string) => {
    // Build the hash route - default to 'settings', or 'settings/shortcuts' if specified
    const hashRoute = tab ? `settings/${tab}` : 'settings'

    if (settingsWindow) {
      if (settingsWindow.isDestroyed()) {
        settingsWindow = null
      } else {
        // If window exists, navigate to the requested tab
        if (tab && is.dev && process.env['ELECTRON_RENDERER_URL']) {
          settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${hashRoute}`)
        } else if (tab) {
          settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: hashRoute })
        }
        settingsWindow.focus()
        return
      }
    }

    settingsWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Settings',
      resizable: true,
      show: false, // Don't show until content is ready
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    // Show window only after content is ready to prevent flicker
    settingsWindow.once('ready-to-show', () => {
      settingsWindow?.show()
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${hashRoute}`)
    } else {
      settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: hashRoute })
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
      show: false, // Don't show until content is ready
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    // Show window only after content is ready to prevent flicker
    examplesWindow.once('ready-to-show', () => {
      examplesWindow?.show()
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

  // Encryption Key Export/Import Handlers
  ipcMain.handle('export-encryption-key', async () => {
    try {
      const key = await exportMasterKey()
      return { success: true, key }
    } catch (error) {
      console.error('[IPC] Failed to export key:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('import-encryption-key', async (_, keyString: string) => {
    try {
      const success = await importMasterKey(keyString)
      if (success) {
        return { success: true }
      } else {
        return { success: false, error: 'Invalid encryption key' }
      }
    } catch (error) {
      console.error('[IPC] Failed to import key:', error)
      return { success: false, error: String(error) }
    }
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

    // Always re-register global shortcut when hotkey changes
    if (key === 'hotkey') {
      globalShortcut.unregisterAll()
      registerGlobalShortcut()
      buildTrayMenu() // Update tray menu to show new hotkey
    }

    // Update tray menu when PTT key changes
    if (key === 'holdKey') {
      buildTrayMenu()
    }

    // Update tray menu when transcription mode changes
    if (key === 'transcriptionMode') {
      buildTrayMenu()
    }

    // triggerMode change no longer affects shortcut registration
    // Both Toggle shortcut and PTT key are always active
  })

  // Track logical recording state in Main to handle Toggle Shortcut correctly
  let isRecordingState = false
  // Track key to ignore (to prevent PTT auto-triggering after recording due to repeat)
  let ignorePTTKey: number | null = null

  ipcMain.on('recording-state-changed', (_, isRecording) => {
    isRecordingState = isRecording
  })

  // Register Global Shortcut Helper
  // Always registers the Toggle shortcut regardless of triggerMode
  // This allows users to use Toggle shortcut even when PTT mode is selected
  const registerGlobalShortcut = () => {
    console.log(`[Shortcut] registerGlobalShortcut called, hotkey=${settings.hotkey}`)

    try {
      globalShortcut.unregisterAll() // Clear old ones
      const success = globalShortcut.register(settings.hotkey, () => {
        // Ensure mainWindow is ready before sending IPC
        if (mainWindowReady && mainWindow && !mainWindow.isDestroyed()) {
          if (isRecordingState) {
            // Stop
            mainWindow.webContents.send('window-hidden')
          } else {
            // Start
            mainWindow.webContents.send('window-shown')
            mainWindow.focus()
          }
        } else {
          console.log('[Shortcut] mainWindow not ready, ignoring shortcut')
        }
      })
      console.log(`[Shortcut] Registered global shortcut: ${settings.hotkey}, success=${success}`)
    } catch (error) {
      console.error('Failed to register shortcut:', error)
    }
  }

  // Register shortcut after a small delay to ensure everything is initialized
  setTimeout(() => {
    console.log('[Shortcut] Delayed registration starting...')
    registerGlobalShortcut()
  }, 100)

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
