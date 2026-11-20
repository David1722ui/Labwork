// Автотесты ЛР №12, вариант 17: 8 обязательных сценариев + проверки JWT и ротации.
// Запуск: npm test. Пароли и секрет генерируются случайно при каждом запуске.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const { createApp } = require('../server');
const { hashPassword } = require('../src/passwords');

const secret = crypto.randomBytes(32).toString('hex');
const passwords = {
  student1: crypto.randomBytes(12).toString('base64url'),
  student2: crypto.randomBytes(12).toString('base64url'),
  admin: crypto.randomBytes(12).toString('base64url'),
};

let users;
const servers = [];
let baseUrl;

async function startServer(accessSeconds, sessionSeconds) {
  const app = createApp({ accessSeconds, sessionSeconds, users, secret, log: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

async function request(base, method, path, { body, cookie, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => null), setCookie: response.headers.get('set-cookie') };
}

// Вход: возвращает access-токен и cookie с refresh-токеном.
async function login(base, name) {
  const result = await request(base, 'POST', '/api/auth/login', { body: { login: name, password: passwords[name] } });
  assert.equal(result.status, 200);
  return { token: result.data.accessToken, cookie: result.setCookie.split(';')[0] };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  users = [
    { id: 1, login: 'student1', name: 'Тест 1', role: 'user', ...(await hashPassword(passwords.student1)) },
    { id: 2, login: 'student2', name: 'Тест 2', role: 'user', ...(await hashPassword(passwords.student2)) },
    { id: 3, login: 'admin', name: 'Админ', role: 'admin', ...(await hashPassword(passwords.admin)) },
  ];
  baseUrl = await startServer(60, 600);
});

after(() => servers.forEach((server) => server.close()));

test('1. Корректный вход: JWT в ответе, refresh-токен в cookie HttpOnly', async () => {
  const result = await request(baseUrl, 'POST', '/api/auth/login', { body: { login: 'student1', password: passwords.student1 } });
  assert.equal(result.status, 200);
  assert.equal(result.data.accessToken.split('.').length, 3); // header.payload.signature
  assert.match(result.setCookie, /^rt=/);
  assert.match(result.setCookie, /HttpOnly/);
  assert.match(result.setCookie, /SameSite=Strict/);
  assert.match(result.setCookie, /Path=\/api\/auth/);

  const claims = jwt.decode(result.data.accessToken);
  assert.equal(claims.sub, '1');
  assert.equal(claims.iss, 'lab12-server');
  assert.equal(claims.aud, 'lab12-client');
  assert.equal(claims.exp - claims.iat, 60);

  const profile = await request(baseUrl, 'GET', '/api/profile', { token: result.data.accessToken });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.user.login, 'student1');
});

test('2. Неверный пароль: 401, токены не выдаются', async () => {
  const result = await request(baseUrl, 'POST', '/api/auth/login', { body: { login: 'student1', password: 'wrong' } });
  assert.equal(result.status, 401);
  assert.equal(result.data.error, 'Неверный логин или пароль.');
  assert.equal(result.data.accessToken, undefined);
  assert.equal(result.setCookie, null);
});

test('3. Пустые поля: 400', async () => {
  for (const body of [{ login: '', password: '' }, { login: 'student1', password: '' }, {}]) {
    const result = await request(baseUrl, 'POST', '/api/auth/login', { body });
    assert.equal(result.status, 400);
    assert.equal(result.data.error, 'Введите логин и пароль.');
  }
});

test('4. Доступ без входа и с поддельными токенами: 401', async () => {
  const none = await request(baseUrl, 'GET', '/api/profile');
  assert.equal(none.status, 401);
  assert.equal(none.data.code, 'NOT_AUTHENTICATED');

  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: '3', login: 'admin', role: 'admin', iss: 'lab12-server', aud: 'lab12-client', jti: 'x', iat: now, exp: now + 60 };

  // Алгоритм "none" (токен без подписи) — должен быть отвергнут.
  const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`;
  // Подпись чужим секретом.
  const otherSecret = jwt.sign(claims, 'not-the-server-secret-0123456789abcdef');
  // Правильный секрет, но чужой получатель (aud).
  const wrongAudience = jwt.sign({ ...claims, aud: 'other-app' }, secret);

  for (const token of [unsigned, otherSecret, wrongAudience, 'garbage']) {
    const result = await request(baseUrl, 'GET', '/api/profile', { token });
    assert.equal(result.status, 401);
    assert.equal(result.data.code, 'INVALID_TOKEN');
  }
});

test('5. Выход и повторный запрос: старые access и refresh не работают', async () => {
  const { token, cookie } = await login(baseUrl, 'student1');
  const logout = await request(baseUrl, 'POST', '/api/auth/logout', { token, cookie });
  assert.equal(logout.status, 200);

  const profile = await request(baseUrl, 'GET', '/api/profile', { token });
  assert.equal(profile.status, 401);
  assert.equal(profile.data.code, 'TOKEN_REVOKED');

  const refresh = await request(baseUrl, 'POST', '/api/auth/refresh', { cookie });
  assert.equal(refresh.status, 401);
});

test('6. Истекший access-токен обновляется, истекшая сессия — нет', async () => {
  const shortUrl = await startServer(1, 3); // access 1 с, сессия 3 с
  const { token, cookie } = await login(shortUrl, 'student1');

  await wait(1300);
  const expired = await request(shortUrl, 'GET', '/api/profile', { token });
  assert.equal(expired.status, 401);
  assert.equal(expired.data.code, 'TOKEN_EXPIRED');

  const refreshed = await request(shortUrl, 'POST', '/api/auth/refresh', { cookie });
  assert.equal(refreshed.status, 200);
  const profile = await request(shortUrl, 'GET', '/api/profile', { token: refreshed.data.accessToken });
  assert.equal(profile.status, 200);

  await wait(2000);
  const late = await request(shortUrl, 'POST', '/api/auth/refresh', { cookie: refreshed.setCookie.split(';')[0] });
  assert.equal(late.status, 401);
  assert.equal(late.data.code, 'SESSION_EXPIRED');
});

test('7. Чужой ресурс и чужая роль: 403', async () => {
  const student = await login(baseUrl, 'student1');
  assert.equal((await request(baseUrl, 'GET', '/api/users/1', { token: student.token })).status, 200);

  const foreign = await request(baseUrl, 'GET', '/api/users/2', { token: student.token });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.data.error, 'Доступ запрещён: это чужой профиль.');

  const audit = await request(baseUrl, 'GET', '/api/admin/audit', { token: student.token });
  assert.equal(audit.status, 403);

  const admin = await login(baseUrl, 'admin');
  assert.equal((await request(baseUrl, 'GET', '/api/users/2', { token: admin.token })).status, 200);
  const adminAudit = await request(baseUrl, 'GET', '/api/admin/audit', { token: admin.token });
  assert.equal(adminAudit.status, 200);
  assert.ok(adminAudit.data.events.some((event) => event.type === 'ВХОД'));
});

test('8. Обновление страницы: сессия восстанавливается по refresh-токену', async () => {
  const { cookie } = await login(baseUrl, 'student2');
  // После F5 access-токена в памяти нет — браузер отправляет только cookie.
  const restored = await request(baseUrl, 'POST', '/api/auth/refresh', { cookie });
  assert.equal(restored.status, 200);
  assert.notEqual(restored.setCookie.split(';')[0], cookie); // refresh-токен заменён (ротация)
  const profile = await request(baseUrl, 'GET', '/api/profile', { token: restored.data.accessToken });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.user.login, 'student2');
});

test('9. Повторное использование refresh-токена закрывает всю сессию', async () => {
  const { cookie: first } = await login(baseUrl, 'student1');
  const rotated = await request(baseUrl, 'POST', '/api/auth/refresh', { cookie: first });
  assert.equal(rotated.status, 200);
  const second = rotated.setCookie.split(';')[0];

  // Злоумышленник предъявляет украденный старый токен.
  const reuse = await request(baseUrl, 'POST', '/api/auth/refresh', { cookie: first });
  assert.equal(reuse.status, 401);
  assert.equal(reuse.data.code, 'TOKEN_REUSED');

  // Новый токен владельца тоже отозван — вся «семья» закрыта.
  const afterReuse = await request(baseUrl, 'POST', '/api/auth/refresh', { cookie: second });
  assert.equal(afterReuse.status, 401);
});
