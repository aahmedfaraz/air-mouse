import { app as s, BrowserWindow as f, ipcMain as c, shell as v, nativeImage as R, Tray as g, Menu as E } from "electron";
import { fileURLToPath as y } from "node:url";
import i from "node:path";
const p = i.dirname(y(import.meta.url));
process.env.APP_ROOT = i.join(p, "..");
const u = process.env.VITE_DEV_SERVER_URL, L = i.join(process.env.APP_ROOT, "dist-electron"), d = i.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = u ? i.join(process.env.APP_ROOT, "public") : d;
let e, a = null, m = !1;
function h() {
  if (e = new f({
    icon: i.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: i.join(p, "preload.mjs")
    }
  }), e.webContents.on("did-finish-load", () => {
    e == null || e.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), e.on("close", (r) => {
    m || (r.preventDefault(), e == null || e.hide());
  }), u ? e.loadURL(u) : e.loadFile(i.join(d, "index.html")), !a) {
    const r = R.createEmpty();
    a = new g(r), a.setToolTip("AirMouse - gesture mouse control");
    const n = E.buildFromTemplate([
      {
        label: "Show AirMouse",
        click: () => {
          e && (e.show(), e.focus());
        }
      },
      {
        label: "Quit",
        click: () => {
          m = !0, s.quit();
        }
      }
    ]);
    a.setContextMenu(n), a.on("click", () => {
      e && (e.isVisible() || e.show(), e.focus());
    });
  }
}
const b = s.requestSingleInstanceLock();
b ? (s.on("second-instance", () => {
  e && (e.isMinimized() && e.restore(), e.show(), e.focus());
}), s.on("window-all-closed", () => {
  process.platform !== "darwin" && (s.quit(), e = null);
}), s.on("activate", () => {
  f.getAllWindows().length === 0 ? h() : e == null || e.show();
}), s.on("before-quit", () => {
  m = !0;
}), s.whenReady().then(h)) : s.quit();
c.on("open-external", (r, n) => {
  typeof n == "string" && n.trim().length > 0 && (n.startsWith("http://") || n.startsWith("https://")) && v.openExternal(n).catch((t) => {
    console.error("Failed to open external URL:", t);
  });
});
let o = null;
async function l() {
  o || (o = await import("@nut-tree-fork/nut-js"));
}
c.on("cursor:move", async (r, n) => {
  try {
    if (await l(), !o) return;
    const t = await o.screen.width(), w = await o.screen.height(), T = Math.round(Math.min(Math.max(n.x, 0), 1) * t), _ = Math.round(Math.min(Math.max(n.y, 0), 1) * w);
    await o.mouse.setPosition(new o.Point(T, _));
  } catch (t) {
    console.error("Failed to move cursor:", t);
  }
});
c.on("cursor:click", async (r, n) => {
  try {
    if (await l(), !o) return;
    const t = n.button === "right" ? o.Button.RIGHT : o.Button.LEFT;
    await o.mouse.click(t);
  } catch (t) {
    console.error("Failed to click:", t);
  }
});
c.on("cursor:mousedown", async (r, n) => {
  try {
    if (await l(), !o) return;
    const t = n.button === "right" ? o.Button.RIGHT : o.Button.LEFT;
    await o.mouse.pressButton(t);
  } catch (t) {
    console.error("Failed to mouse down:", t);
  }
});
c.on("cursor:mouseup", async (r, n) => {
  try {
    if (await l(), !o) return;
    const t = n.button === "right" ? o.Button.RIGHT : o.Button.LEFT;
    await o.mouse.releaseButton(t);
  } catch (t) {
    console.error("Failed to mouse up:", t);
  }
});
c.on("cursor:scroll", async (r, n) => {
  try {
    if (await l(), !o) return;
    const t = n.amount ?? 3;
    n.direction === "up" ? await o.mouse.scrollUp(t) : await o.mouse.scrollDown(t);
  } catch (t) {
    console.error("Failed to scroll:", t);
  }
});
export {
  L as MAIN_DIST,
  d as RENDERER_DIST,
  u as VITE_DEV_SERVER_URL
};
