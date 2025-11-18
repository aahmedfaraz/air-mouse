
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'] || `file://${path.join(__dirname, '../index.html')}`;
  win.loadURL(rendererUrl);
}

app.whenReady().then(() => {
  createWindow();
});
