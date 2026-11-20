// Помощник: создаёт соль и хеш пароля для data/users.json.
// Запуск: npm run hash  (пароль вводится с клавиатуры и никуда не сохраняется)
const readline = require('node:readline/promises');
const { hashPassword } = require('../src/auth');

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question('Введите пароль для тестового пользователя: ');
  rl.close();

  if (password.length < 8) {
    console.error('Пароль должен быть не короче 8 символов.');
    process.exit(1);
  }

  const { salt, hash } = await hashPassword(password);
  console.log('\nВставьте эти поля в запись пользователя в data/users.json:');
  console.log(JSON.stringify({ salt, hash }, null, 2));
}

main();
