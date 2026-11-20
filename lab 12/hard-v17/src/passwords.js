// Хеширование паролей алгоритмом scrypt (встроен в Node.js).
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, KEY_LENGTH)).toString('hex');
  return { salt, hash };
}

// Сравнение за постоянное время, чтобы по скорости ответа нельзя было подобрать хеш.
async function verifyPassword(password, salt, expectedHash) {
  const actual = await scrypt(password, salt, KEY_LENGTH);
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
