'use strict';

// Клиентская часть. Важно: клиент только показывает данные.
// Все проверки доступа выполняет сервер — без действующей сессии
// он не отдаст задачи, даже если вручную показать скрытый раздел.

const $ = (selector) => document.querySelector(selector);

const loading = $('#loading');
const loginView = $('#login-view');
const appView = $('#app-view');
const loginForm = $('#login-form');
const loginMessage = $('#login-message');
const appMessage = $('#app-message');
const userName = $('#user-name');
const sessionTimer = $('#session-timer');
const logoutButton = $('#logout-btn');
const taskList = $('#task-list');
const addTaskForm = $('#add-task-form');
const openTaskForm = $('#open-task-form');
const taskDetails = $('#task-details');

let timerId = null;

// ---------- Запросы к серверу ----------

// Отправляет запрос и возвращает { ok, status, data }.
// Cookie с сессией браузер прикладывает сам — в JS токен не хранится.
async function api(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch {
    return { ok: false, status: 0, data: { error: 'Сервер недоступен. Проверьте, что он запущен.' } };
  }

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// Если сервер ответил 401 — сессии нет или она истекла: возвращаемся ко входу.
function handleUnauthorized(result) {
  if (result.status !== 401) return false;
  showLogin(result.data.error || 'Требуется вход в систему.');
  return true;
}

// ---------- Отображение ----------

function showMessage(element, text, type) {
  element.textContent = text || '';
  element.className = 'message' + (type ? ' ' + type : '');
}

function showLogin(message, type = 'error') {
  stopTimer();
  loading.hidden = true;
  appView.hidden = true;
  loginView.hidden = false;
  loginForm.reset();
  taskList.replaceChildren(); // после выхода на странице не остаётся старых данных
  showMessage(loginMessage, message, type);
  $('#login').focus();
}

function showApp(user, secondsLeft) {
  loading.hidden = true;
  loginView.hidden = true;
  appView.hidden = false;
  userName.textContent = `${user.name} (${user.login})`;
  showMessage(appMessage, '');
  showMessage(taskDetails, '');
  startTimer(secondsLeft);
}

function renderTasks(tasks) {
  taskList.replaceChildren();

  if (tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Задач пока нет.';
    taskList.append(empty);
    return;
  }

  for (const task of tasks) {
    const item = document.createElement('li');
    if (task.done) item.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `task-${task.id}`;
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => toggleTask(task.id, checkbox.checked));

    // textContent, а не innerHTML: текст задачи не может выполниться как код (защита от XSS).
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = task.title;

    const number = document.createElement('span');
    number.className = 'task-id';
    number.textContent = `#${task.id}`;

    item.append(checkbox, label, number);
    taskList.append(item);
  }
}

// ---------- Таймер сессии (творческое задание) ----------

function startTimer(secondsLeft) {
  stopTimer();
  const deadline = Date.now() + secondsLeft * 1000;

  const tick = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const minutes = String(Math.floor(left / 60)).padStart(2, '0');
    const seconds = String(left % 60).padStart(2, '0');
    sessionTimer.textContent = `Сессия: ${minutes}:${seconds}`;
    sessionTimer.classList.toggle('warning', left <= 60);

    if (left === 0) {
      stopTimer();
      // Время вышло — спрашиваем сервер. Он подтвердит, что сессия закрыта.
      setTimeout(() => checkSession('Время сессии истекло. Войдите снова.'), 1000);
    }
  };

  tick();
  timerId = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

// ---------- Действия ----------

// Проверка сессии при загрузке страницы (в том числе после обновления F5).
async function checkSession(expiredMessage = '') {
  const result = await api('GET', '/api/me');

  if (result.ok) {
    showApp(result.data.user, result.data.secondsLeft);
    await loadTasks();
  } else if (result.status === 401) {
    const message = result.data.code === 'SESSION_EXPIRED' ? result.data.error : expiredMessage;
    showLogin(message);
  } else {
    showLogin(result.data.error || 'Ошибка сервера.');
  }
}

async function loadTasks() {
  const result = await api('GET', '/api/tasks');
  if (handleUnauthorized(result)) return;
  if (!result.ok) {
    showMessage(appMessage, result.data.error || 'Не удалось загрузить задачи.', 'error');
    return;
  }
  renderTasks(result.data.tasks);
}

async function toggleTask(id, done) {
  const result = await api('PATCH', `/api/tasks/${id}`, { done });
  if (handleUnauthorized(result)) return;
  if (!result.ok) showMessage(appMessage, result.data.error || 'Не удалось изменить задачу.', 'error');
  await loadTasks();
}

// Вход
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const login = $('#login').value.trim();
  const password = $('#password').value;

  // Проверка пустых полей на клиенте (сервер всё равно проверит ещё раз).
  if (!login || !password) {
    showMessage(loginMessage, 'Введите логин и пароль.', 'error');
    return;
  }

  const button = loginForm.querySelector('button');
  button.disabled = true;
  const result = await api('POST', '/api/login', { login, password });
  button.disabled = false;

  if (!result.ok) {
    showMessage(loginMessage, result.data.error || 'Ошибка входа.', 'error');
    $('#password').value = '';
    $('#password').focus();
    return;
  }

  showApp(result.data.user, result.data.secondsLeft);
  showMessage(appMessage, result.data.message, 'success');
  await loadTasks();
});

// Выход
logoutButton.addEventListener('click', async () => {
  const result = await api('POST', '/api/logout');
  if (result.ok) {
    showLogin(result.data.message, 'success');
  } else {
    showMessage(appMessage, `Не удалось выйти: ${result.data.error}`, 'error');
  }
});

// Добавление задачи
addTaskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#task-title');
  const title = input.value.trim();
  if (!title) {
    showMessage(appMessage, 'Введите текст задачи.', 'error');
    return;
  }

  const result = await api('POST', '/api/tasks', { title });
  if (handleUnauthorized(result)) return;
  if (!result.ok) {
    showMessage(appMessage, result.data.error || 'Не удалось добавить задачу.', 'error');
    return;
  }

  input.value = '';
  showMessage(appMessage, `Задача #${result.data.task.id} добавлена.`, 'success');
  await loadTasks();
});

// Открыть задачу по номеру (проверка «чужой задачи»)
openTaskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = Number($('#task-id').value);
  if (!Number.isInteger(id) || id < 1) {
    showMessage(taskDetails, 'Введите номер задачи — целое число больше 0.', 'error');
    return;
  }

  const result = await api('GET', `/api/tasks/${id}`);
  if (handleUnauthorized(result)) return;

  if (result.ok) {
    const task = result.data.task;
    const state = task.done ? 'выполнена' : 'не выполнена';
    showMessage(taskDetails, `Задача #${task.id}: «${task.title}» — ${state}.`, 'success');
  } else {
    showMessage(taskDetails, `${result.data.error} (HTTP ${result.status})`, 'error');
  }
});

// При загрузке страницы спрашиваем сервер, есть ли активная сессия.
checkSession();
