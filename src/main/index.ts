import { app, shell, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { processAudio } from './openai'
import 'dotenv/config'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 600,
    height: 100,
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

  // Audio Data Handler
  ipcMain.on('audio-data', async (_, buffer) => {
    console.log('Received audio data, processing...')
    try {
      await processAudio(buffer)
      console.log('Audio processed and text injected.')
    } catch (error) {
      console.error('Failed to process audio:', error)
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
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setContextMenu(contextMenu)

  createWindow()

  // Register Global Shortcut
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
        if (process.platform === 'darwin') {
          app.hide() // Explicitly hide app to restore focus to previous app
        }
        mainWindow.webContents.send('window-hidden')
      } else {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('window-shown')
      }
    }
  })

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
