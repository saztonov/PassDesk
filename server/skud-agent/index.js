'use strict';

const HID = require('node-hid');
const { WebSocketServer } = require('ws');

const WS_PORT = 8765;
const DEBOUNCE_MS = 1500;   // Минимальный интервал между считываниями
const RECONNECT_MS = 3000;  // Пауза перед повторным поиском устройства

let hidDevice = null;
let lastCardTime = 0;

const wss = new WebSocketServer({ port: WS_PORT });

// Отправка сообщения всем подключённым браузерам
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

// Поиск Sigur Reader EH среди всех HID-устройств
function findSigurDevice() {
  const devices = HID.devices();

  const sigur = devices.find((d) =>
    d.product?.toLowerCase().includes('sigur') ||
    d.manufacturer?.toLowerCase().includes('sigur') ||
    d.product?.toLowerCase().includes('reader eh')
  );

  if (!sigur) {
    console.log('\nSigur Reader EH не найден. Все HID-устройства системы:');
    for (const d of devices) {
      const vid = d.vendorId.toString(16).padStart(4, '0').toUpperCase();
      const pid = d.productId.toString(16).padStart(4, '0').toUpperCase();
      console.log(`  VID:${vid} PID:${pid}  ${d.manufacturer || '?'} / ${d.product || '?'}`);
    }
    console.log('\nЕсли видите устройство, похожее на считыватель — сообщите его VID и PID.');
  }

  return sigur || null;
}

// Парсинг UID карты из сырых байт HID-репорта
function parseUid(bytes) {
  // Пустой (idle) репорт — игнорируем
  if (bytes.every((b) => b === 0)) return null;

  const rawHex = bytes
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
    .toUpperCase();

  // Пропускаем report ID (байт 0), ищем первый ненулевой байт
  const payload = bytes.slice(1);
  const start = payload.findIndex((b) => b !== 0);
  if (start === -1) return null;

  // Берём 4 значимых байта — стандартный размер UID EM-Marine / Wiegand
  const uid = payload.slice(start, start + 4);
  while (uid.length < 4) uid.push(0);

  const hexUid = uid.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  // Decimal big-endian (наиболее распространён в российских СКУД)
  const decBe = String(((uid[0] << 24) | (uid[1] << 16) | (uid[2] << 8) | uid[3]) >>> 0);

  // Decimal little-endian (альтернативный формат)
  const decLe = String((uid[0] | (uid[1] << 8) | (uid[2] << 16) | (uid[3] << 24)) >>> 0);

  return { rawHex, hexUid, decBe, decLe };
}

// Подключение к устройству с автоповтором при отключении
function connectDevice() {
  const info = findSigurDevice();

  if (!info) {
    broadcast({ type: 'status', connected: false, message: 'Sigur Reader EH не найден' });
    setTimeout(connectDevice, RECONNECT_MS);
    return;
  }

  try {
    hidDevice = new HID.HID(info.vendorId, info.productId);
    console.log(`\n✅ Подключено: ${info.manufacturer || ''} / ${info.product}`);
    console.log(`   VID:${info.vendorId.toString(16).padStart(4,'0').toUpperCase()} PID:${info.productId.toString(16).padStart(4,'0').toUpperCase()}\n`);

    broadcast({ type: 'status', connected: true, message: 'Sigur Reader EH подключён' });

    hidDevice.on('data', (data) => {
      const now = Date.now();
      if (now - lastCardTime < DEBOUNCE_MS) return;

      const uid = parseUid(Array.from(data));
      if (!uid) return;

      lastCardTime = now;
      console.log(`🃏 Карта считана:`);
      console.log(`   HEX    : ${uid.hexUid}`);
      console.log(`   DEC_BE : ${uid.decBe}  (рекомендуемый формат)`);
      console.log(`   DEC_LE : ${uid.decLe}`);
      console.log(`   Сырые  : ${uid.rawHex}\n`);

      broadcast({ type: 'card', ...uid });
    });

    hidDevice.on('error', (err) => {
      console.error('❌ HID ошибка:', err.message);
      hidDevice = null;
      broadcast({ type: 'status', connected: false, message: 'Устройство отключено' });
      setTimeout(connectDevice, RECONNECT_MS);
    });
  } catch (err) {
    console.error('❌ Не удалось открыть устройство:', err.message);
    hidDevice = null;
    broadcast({ type: 'status', connected: false, message: 'Ошибка открытия устройства' });
    setTimeout(connectDevice, RECONNECT_MS);
  }
}

wss.on('listening', () => {
  console.log(`🚀 Sigur Reader EH агент запущен`);
  console.log(`   WebSocket: ws://localhost:${WS_PORT}\n`);
  connectDevice();
});

wss.on('connection', (ws) => {
  console.log('🌐 Браузер подключился');
  // Сразу отправить текущий статус новому клиенту
  ws.send(JSON.stringify({
    type: 'status',
    connected: !!hidDevice,
    message: hidDevice ? 'Sigur Reader EH подключён' : 'Sigur Reader EH не найден',
  }));
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Порт ${WS_PORT} уже занят. Агент уже запущен?`);
    process.exit(1);
  }
  console.error('WebSocket ошибка:', err.message);
});

process.on('SIGINT', () => {
  console.log('\nОстановка агента...');
  try { hidDevice?.close(); } catch {}
  wss.close();
  process.exit(0);
});
