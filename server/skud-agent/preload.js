'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skud', {
  onEvent: (callback) => ipcRenderer.on('skud-event', (_, data) => callback(data)),
});
