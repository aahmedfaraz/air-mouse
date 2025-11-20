import { app, BrowserWindow, ipcMain, shell, nativeImage, Tray, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
let tray = null;
let isQuitting = false;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win == null ? void 0 : win.hide();
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
  if (!tray) {
    const emptyIcon = nativeImage.createEmpty();
    tray = new Tray(emptyIcon);
    tray.setToolTip("AirMouse - gesture mouse control");
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show AirMouse",
        click: () => {
          if (!win) return;
          win.show();
          win.focus();
        }
      },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      if (!win) return;
      if (win.isVisible()) {
        win.focus();
      } else {
        win.show();
        win.focus();
      }
    });
  }
}
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
      win = null;
    }
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      win == null ? void 0 : win.show();
    }
  });
  app.on("before-quit", () => {
    isQuitting = true;
  });
  app.whenReady().then(createWindow);
}
ipcMain.on("open-external", (_event, url) => {
  if (typeof url === "string" && url.trim().length > 0) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url).catch((err) => {
        console.error("Failed to open external URL:", err);
      });
    }
  }
});
let nut = null;
async function ensureNut() {
  if (!nut) {
    nut = await import("@nut-tree-fork/nut-js");
  }
}
ipcMain.on("cursor:move", async (_event, payload) => {
  try {
    await ensureNut();
    if (!nut) return;
    const width = await nut.screen.width();
    const height = await nut.screen.height();
    const targetX = Math.round(Math.min(Math.max(payload.x, 0), width));
    const targetY = Math.round(Math.min(Math.max(payload.y, 0), height));
    await nut.mouse.setPosition(new nut.Point(targetX, targetY));
  } catch (err) {
    console.error("Failed to move cursor:", err);
  }
});
ipcMain.on("cursor:click", async (_event, payload) => {
  try {
    await ensureNut();
    if (!nut) return;
    const btn = payload.button === "right" ? nut.Button.RIGHT : nut.Button.LEFT;
    await nut.mouse.click(btn);
  } catch (err) {
    console.error("Failed to click:", err);
  }
});
ipcMain.on("cursor:mousedown", async (_event, payload) => {
  try {
    await ensureNut();
    if (!nut) return;
    const btn = payload.button === "right" ? nut.Button.RIGHT : nut.Button.LEFT;
    await nut.mouse.pressButton(btn);
  } catch (err) {
    console.error("Failed to mouse down:", err);
  }
});
ipcMain.on("cursor:mouseup", async (_event, payload) => {
  try {
    await ensureNut();
    if (!nut) return;
    const btn = payload.button === "right" ? nut.Button.RIGHT : nut.Button.LEFT;
    await nut.mouse.releaseButton(btn);
  } catch (err) {
    console.error("Failed to mouse up:", err);
  }
});
ipcMain.on("cursor:scroll", async (_event, payload) => {
  try {
    await ensureNut();
    if (!nut) return;
    const amount = payload.amount ?? 3;
    if (payload.direction === "up") {
      await nut.mouse.scrollUp(amount);
    } else {
      await nut.mouse.scrollDown(amount);
    }
  } catch (err) {
    console.error("Failed to scroll:", err);
  }
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
