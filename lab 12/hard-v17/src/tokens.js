// Токены: короткоживущий access token (JWT) и refresh token с ротацией.
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const ALGORITHM = 'HS256'; // единственный разрешённый алгоритм подписи
const ISSUER = 'lab12-server'; // кто выдал токен (claim iss)
const AUDIENCE = 'lab12-client'; // для кого токен (claim aud)

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

class TokenService {
  constructor({ secret, accessSeconds, sessionSeconds }) {
    this.secret = secret;
    this.accessSeconds = accessSeconds;
    this.sessionMs = sessionSeconds * 1000;
    // sha256(refresh-токена) -> { userId, familyId, expiresAt, used }
    this.refreshTokens = new Map();
    // jti отозванных access-токенов -> момент, когда они истекут сами
    this.revokedJti = new Map();
  }

  // ---------- Access token (JWT) ----------

  createAccessToken(user) {
    return jwt.sign({ login: user.login, role: user.role }, this.secret, {
      algorithm: ALGORITHM,
      expiresIn: this.accessSeconds, // claim exp
      issuer: ISSUER,
      audience: AUDIENCE,
      subject: String(user.id), // claim sub — номер пользователя
      jwtid: crypto.randomUUID(), // claim jti — уникальный номер токена
    });
  }

  // Проверяет подпись, алгоритм, срок действия (exp), iss, aud и обязательные claims.
  // Возвращает { ok: true, claims } или { ok: false, code }.
  verifyAccessToken(token) {
    let claims;
    try {
      claims = jwt.verify(token, this.secret, { algorithms: [ALGORITHM], issuer: ISSUER, audience: AUDIENCE });
    } catch (error) {
      return { ok: false, code: error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN' };
    }
    if (!claims.sub || !claims.jti || !claims.role || !claims.exp) {
      return { ok: false, code: 'INVALID_TOKEN' };
    }
    if (this.revokedJti.has(claims.jti)) {
      return { ok: false, code: 'TOKEN_REVOKED' };
    }
    return { ok: true, claims };
  }

  // Отзыв access-токена при выходе: до истечения срока он больше не принимается.
  revokeAccessToken(claims) {
    this.revokedJti.set(claims.jti, claims.exp * 1000);
  }

  // ---------- Refresh token ----------

  // Новый вход = новая «семья» refresh-токенов с общим сроком жизни сессии.
  startSession(userId) {
    return this.issueRefreshToken(userId, crypto.randomUUID(), Date.now() + this.sessionMs);
  }

  issueRefreshToken(userId, familyId, expiresAt) {
    const token = crypto.randomBytes(32).toString('base64url');
    // На сервере хранится только хеш: утечка хранилища не даёт рабочих токенов.
    this.refreshTokens.set(sha256(token), { userId, familyId, expiresAt, used: false });
    return { token, expiresAt };
  }

  // Ротация: предъявленный refresh-токен помечается использованным, выдаётся новый.
  // Если кто-то предъявит уже использованный токен — это признак кражи,
  // поэтому отзывается вся семья (и у злоумышленника, и у владельца).
  rotate(token) {
    const record = token ? this.refreshTokens.get(sha256(token)) : null;
    if (!record) return { status: 'invalid' };

    if (Date.now() >= record.expiresAt) {
      this.revokeFamily(record.familyId);
      return { status: 'expired' };
    }
    if (record.used) {
      this.revokeFamily(record.familyId);
      return { status: 'reused', userId: record.userId };
    }

    record.used = true;
    const next = this.issueRefreshToken(record.userId, record.familyId, record.expiresAt);
    return { status: 'ok', userId: record.userId, ...next };
  }

  // Запись refresh-токена без ротации (нужна при выходе).
  find(token) {
    return token ? this.refreshTokens.get(sha256(token)) ?? null : null;
  }

  revokeFamily(familyId) {
    for (const [hash, record] of this.refreshTokens) {
      if (record.familyId === familyId) this.refreshTokens.delete(hash);
    }
  }

  // Чистка просроченных записей (вызывается по таймеру).
  removeExpired() {
    const now = Date.now();
    for (const [hash, record] of this.refreshTokens) {
      if (now >= record.expiresAt) this.refreshTokens.delete(hash);
    }
    for (const [jti, expiresAt] of this.revokedJti) {
      if (now >= expiresAt) this.revokedJti.delete(jti);
    }
  }
}

module.exports = { TokenService, ALGORITHM, ISSUER, AUDIENCE };
