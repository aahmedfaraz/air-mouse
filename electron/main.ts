import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)

// Open external links in the user's default browser
ipcMain.on('open-external', (_event, url: string) => {
  if (typeof url === 'string' && url.trim().length > 0) {
    // Basic safety: only allow http(s) URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url).catch((err) => {
        console.error('Failed to open external URL:', err)
      })
    }
  }
})

// ---- OS mouse control via @nut-tree-fork/nut-js ----
// Loaded lazily to avoid slowing down startup.
let nut: typeof import('@nut-tree-fork/nut-js') | null = null

async function ensureNut() {
  if (!nut) {
    nut = await import('@nut-tree-fork/nut-js')
  }
}

ipcMain.on('cursor:move', async (_event, payload: { x: number; y: number }) => {
  try {
    await ensureNut()
    if (!nut) return

    const width = await nut.screen.width()
    const height = await nut.screen.height()

    const targetX = Math.round(Math.min(Math.max(payload.x, 0), 1) * width)
    const targetY = Math.round(Math.min(Math.max(payload.y, 0), 1) * height)

    await nut.mouse.setPosition(new nut.Point(targetX, targetY))
  } catch (err) {
    console.error('Failed to move cursor:', err)
  }
})

ipcMain.on('cursor:click', async (_event, payload: { button: 'left' | 'right' }) => {
  try {
    await ensureNut()
    if (!nut) return

    const btn =
      payload.button === 'right' ? nut.Button.RIGHT : nut.Button.LEFT
    await nut.mouse.click(btn)
  } catch (err) {
    console.error('Failed to click:', err)
  }
})

ipcMain.on('cursor:mousedown', async (_event, payload: { button: 'left' | 'right' }) => {
  try {
    await ensureNut()
    if (!nut) return

    const btn =
      payload.button === 'right' ? nut.Button.RIGHT : nut.Button.LEFT
    await nut.mouse.pressButton(btn)
  } catch (err) {
    console.error('Failed to mouse down:', err)
  }
})

ipcMain.on('cursor:mouseup', async (_event, payload: { button: 'left' | 'right' }) => {
  try {
    await ensureNut()
    if (!nut) return

    const btn =
      payload.button === 'right' ? nut.Button.RIGHT : nut.Button.LEFT
    await nut.mouse.releaseButton(btn)
  } catch (err) {
    console.error('Failed to mouse up:', err)
  }
})

ipcMain.on('cursor:scroll', async (_event, payload: { direction: 'up' | 'down'; amount?: number }) => {
  try {
    await ensureNut()
    if (!nut) return

    const amount = payload.amount ?? 3
    if (payload.direction === 'up') {
      await nut.mouse.scrollUp(amount)
    } else {
      await nut.mouse.scrollDown(amount)
    }
  } catch (err) {
    console.error('Failed to scroll:', err)
  }
})
