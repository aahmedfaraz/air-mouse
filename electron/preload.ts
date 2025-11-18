import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('airmouse', {
  ping: () => 'pong'
});
