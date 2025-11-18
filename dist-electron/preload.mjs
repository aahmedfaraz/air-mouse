"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("airmouse", {
  ping: () => "pong"
});
