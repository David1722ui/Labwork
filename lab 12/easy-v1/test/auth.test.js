// Автотесты 8 обязательных сценариев ЛР №12 (вариант 1).
// Запуск: npm test. Пароли для тестов генерируются случайно и нигде не хранятся.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp, hashPassword } = require('../server');

const passwords = {
  student1: crypto.randomBytes(12).toString('base64url'),
  student2: crypto.randomBytes(12).toString('base64url'),
};

function makeUser(id, login) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { id, login, name: `Тест ${id}`, group: 'ТЕСТ', grades: [], salt, hash: hashPassword(passwords[login], salt) };
}

const users = [makeUser(1, 'student1'), makeUser(2, 'student2')];
const servers = [];
let baseUrl;

async function startServer(sessionSeconds) {
  const server = createApp({ sessionSeconds, users, log: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

async function request(base, method, path, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => null), setCookie: response.headers.get('set-cookie') };
}

async function login(base, name) {
  const result = await request(base, 'POST', '/api/login', { body: { login: name, password: passwords[name] } });
  assert.equal(result.status, 200);
  return result.setCookie.split(';')[0];
}

before(async () => {
  baseUrl = await startServer(300);
});

after(() => servers.forEach((server) => server.close()));

test('1. Корректный вход: 200 и cookie HttpOnly + SameSite', async () => {
  const result = await request(baseUrl, 'POST', '/api/login', { body: { login: 'student1', password: passwords.student1 } });
  assert.equal(result.status, 200);
  assert.match(result.setCookie, /HttpOnly/);
  assert.match(result.setCookie, /SameSite=Strict/);
  const me = await request(baseUrl, 'GET', '/api/me', { cookie: result.setCookie.split(';')[0] });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.login, 'student1');
});

test('2. Неверный пароль: 401, cookie не выдаётся', async () => {
  const result = await request(baseUrl, 'POST', '/api/login', { body: { login: 'student1', password: 'wrong' } });
  assert.equal(result.status, 401);
  assert.equal(result.data.error, 'Неверный логин или пароль.');
  assert.equal(result.setCookie, null);
});

test('3. Пустые поля: 400', async () => {
  for (const body of [{ login: '', password: '' }, { login: 'student1', password: '' }, {}]) {
    const result = await request(baseUrl, 'POST', '/api/login', { body });
    assert.equal(result.status, 400);
    assert.equal(result.data.error, 'Введите логин и пароль.');
  }
});

test('4. Доступ без входа: 401', async () => {
  assert.equal((await request(baseUrl, 'GET', '/api/me')).status, 401);
  assert.equal((await request(baseUrl, 'GET', '/api/students/1')).status, 401);
});

test('5. Выход и повторный запрос: 401', async () => {
  const cookie = await login(baseUrl, 'student1');
  assert.equal((await request(baseUrl, 'POST', '/api/logout', { cookie })).status, 200);
  assert.equal((await request(baseUrl, 'GET', '/api/me', { cookie })).status, 401);
});

test('6. Истекшая сессия: 401 SESSION_EXPIRED', async () => {
  const shortUrl = await startServer(1);
  const cookie = await login(shortUrl, 'student1');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const result = await request(shortUrl, 'GET', '/api/me', { cookie });
  assert.equal(result.status, 401);
  assert.equal(result.data.code, 'SESSION_EXPIRED');
});

test('7. Чужой кабинет: 403', async () => {
  const cookie = await login(baseUrl, 'student1');
  assert.equal((await request(baseUrl, 'GET', '/api/students/1', { cookie })).status, 200);
  const foreign = await request(baseUrl, 'GET', '/api/students/2', { cookie });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.data.error, 'Доступ запрещён: это кабинет другого студента.');
});

test('8. Обновление страницы после входа: сессия сохраняется', async () => {
  const cookie = await login(baseUrl, 'student2');
  assert.equal((await fetch(baseUrl + '/', { headers: { Cookie: cookie } })).status, 200);
  const me = await request(baseUrl, 'GET', '/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.login, 'student2');
});
