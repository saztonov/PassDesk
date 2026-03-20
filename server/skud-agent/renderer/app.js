'use strict';

const statusBlock = document.getElementById('statusBlock');
const statusText  = document.getElementById('statusText');
const cardUid     = document.getElementById('cardUid');
const cardHex     = document.getElementById('cardHex');
const cardDec     = document.getElementById('cardDec');
const cardRaw     = document.getElementById('cardRaw');
const logList     = document.getElementById('logList');

const MAX_LOG = 50;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timeNow() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function setStatus(connected, message) {
  statusBlock.className = 'status-block ' + (connected ? 'connected' : 'disconnected');
  statusText.textContent = message;
}

function showCard(data) {
  // Убираем пустой placeholder
  const empty = logList.querySelector('.log-empty');
  if (empty) empty.remove();

  // Обновляем большую карточку
  cardUid.textContent = data.sigurCard;
  cardUid.classList.remove('flash');
  void cardUid.offsetWidth; // reflow для перезапуска анимации
  cardUid.classList.add('flash');

  cardHex.textContent = data.hexUid;
  cardDec.textContent = data.decBe;
  cardRaw.textContent = data.rawHex;

  // Добавляем в лог сверху
  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <span class="log-time">${timeNow()}</span>
    <span class="log-uid">${data.sigurCard}</span>
  `;
  logList.insertBefore(item, logList.firstChild);

  // Ограничиваем количество записей
  while (logList.children.length > MAX_LOG) {
    logList.removeChild(logList.lastChild);
  }
}

window.skud.onEvent((data) => {
  if (data.type === 'status') {
    setStatus(data.connected, data.message);
  } else if (data.type === 'card') {
    showCard(data);
  }
});
