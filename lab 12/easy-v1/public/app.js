'use strict';

// Клиентская часть. Доступ проверяет сервер: без действующей сессии
// он не отдаст данные кабинета, даже если показать скрытый блок вручную.

const $ = (selector) => document.querySelector(selector);

const loading = $('#loading');
const loginView = $('#login-view');
const cabinetView = $('#cabinet-view');
const loginForm = $('#login-form');
const loginMessage = $('#login-message');
const cabinetMessage = $('#cabinet-message');
const logoutConfirm = $('#logout-confirm');

// Запрос к серверу. Cookie сессии браузер приложит сам.
async function api(method, url, body) {
  const options = { method, headers: {} };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Сервер недоступен. Проверьте, что он запущен.' } };
  }
}

function showMessage(element, text, type) {
  element.textContent = text || '';
  element.className = 'message' + (type ? ' ' + type : '');
}

function showLogin(text, type = 'error') {
  loading.hidden = true;
  cabinetView.hidden = true;
  loginView.hidden = false;
  loginForm.reset();
  $('#grades').replaceChildren(); // убираем данные прошлого пользователя
  showMessage(loginMessage, text, type);
  $('#login').focus();
}

function showCabinet(user) {
  loading.hidden = true;
  loginView.hidden = true;
  cabinetView.hidden = false;
  logoutConfirm.hidden = true;

  // textContent вместо innerHTML — защита от XSS
  $('#student-name').textContent = user.name;
  $('#student-group').textContent = user.group;
  $('#student-login').textContent = user.login;

  const rows = user.grades.map((item) => {
    const row = document.createElement('tr');
    const subject = document.createElement('td');
    subject.textContent = item.subject;
    const grade = document.createElement('td');
    grade.textContent = item.grade;
    row.append(subject, grade);
    return row;
  });
  $('#grades').replaceChildren(...rows);
}

// Загрузка кабинета: при открытии страницы, после F5 и по кнопке «Обновить».
async function loadCabinet() {
  const result = await api('GET', '/api/me');
  if (result.ok) {
    showCabinet(result.data.user);
    return true;
  }
  // 401: сессии нет (просто форма входа) или она истекла (с сообщением)
  showLogin(result.data.code === 'NOT_AUTHENTICATED' ? '' : result.data.error);
  return false;
}

// Вход
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const login = $('#login').value.trim();
  const password = $('#password').value;

  if (!login || !password) {
    showMessage(loginMessage, 'Введите логин и пароль.', 'error');
    return;
  }

  const result = await api('POST', '/api/login', { login, password });
  if (!result.ok) {
    showMessage(loginMessage, result.data.error, 'error');
    $('#password').value = '';
    return;
  }

  showCabinet(result.data.user);
  showMessage(cabinetMessage, result.data.message, 'success');
});

// Выход с подтверждением (творческое задание)
$('#logout-btn').addEventListener('click', () => {
  logoutConfirm.hidden = false;
});

$('#logout-no').addEventListener('click', () => {
  logoutConfirm.hidden = true;
});

$('#logout-yes').addEventListener('click', async () => {
  const result = await api('POST', '/api/logout');
  if (result.ok) {
    showLogin(result.data.message, 'success');
  } else {
    showMessage(cabinetMessage, result.data.error, 'error');
  }
});

// Обновить данные кабинета (если сессия истекла — сервер ответит 401)
$('#refresh-btn').addEventListener('click', async () => {
  if (await loadCabinet()) {
    showMessage(cabinetMessage, 'Данные обновлены.', 'success');
  }
});

loadCabinet();
