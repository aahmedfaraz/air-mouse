import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = dirname(__filename$1);
function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js")
    }
  });
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"] || `file://${path.join(__dirname$1, "../index.html")}`;
  win.loadURL(rendererUrl);
}
app.whenReady().then(() => {
  createWindow();
});
