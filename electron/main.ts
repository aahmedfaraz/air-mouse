import { app, BrowserWindow } from 'electron';
import path from 'node:path';

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  win.loadURL(process.env['ELECTRON_RENDERER_URL']!);
}

app.whenReady().then(() => {
  createWindow();
});
