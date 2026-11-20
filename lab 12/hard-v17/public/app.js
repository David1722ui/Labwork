'use strict';

// Клиентская часть.
// Access-токен хранится только в переменной (в памяти вкладки), не в localStorage:
// его не достанет чужой скрипт из хранилища, а после F5 он просто запрашивается заново.
// Refresh-токен лежит в cookie HttpOnly — JavaScript его вообще не видит.

const $ = (selector) => document.querySelector(selector);

let accessToken = null;
let accessDeadline = 0;
let sessionDeadline = 0;
let refreshPromise = null;
let timerId = null;
let accessExpiryLogged = false;
let sessionExpiryHandled = false;

// ---------- Запросы ----------

async function request(method, url, { body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Сервер недоступен. Проверьте, что он запущен.' } };
  }
}

// Обновление токенов через refresh. Если несколько запросов одновременно увидели
// истёкший токен, обновление выполняется один раз: повторное предъявление
// старого refresh-токена сервер считает кражей и закрывает сессию.
function refreshTokens() {
  if (!refreshPromise) {
    refreshPromise = request('POST', '/api/auth/refresh').then((result) => {
      refreshPromise = null;
      if (result.ok) {
        applyTokens(result.data);
        addLog('Получен новый access-токен, refresh-токен заменён новым (ротация)');
      }
      return result;
    });
  }
  return refreshPromise;
}

// Запрос к защищённому API. Если access-токен истёк (401 TOKEN_EXPIRED),
// один раз обновляем токены и повторяем запрос.
async function apiAuth(method, url, body) {
  let result = await request(method, url, { body, auth: true });

  if (result.status === 401 && result.data.code === 'TOKEN_EXPIRED') {
    addLog('Сервер ответил 401: access-токен истёк → обновляю через refresh');
    const refreshed = await refreshTokens();
    if (!refreshed.ok) {
      showLogin(refreshed.data.error);
      return null;
    }
    result = await request(method, url, { body, auth: true });
  }

  if (result.status === 401) {
    showLogin(result.data.error);
    return null;
  }
  return result;
}

// ---------- Токены и таймеры ----------

// Payload JWT — вторая часть токена в Base64URL. Декодируем только для показа.
function decodePayload(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function applyTokens(data) {
  accessToken = data.accessToken;
  accessDeadline = Date.now() + data.accessExpiresIn * 1000;
  sessionDeadline = Date.now() + data.sessionSecondsLeft * 1000;
  accessExpiryLogged = false;
  sessionExpiryHandled = false;
  $('#token-payload').textContent = JSON.stringify(decodePayload(accessToken), null, 2);
  startTimers();
}

function formatSeconds(total) {
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function tick() {
  const accessLeft = Math.max(0, Math.ceil((accessDeadline - Date.now()) / 1000));
  const sessionLeft = Math.max(0, Math.ceil((sessionDeadline - Date.now()) / 1000));

  $('#access-timer').textContent = accessLeft > 0 ? `Access-токен: ${formatSeconds(accessLeft)}` : 'Access-токен: истёк';
  $('#access-timer').classList.toggle('warning', accessLeft === 0);
  $('#session-timer').textContent = `Сессия: ${formatSeconds(sessionLeft)}`;
  $('#session-timer').classList.toggle('warning', sessionLeft <= 60);

  if (accessLeft === 0 && !accessExpiryLogged) {
    accessExpiryLogged = true;
    addLog('Access-токен истёк. Новый будет получен при следующем запросе');
  }

  if (sessionLeft === 0 && !sessionExpiryHandled) {
    sessionExpiryHandled = true;
    // Сессия закончилась — сервер должен отказать в обновлении (401 SESSION_EXPIRED).
    setTimeout(async () => {
      const result = await refreshTokens();
      if (!result.ok) showLogin(result.data.error || 'Сессия истекла. Войдите снова.');
    }, 1000);
  }
}

function startTimers() {
  clearInterval(timerId);
  tick();
  timerId = setInterval(tick, 1000);
}

function addLog(text) {
  const item = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('ru-RU');
  item.append(time, text);
  $('#token-log').prepend(item);
}

// ---------- Отображение ----------

function showMessage(element, text, type) {
  element.textContent = text || '';
  element.className = 'message' + (type ? ' ' + type : '');
}

function showLogin(text, type = 'error') {
  accessToken = null;
  clearInterval(timerId);
  $('#loading').hidden = true;
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#login-form').reset();
  // Убираем со страницы данные прошлого пользователя
  $('#profile').replaceChildren();
  $('#token-payload').textContent = '';
  $('#audit-rows').replaceChildren();
  $('#audit-table').hidden = true;
  showMessage($('#audit-message'), '');
  showMessage($('#user-result'), '');
  showMessage($('#login-message'), text, type);
  $('#login').focus();
}

function showApp(user) {
  $('#loading').hidden = true;
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#user-name').textContent = `${user.name} (${user.login})`;
  $('#user-role').textContent = user.role === 'admin' ? 'администратор' : 'пользователь';
  showMessage($('#app-message'), '');
}

function renderProfile(user) {
  const fields = [['Номер', user.id], ['Логин', user.login], ['Имя', user.name], ['Роль', user.role]];
  const items = fields.flatMap(([name, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = name;
    const dd = document.createElement('dd');
    dd.textContent = value; // textContent — защита от XSS
    return [dt, dd];
  });
  $('#profile').replaceChildren(...items);
}

async function loadProfile() {
  const result = await apiAuth('GET', '/api/profile');
  if (!result) return;
  if (result.ok) renderProfile(result.data.user);
  else showMessage($('#app-message'), result.data.error, 'error');
}

// ---------- Обработчики ----------

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const login = $('#login').value.trim();
  const password = $('#password').value;
  if (!login || !password) {
    showMessage($('#login-message'), 'Введите логин и пароль.', 'error');
    return;
  }

  const result = await request('POST', '/api/auth/login', { body: { login, password } });
  if (!result.ok) {
    showMessage($('#login-message'), result.data.error, 'error');
    $('#password').value = '';
    return;
  }

  $('#token-log').replaceChildren();
  applyTokens(result.data);
  showApp(result.data.user);
  addLog(`Вход: получен access-токен (живёт ${result.data.accessExpiresIn} с) и refresh-токен в cookie HttpOnly`);
  showMessage($('#app-message'), `Добро пожаловать, ${result.data.user.name}!`, 'success');
  await loadProfile();
});

$('#logout-btn').addEventListener('click', async () => {
  const result = await request('POST', '/api/auth/logout', { auth: true });
  if (result.ok) showLogin(result.data.message, 'success');
  else showMessage($('#app-message'), `Не удалось выйти: ${result.data.error}`, 'error');
});

$('#profile-btn').addEventListener('click', async () => {
  await loadProfile();
  if (accessToken) addLog('Профиль получен с сервера (запрос с access-токеном)');
});

$('#user-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = Number($('#user-id').value);
  if (!Number.isInteger(id) || id < 1) {
    showMessage($('#user-result'), 'Введите номер — целое число больше 0.', 'error');
    return;
  }
  const result = await apiAuth('GET', `/api/users/${id}`);
  if (!result) return;
  if (result.ok) {
    const user = result.data.user;
    showMessage($('#user-result'), `№${user.id}: ${user.name} (${user.login}), роль ${user.role}`, 'success');
  } else {
    showMessage($('#user-result'), `${result.data.error} (HTTP ${result.status})`, 'error');
  }
});

$('#audit-btn').addEventListener('click', async () => {
  const result = await apiAuth('GET', '/api/admin/audit');
  if (!result) return;
  if (!result.ok) {
    $('#audit-table').hidden = true;
    showMessage($('#audit-message'), `${result.data.error} (HTTP ${result.status})`, 'error');
    return;
  }
  showMessage($('#audit-message'), '');
  const rows = result.data.events.map((event) => {
    const row = document.createElement('tr');
    for (const value of [new Date(event.time).toLocaleTimeString('ru-RU'), event.type, event.login, event.details]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  });
  $('#audit-rows').replaceChildren(...rows);
  $('#audit-table').hidden = false;
});

// При открытии страницы (и после F5) пробуем восстановить сессию по refresh-токену.
(async () => {
  const result = await refreshTokens();
  if (result.ok) {
    showApp(result.data.user);
    await loadProfile();
  } else {
    showLogin(result.data.code === 'NOT_AUTHENTICATED' ? '' : result.data.error);
  }
})();
