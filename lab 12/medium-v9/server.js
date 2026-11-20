// ЛР №12, вариант 9. Сервис задач: вход, список личных задач,
// запрет просмотра чужих задач. Сервер на Node.js + Express.
const path = require('node:path');
const express = require('express');
const { verifyPassword, hashPassword, SessionStore, parseCookies } = require('./src/auth');
const { loadUsers, loadTasks, TaskStore } = require('./src/store');

const COOKIE_NAME = 'sid';
const DEFAULT_SESSION_SECONDS = 5 * 60; // сессия живёт 5 минут с момента входа

function createApp(options = {}) {
  const {
    sessionSeconds = DEFAULT_SESSION_SECONDS,
    users = loadUsers(),
    tasks = loadTasks(),
    secureCookie = process.env.NODE_ENV === 'production', // Secure — только при HTTPS
    log = true,
  } = options;

  const app = express();
  app.disable('x-powered-by'); // не сообщаем, на чём написан сервер
  const sessions = new SessionStore(sessionSeconds);
  const taskStore = new TaskStore(tasks);

  // Раз в минуту чистим просроченные сессии.
  setInterval(() => sessions.removeExpired(), 60 * 1000).unref();

  // Хеш-«пустышка»: проверяем пароль, даже если логина нет,
  // чтобы по времени ответа нельзя было понять, существует ли пользователь.
  const dummyUserPromise = hashPassword('dummy-password');

  // Журнал событий входа/выхода (пароли не записываются).
  function audit(event, details) {
    if (log) console.log(`[${new Date().toLocaleString('ru-RU')}] ${event}: ${details}`);
  }

  function cookieOptions() {
    return {
      httpOnly: true, // JavaScript на странице не может прочитать cookie (защита от XSS)
      secure: secureCookie, // передаётся только по HTTPS
      sameSite: 'strict', // cookie не отправляется с чужих сайтов (защита от CSRF)
      path: '/',
      maxAge: sessionSeconds * 1000,
    };
  }

  function clearSessionCookie(res) {
    const { maxAge, ...rest } = cookieOptions();
    res.clearCookie(COOKIE_NAME, rest);
  }

  function getSessionId(req) {
    return parseCookies(req.headers.cookie)[COOKIE_NAME];
  }

  function secondsLeft(session) {
    return Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  }

  function publicUser(user) {
    return { login: user.login, name: user.name };
  }

  function publicTask(task) {
    return { id: task.id, title: task.title, done: task.done };
  }

  // ---------- Общие настройки ----------

  // Заголовки безопасности для всех ответов.
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

  // Ответы API не кешируются браузером.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---------- Проверка сессии (middleware) ----------

  // Пропускает запрос дальше только при действующей сессии, иначе 401.
  function requireAuth(req, res, next) {
    const sessionId = getSessionId(req);
    const result = sessions.find(sessionId);

    if (result.status === 'expired') {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Сессия истекла. Войдите снова.', code: 'SESSION_EXPIRED' });
    }
    if (result.status !== 'ok') {
      return res.status(401).json({ error: 'Требуется вход в систему.', code: 'NOT_AUTHENTICATED' });
    }

    const user = users.find((u) => u.id === result.session.userId);
    if (!user) {
      sessions.destroy(sessionId);
      return res.status(401).json({ error: 'Требуется вход в систему.', code: 'NOT_AUTHENTICATED' });
    }

    req.user = user;
    req.session = result.session;
    req.sessionId = sessionId;
    next();
  }

  // Находит задачу и проверяет, что она принадлежит текущему пользователю.
  // 404 — задачи нет, 403 — задача чужая.
  function findOwnTask(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Некорректный номер задачи.' });
      return null;
    }
    const task = taskStore.findById(id);
    if (!task) {
      res.status(404).json({ error: 'Задача не найдена.' });
      return null;
    }
    if (task.ownerId !== req.user.id) {
      audit('ОТКАЗ В ДОСТУПЕ', `${req.user.login} пытался открыть чужую задачу #${id}`);
      res.status(403).json({ error: 'Доступ запрещён: это чужая задача.' });
      return null;
    }
    return task;
  }

  // ---------- Маршруты аутентификации ----------

  // Вход: проверяем логин и пароль, создаём сессию, отправляем cookie.
  app.post('/api/login', async (req, res) => {
    const body = req.body ?? {};
    const login = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!login || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль.' });
    }

    const user = users.find((u) => u.login === login);
    const dummy = await dummyUserPromise;
    const passwordOk = await verifyPassword(password, user ? user.salt : dummy.salt, user ? user.hash : dummy.hash);

    if (!user || !passwordOk) {
      audit('НЕУДАЧНЫЙ ВХОД', `логин ${JSON.stringify(login.slice(0, 50))}`);
      // Одинаковое сообщение для «нет такого логина» и «неверный пароль».
      return res.status(401).json({ error: 'Неверный логин или пароль.' });
    }

    // Старую сессию (если была) закрываем и выдаём новую — защита от фиксации сессии.
    sessions.destroy(getSessionId(req));
    const { id } = sessions.create(user.id);
    res.cookie(COOKIE_NAME, id, cookieOptions());

    audit('ВХОД', user.login);
    res.json({
      message: `Добро пожаловать, ${user.name}!`,
      user: publicUser(user),
      secondsLeft: sessionSeconds,
    });
  });

  // Выход: уничтожаем сессию на сервере и удаляем cookie в браузере.
  app.post('/api/logout', (req, res) => {
    const sessionId = getSessionId(req);
    const result = sessions.find(sessionId);
    if (result.status === 'ok') {
      const user = users.find((u) => u.id === result.session.userId);
      audit('ВЫХОД', user ? user.login : 'неизвестный пользователь');
    }
    sessions.destroy(sessionId);
    clearSessionCookie(res);
    res.json({ message: 'Вы вышли из системы.' });
  });

  // Текущий пользователь и сколько секунд осталось до конца сессии.
  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user), secondsLeft: secondsLeft(req.session) });
  });

  // ---------- Защищённые маршруты: задачи ----------

  // Список задач — только свои.
  app.get('/api/tasks', requireAuth, (req, res) => {
    res.json({ tasks: taskStore.listByOwner(req.user.id).map(publicTask) });
  });

  // Одна задача по номеру — только если она своя.
  app.get('/api/tasks/:id', requireAuth, (req, res) => {
    const task = findOwnTask(req, res);
    if (task) res.json({ task: publicTask(task) });
  });

  // Добавить задачу.
  app.post('/api/tasks', requireAuth, (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'Введите текст задачи.' });
    if (title.length > 200) return res.status(400).json({ error: 'Слишком длинный текст (максимум 200 символов).' });
    const task = taskStore.add(req.user.id, title);
    res.status(201).json({ task: publicTask(task) });
  });

  // Отметить задачу выполненной / невыполненной — только свою.
  app.patch('/api/tasks/:id', requireAuth, (req, res) => {
    const task = findOwnTask(req, res);
    if (!task) return;
    if (typeof req.body?.done !== 'boolean') {
      return res.status(400).json({ error: 'Поле done должно быть true или false.' });
    }
    task.done = req.body.done;
    res.json({ task: publicTask(task) });
  });

  // Неизвестный адрес API.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Адрес не найден.' });
  });

  // Обработка ошибок (например, повреждённый JSON в запросе).
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Некорректный формат запроса.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Слишком большой запрос.' });
    }
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

module.exports = { createApp };
