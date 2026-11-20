// Автотесты 8 обязательных сценариев ЛР №12.
// Запуск: npm test
// Тестовые пароли генерируются случайно при каждом запуске и нигде не хранятся.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../server');
const { hashPassword } = require('../src/auth');

const passwords = {
  student1: crypto.randomBytes(12).toString('base64url'),
  student2: crypto.randomBytes(12).toString('base64url'),
};

let users;
const tasks = [
  { id: 1, ownerId: 1, title: 'Задача первого пользователя', done: false },
  { id: 2, ownerId: 2, title: 'Задача второго пользователя', done: false },
];

const servers = [];

// Запускает отдельный экземпляр сервера на свободном порту.
async function startServer(sessionSeconds) {
  const app = createApp({ sessionSeconds, users, tasks, log: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

async function request(baseUrl, method, path, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(baseUrl + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data, setCookie: response.headers.get('set-cookie') };
}

// Входит и возвращает cookie вида "sid=..." (как это делает браузер).
async function login(baseUrl, loginName) {
  const result = await request(baseUrl, 'POST', '/api/login', {
    body: { login: loginName, password: passwords[loginName] },
  });
  assert.equal(result.status, 200);
  return result.setCookie.split(';')[0];
}

let baseUrl;

before(async () => {
  users = [
    { id: 1, login: 'student1', name: 'Тест 1', ...(await hashPassword(passwords.student1)) },
    { id: 2, login: 'student2', name: 'Тест 2', ...(await hashPassword(passwords.student2)) },
  ];
  baseUrl = await startServer(300);
});

after(() => {
  for (const server of servers) server.close();
});

test('1. Корректный вход: 200, cookie HttpOnly + SameSite, доступ к профилю', async () => {
  const result = await request(baseUrl, 'POST', '/api/login', {
    body: { login: 'student1', password: passwords.student1 },
  });
  assert.equal(result.status, 200);
  assert.match(result.setCookie, /^sid=[0-9a-f]{64};/);
  assert.match(result.setCookie, /HttpOnly/);
  assert.match(result.setCookie, /SameSite=Strict/);

  const cookie = result.setCookie.split(';')[0];
  const me = await request(baseUrl, 'GET', '/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.login, 'student1');
});

test('2. Неверный пароль: 401, сессия не создаётся', async () => {
  const result = await request(baseUrl, 'POST', '/api/login', {
    body: { login: 'student1', password: 'wrong-password' },
  });
  assert.equal(result.status, 401);
  assert.equal(result.data.error, 'Неверный логин или пароль.');
  assert.equal(result.setCookie, null);

  // Несуществующий логин даёт то же сообщение — нельзя угадать, есть ли пользователь.
  const unknown = await request(baseUrl, 'POST', '/api/login', {
    body: { login: 'nobody', password: 'something' },
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.error, 'Неверный логин или пароль.');
});

test('3. Пустые поля: 400 «Введите логин и пароль»', async () => {
  for (const body of [{ login: '', password: '' }, { login: 'student1', password: '' }, { login: '   ', password: 'x' }, {}]) {
    const result = await request(baseUrl, 'POST', '/api/login', { body });
    assert.equal(result.status, 400);
    assert.equal(result.data.error, 'Введите логин и пароль.');
  }
});

test('4. Доступ без входа: 401 на защищённые адреса', async () => {
  for (const path of ['/api/me', '/api/tasks', '/api/tasks/1']) {
    const result = await request(baseUrl, 'GET', path);
    assert.equal(result.status, 401);
    assert.equal(result.data.code, 'NOT_AUTHENTICATED');
  }
  // Поддельный id сессии тоже не проходит.
  const fake = await request(baseUrl, 'GET', '/api/tasks', { cookie: 'sid=' + 'a'.repeat(64) });
  assert.equal(fake.status, 401);
});

test('5. Выход и повторный запрос защищённого ресурса: 401', async () => {
  const cookie = await login(baseUrl, 'student1');
  assert.equal((await request(baseUrl, 'GET', '/api/tasks', { cookie })).status, 200);

  const logout = await request(baseUrl, 'POST', '/api/logout', { cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.setCookie, /sid=;/); // браузеру велено удалить cookie

  // Даже если сохранить старую cookie, сервер её уже не примет — сессия уничтожена.
  const again = await request(baseUrl, 'GET', '/api/tasks', { cookie });
  assert.equal(again.status, 401);
});

test('6. Истекшая сессия: 401 SESSION_EXPIRED', async () => {
  const shortUrl = await startServer(1); // сессия живёт 1 секунду
  const cookie = await login(shortUrl, 'student1');
  assert.equal((await request(shortUrl, 'GET', '/api/tasks', { cookie })).status, 200);

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const result = await request(shortUrl, 'GET', '/api/tasks', { cookie });
  assert.equal(result.status, 401);
  assert.equal(result.data.code, 'SESSION_EXPIRED');
  assert.equal(result.data.error, 'Сессия истекла. Войдите снова.');
});

test('7. Попытка доступа к чужой задаче: 403', async () => {
  const cookie = await login(baseUrl, 'student1');

  const list = await request(baseUrl, 'GET', '/api/tasks', { cookie });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.tasks.map((t) => t.id), [1]); // только свои задачи

  const own = await request(baseUrl, 'GET', '/api/tasks/1', { cookie });
  assert.equal(own.status, 200);

  const foreign = await request(baseUrl, 'GET', '/api/tasks/2', { cookie });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.data.error, 'Доступ запрещён: это чужая задача.');

  const change = await request(baseUrl, 'PATCH', '/api/tasks/2', { cookie, body: { done: true } });
  assert.equal(change.status, 403);
});

test('8. Обновление страницы после входа: сессия сохраняется', async () => {
  const cookie = await login(baseUrl, 'student2');

  // После F5 браузер заново загружает страницу и отправляет ту же cookie.
  const page = await fetch(baseUrl + '/', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);

  const me = await request(baseUrl, 'GET', '/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.login, 'student2');
  assert.ok(me.data.secondsLeft > 0);
});
