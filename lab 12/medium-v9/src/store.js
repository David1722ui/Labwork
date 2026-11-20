// Данные приложения: тестовые пользователи и задачи.
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
}

// Пользователи хранятся в data/users.json: только логин, имя, соль и хеш пароля.
function loadUsers() {
  return readJson('users.json');
}

function loadTasks() {
  return readJson('tasks.json');
}

// Задачи хранятся в памяти сервера (после перезапуска — снова из tasks.json).
class TaskStore {
  constructor(tasks) {
    this.tasks = tasks.map((task) => ({ ...task }));
    this.nextId = Math.max(0, ...this.tasks.map((task) => task.id)) + 1;
  }

  listByOwner(ownerId) {
    return this.tasks.filter((task) => task.ownerId === ownerId);
  }

  findById(id) {
    return this.tasks.find((task) => task.id === id);
  }

  add(ownerId, title) {
    const task = { id: this.nextId++, ownerId, title, done: false };
    this.tasks.push(task);
    return task;
  }
}

module.exports = { loadUsers, loadTasks, TaskStore };
