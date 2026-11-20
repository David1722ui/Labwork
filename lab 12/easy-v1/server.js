// ЛР №12, вариант 1 (базовый уровень).
// Личный кабинет студента: вход по логину и паролю, сообщения об ошибках, выход.
// Сессия хранится на сервере, браузер получает только её номер в cookie.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');

const COOKIE_NAME = 'sid';
const DEFAULT_SESSION_SECONDS = 5 * 60; // сессия живёт 5 минут

// ---------- Пароли ----------

// Хеш пароля (алгоритм scrypt). В файле пользователей лежит только соль и хеш.
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Сравниваем хеши за одинаковое время (timingSafeEqual).
function checkPassword(password, user) {
  const actual = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readUsers() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf8'));
}

// Достаёт значение cookie по имени из заголовка "a=1; b=2".
function readCookie(header = '', name) {
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// Данные студента, которые можно показывать (без хеша пароля).
function profile(user) {
  return { id: user.id, login: user.login, name: user.name, group: user.group, grades: user.grades };
}

function createApp({ sessionSeconds = DEFAULT_SESSION_SECONDS, users = readUsers(), log = true } = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Хранилище сессий в памяти сервера: номер сессии -> { userId, expiresAt }.
  const sessions = new Map();

  const cookieOptions = {
    httpOnly: true, // JavaScript страницы не видит cookie
    sameSite: 'strict', // cookie не уходит с чужих сайтов
    secure: process.env.NODE_ENV === 'production', // только HTTPS в боевом режиме
    path: '/',
  };

  function audit(text) {
    if (log) console.log(`[${new Date().toLocaleString('ru-RU')}] ${text}`);
  }

  // Ищет сессию по cookie: status = 'ok' | 'missing' | 'expired'.
  function getSession(req) {
    const sid = readCookie(req.headers.cookie, COOKIE_NAME);
    const session = sid ? sessions.get(sid) : null;
    if (!session) return { status: 'missing' };
    if (Date.now() >= session.expiresAt) {
      sessions.delete(sid);
      return { status: 'expired' };
    }
    return { status: 'ok', sid, session };
  }

  // Пропускает дальше только вошедшего пользователя, иначе 401.
  function requireAuth(req, res, next) {
    const result = getSession(req);
    if (result.status === 'expired') {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.status(401).json({ error: 'Сессия истекла. Войдите снова.', code: 'SESSION_EXPIRED' });
    }
    if (result.status !== 'ok') {
      return res.status(401).json({ error: 'Требуется вход в систему.', code: 'NOT_AUTHENTICATED' });
    }
    req.user = users.find((u) => u.id === result.session.userId);
    req.session = result.session;
    next();
  }

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'",
    });
    next();
  });
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Вход
  app.post('/api/login', (req, res) => {
    const login = String(req.body?.login ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!login || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль.' });
    }

    const user = users.find((u) => u.login === login);
    if (!user || !checkPassword(password, user)) {
      audit(`НЕУДАЧНЫЙ ВХОД: ${JSON.stringify(login.slice(0, 50))}`);
      return res.status(401).json({ error: 'Неверный логин или пароль.' });
    }

    const sid = crypto.randomBytes(32).toString('hex'); // случайный номер сессии
    sessions.set(sid, { userId: user.id, expiresAt: Date.now() + sessionSeconds * 1000 });
    // Cookie без срока: срок жизни сессии контролирует сервер,
    // поэтому после истечения он может прямо сказать «Сессия истекла».
    res.cookie(COOKIE_NAME, sid, cookieOptions);

    audit(`ВХОД: ${user.login}`);
    res.json({ message: `Добро пожаловать, ${user.name}!`, user: profile(user) });
  });

  // Выход: удаляем сессию на сервере и cookie в браузере.
  app.post('/api/logout', (req, res) => {
    const result = getSession(req);
    if (result.status === 'ok') {
      sessions.delete(result.sid);
      audit(`ВЫХОД: ${users.find((u) => u.id === result.session.userId)?.login}`);
    }
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ message: 'Вы вышли из личного кабинета.' });
  });

  // Свой кабинет (защищённый ресурс).
  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: profile(req.user) });
  });

  // Кабинет студента по номеру: можно открыть только свой, иначе 403.
  app.get('/api/students/:id', requireAuth, (req, res) => {
    if (Number(req.params.id) !== req.user.id) {
      audit(`ОТКАЗ В ДОСТУПЕ: ${req.user.login} открывал кабинет №${req.params.id}`);
      return res.status(403).json({ error: 'Доступ запрещён: это кабинет другого студента.' });
    }
    res.json({ user: profile(req.user) });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Адрес не найден.' }));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный запрос.' });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  });

  return app;
}

// Запуск: node server.js [время сессии в секундах]
if (require.main === module) {
  const sessionSeconds = Number(process.argv[2]) || DEFAULT_SESSION_SECONDS;
  const port = Number(process.env.PORT) || 3000;
  createApp({ sessionSeconds }).listen(port, '127.0.0.1', () => {
    console.log(`Сервер запущен: http://localhost:${port}`);
    console.log(`Время жизни сессии: ${sessionSeconds} сек.`);
  });
}

module.exports = { createApp, hashPassword };
