'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const HID = require('node-hid');
const { WebSocketServer } = require('ws');

const WS_PORT = 8765;
const DEBOUNCE_MS = 1500;
const RECONNECT_MS = 3000;

let mainWindow = null;
let hidDevice = null;
let lastCardTime = 0;
let wss = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 660,
    resizable: false,
    title: 'Sigur Reader EH',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function sendToRenderer(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('skud-event', data);
  }
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  if (wss) {
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  }
  sendToRenderer(data);
}

function findSigurDevice() {
  const devices = HID.devices();
  return devices.find((d) =>
    d.product?.toLowerCase().includes('sigur') ||
    d.manufacturer?.toLowerCase().includes('sigur') ||
    d.product?.toLowerCase().includes('reader eh')
  ) || null;
}

function parseUid(bytes) {
  if (bytes.every((b) => b === 0)) return null;

  const rawHex = bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
  const payload = bytes.slice(1);
  const start = payload.findIndex((b) => b !== 0);
  if (start === -1) return null;

  const uid = payload.slice(start, start + 4);
  while (uid.length < 4) uid.push(0);

  const hexUid = uid.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const decBe = String(((uid[0] << 24) | (uid[1] << 16) | (uid[2] << 8) | uid[3]) >>> 0);
  const decLe = String((uid[0] | (uid[1] << 8) | (uid[2] << 16) | (uid[3] << 24)) >>> 0);
  const sigurCard = bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().padEnd(16, '0');

  return { rawHex, hexUid, decBe, decLe, sigurCard };
}

function connectDevice() {
  const info = findSigurDevice();

  if (!info) {
    broadcast({ type: 'status', connected: false, message: 'Считыватель не найден' });
    setTimeout(connectDevice, RECONNECT_MS);
    return;
  }

  try {
    hidDevice = new HID.HID(info.vendorId, info.productId);
    broadcast({ type: 'status', connected: true, message: `${info.product || 'Считыватель'} подключён` });

    hidDevice.on('data', (data) => {
      const now = Date.now();
      if (now - lastCardTime < DEBOUNCE_MS) return;

      const uid = parseUid(Array.from(data));
      if (!uid) return;

      lastCardTime = now;
      broadcast({ type: 'card', ...uid });
    });

    hidDevice.on('error', () => {
      hidDevice = null;
      broadcast({ type: 'status', connected: false, message: 'Устройство отключено' });
      setTimeout(connectDevice, RECONNECT_MS);
    });
  } catch {
    hidDevice = null;
    broadcast({ type: 'status', connected: false, message: 'Ошибка подключения' });
    setTimeout(connectDevice, RECONNECT_MS);
  }
}

app.whenReady().then(() => {
  createWindow();

  wss = new WebSocketServer({ port: WS_PORT });
  wss.on('listening', connectDevice);
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      sendToRenderer({ type: 'status', connected: false, message: `Порт ${WS_PORT} занят` });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  try { hidDevice?.close(); } catch {}
  if (wss) wss.close();
  app.quit();
});
