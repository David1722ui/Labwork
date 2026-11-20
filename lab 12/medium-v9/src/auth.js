// Аутентификация: хеширование паролей и серверные сессии.
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

// ---------- Пароли ----------

// Превращает пароль в устойчивый хеш (алгоритм scrypt + случайная «соль»).
// В базе хранится только соль и хеш, сам пароль нигде не сохраняется.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, KEY_LENGTH)).toString('hex');
  return { salt, hash };
}

// Сравнивает введённый пароль с хешем из базы.
// timingSafeEqual сравнивает за одинаковое время, чтобы по скорости ответа
// нельзя было подобрать хеш.
async function verifyPassword(password, salt, expectedHash) {
  const actual = await scrypt(password, salt, KEY_LENGTH);
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

// ---------- Серверные сессии ----------

// Хранилище сессий в памяти сервера: id сессии -> { userId, expiresAt }.
// В браузер уходит только случайный id (в cookie), все данные остаются на сервере.
class SessionStore {
  constructor(lifetimeSeconds) {
    this.lifetimeMs = lifetimeSeconds * 1000;
    this.sessions = new Map();
  }

  // Создаёт новую сессию со случайным непредсказуемым идентификатором.
  create(userId) {
    const id = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.lifetimeMs;
    this.sessions.set(id, { userId, expiresAt });
    return { id, expiresAt };
  }

  // Ищет сессию. Возвращает status: 'ok' | 'missing' | 'expired'.
  find(id) {
    if (!id) return { status: 'missing' };
    const session = this.sessions.get(id);
    if (!session) return { status: 'missing' };
    if (Date.now() >= session.expiresAt) {
      this.sessions.delete(id);
      return { status: 'expired' };
    }
    return { status: 'ok', session };
  }

  // Уничтожает сессию (выход из системы).
  destroy(id) {
    if (id) this.sessions.delete(id);
  }

  // Удаляет все просроченные сессии (вызывается по таймеру).
  removeExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now >= session.expiresAt) this.sessions.delete(id);
    }
  }
}

// Разбирает заголовок Cookie: "a=1; b=2" -> { a: '1', b: '2' }.
function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value; // повреждённое значение — оставляем как есть
    }
  }
  return cookies;
}

module.exports = { hashPassword, verifyPassword, SessionStore, parseCookies };
