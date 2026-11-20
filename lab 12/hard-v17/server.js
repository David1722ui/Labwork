// ЛР №12, вариант 17 (повышенный уровень).
// JWT с обновлением сессии: короткий access token, безопасная ротация refresh token и выход.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const { TokenService } = require('./src/tokens');
const { hashPassword, verifyPassword } = require('./src/passwords');

const REFRESH_COOKIE = 'rt';
const DEFAULT_ACCESS_SECONDS = 60; // access token живёт 1 минуту
const DEFAULT_SESSION_SECONDS = 10 * 60; // вся сессия (цепочка refresh-токенов) — 10 минут

function loadUsers() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf8'));
}

// Секрет подписи JWT берётся из переменной окружения JWT_SECRET.
// Если её нет — генерируется случайный при запуске (в репозитории секрета нет).
function getSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (fromEnv) console.warn('JWT_SECRET короче 32 символов — использую случайный секрет.');
  return crypto.randomBytes(32).toString('hex');
}

function createApp(options = {}) {
  const {
    accessSeconds = DEFAULT_ACCESS_SECONDS,
    sessionSeconds = DEFAULT_SESSION_SECONDS,
    users = loadUsers(),
    secret = getSecret(),
    secureCookie = process.env.NODE_ENV === 'production',
    log = true,
  } = options;

  const app = express();
  app.disable('x-powered-by');
  const tokens = new TokenService({ secret, accessSeconds, sessionSeconds });
  setInterval(() => tokens.removeExpired(), 60 * 1000).unref();

  // Хеш-«пустышка», чтобы проверка пароля для несуществующего логина
  // занимала столько же времени, сколько для существующего.
  const dummyPromise = hashPassword('dummy-password');

  // ---------- Журнал событий (творческое задание: аудит входов) ----------
  const events = [];
  function audit(type, login, details = '') {
    const event = { time: new Date().toISOString(), type, login, details };
    events.push(event);
    if (events.length > 200) events.shift();
    if (log) console.log(`[${new Date().toLocaleString('ru-RU')}] ${type}: ${login}${details ? ' — ' + details : ''}`);
  }

  // ---------- Вспомогательные функции ----------

  // Refresh-токен — в cookie HttpOnly, которая уходит только на /api/auth.
  // Срок у cookie не ставим: им управляет сервер, чтобы честно отвечать «сессия истекла».
  const refreshCookieOptions = { httpOnly: true, secure: secureCookie, sameSite: 'strict', path: '/api/auth' };

  function readCookie(req, name) {
    for (const part of (req.headers.cookie || '').split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === name) return rest.join('=');
    }
    return null;
  }

  function bearerToken(req) {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
  }

  function publicUser(user) {
    return { id: user.id, login: user.login, name: user.name, role: user.role };
  }

  // Ответ после входа или обновления: новый access-токен и сроки.
  function sendTokens(res, user, refresh) {
    res.cookie(REFRESH_COOKIE, refresh.token, refreshCookieOptions);
    res.json({
      accessToken: tokens.createAccessToken(user),
      accessExpiresIn: accessSeconds,
      sessionSecondsLeft: Math.floor((refresh.expiresAt - Date.now()) / 1000),
      user: publicUser(user),
    });
  }

  const authErrors = {
    NOT_AUTHENTICATED: 'Требуется вход в систему.',
    TOKEN_EXPIRED: 'Срок действия access-токена истёк.',
    INVALID_TOKEN: 'Недействительный токен.',
    TOKEN_REVOKED: 'Токен отозван: выполнен выход.',
  };

  // Middleware: пропускает запрос только с действующим access-токеном, иначе 401.
  function requireAccess(req, res, next) {
    const token = bearerToken(req);
    const result = token ? tokens.verifyAccessToken(token) : { ok: false, code: 'NOT_AUTHENTICATED' };
    const user = result.ok ? users.find((u) => String(u.id) === result.claims.sub) : null;

    if (!user) {
      const code = result.ok ? 'INVALID_TOKEN' : result.code;
      res.set('WWW-Authenticate', `Bearer error="invalid_token"`);
      return res.status(401).json({ error: authErrors[code], code });
    }
    req.claims = result.claims;
    req.user = user;
    next();
  }

  // Middleware: проверка роли на сервере, иначе 403.
  function requireRole(role) {
    return (req, res, next) => {
      if (req.user.role !== role) {
        audit('ОТКАЗ В ДОСТУПЕ', req.user.login, `нужна роль ${role}`);
        return res.status(403).json({ error: `Недостаточно прав: нужна роль ${role}.` });
      }
      next();
    };
  }

  // ---------- Общие настройки ----------
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---------- Аутентификация ----------

  // Вход: проверка пароля → access-токен в ответе + refresh-токен в cookie.
  app.post('/api/auth/login', async (req, res) => {
    const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!login || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль.' });
    }

    const user = users.find((u) => u.login === login);
    const dummy = await dummyPromise;
    const ok = await verifyPassword(password, user ? user.salt : dummy.salt, user ? user.hash : dummy.hash);
    if (!user || !ok) {
      audit('НЕУДАЧНЫЙ ВХОД', JSON.stringify(login.slice(0, 50)));
      return res.status(401).json({ error: 'Неверный логин или пароль.' });
    }

    // Если в браузере остался старый refresh-токен — закрываем ту сессию.
    const old = tokens.find(readCookie(req, REFRESH_COOKIE));
    if (old) tokens.revokeFamily(old.familyId);

    audit('ВХОД', user.login);
    sendTokens(res, user, tokens.startSession(user.id));
  });

  // Обновление: старый refresh-токен меняется на новый (ротация), выдаётся новый access-токен.
  app.post('/api/auth/refresh', (req, res) => {
    const result = tokens.rotate(readCookie(req, REFRESH_COOKIE));

    if (result.status === 'ok') {
      const user = users.find((u) => u.id === result.userId);
      audit('ОБНОВЛЕНИЕ ТОКЕНОВ', user.login);
      return sendTokens(res, user, result);
    }

    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    if (result.status === 'expired') {
      return res.status(401).json({ error: 'Сессия истекла. Войдите снова.', code: 'SESSION_EXPIRED' });
    }
    if (result.status === 'reused') {
      const user = users.find((u) => u.id === result.userId);
      audit('ПОВТОРНЫЙ REFRESH-ТОКЕН', user ? user.login : '?', 'возможная кража, сессия закрыта');
      return res.status(401).json({
        error: 'Обнаружено повторное использование refresh-токена. Сессия закрыта, войдите снова.',
        code: 'TOKEN_REUSED',
      });
    }
    return res.status(401).json({ error: authErrors.NOT_AUTHENTICATED, code: 'NOT_AUTHENTICATED' });
  });

  // Выход: отзываем всю цепочку refresh-токенов и текущий access-токен.
  app.post('/api/auth/logout', (req, res) => {
    const record = tokens.find(readCookie(req, REFRESH_COOKIE));
    if (record) tokens.revokeFamily(record.familyId);

    const access = bearerToken(req);
    const verified = access ? tokens.verifyAccessToken(access) : null;
    if (verified?.ok) tokens.revokeAccessToken(verified.claims);

    const user = record ? users.find((u) => u.id === record.userId) : null;
    if (user) audit('ВЫХОД', user.login);

    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    res.json({ message: 'Вы вышли из системы.' });
  });

  // ---------- Защищённые ресурсы ----------

  // Свой профиль — любой вошедший пользователь.
  app.get('/api/profile', requireAccess, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // Профиль по номеру: свой — можно, чужой — только администратору.
  app.get('/api/users/:id', requireAccess, (req, res) => {
    const id = Number(req.params.id);
    if (id !== req.user.id && req.user.role !== 'admin') {
      audit('ОТКАЗ В ДОСТУПЕ', req.user.login, `чужой профиль №${req.params.id}`);
      return res.status(403).json({ error: 'Доступ запрещён: это чужой профиль.' });
    }
    const target = users.find((u) => u.id === id);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден.' });
    res.json({ user: publicUser(target) });
  });

  // Журнал событий — только роль admin.
  app.get('/api/admin/audit', requireAccess, requireRole('admin'), (req, res) => {
    res.json({ events: events.slice(-30).reverse() });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Адрес не найден.' }));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный формат запроса.' });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  });

  return app;
}

// Запуск: node server.js [жизнь access-токена, сек] [жизнь сессии, сек]
if (require.main === module) {
  const accessSeconds = Number(process.argv[2]) || DEFAULT_ACCESS_SECONDS;
  const sessionSeconds = Number(process.argv[3]) || DEFAULT_SESSION_SECONDS;
  const port = Number(process.env.PORT) || 3000;
  createApp({ accessSeconds, sessionSeconds }).listen(port, '127.0.0.1', () => {
    console.log(`Сервер запущен: http://localhost:${port}`);
    console.log(`Access-токен живёт ${accessSeconds} сек., сессия — ${sessionSeconds} сек.`);
  });
}

module.exports = { createApp };
