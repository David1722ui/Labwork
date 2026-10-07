"use strict";

// Шаг 4. Получаем элементы DOM.
const form = document.querySelector("#taskForm");
const taskInput = document.querySelector("#taskInput");
const searchInput = document.querySelector("#searchInput");
const board = document.querySelector("#board");
const message = document.querySelector("#message");
const summary = document.querySelector("#summary");
const columns = [
  { title: "Новые", list: document.querySelector("#newList"),
    count: document.querySelector("#newCount"),
    empty: document.querySelector("#newEmpty") },
  { title: "В работе", list: document.querySelector("#workingList"),
    count: document.querySelector("#workingCount"),
    empty: document.querySelector("#workingEmpty") },
  { title: "Готово", list: document.querySelector("#doneList"),
    count: document.querySelector("#doneCount"),
    empty: document.querySelector("#doneEmpty") }
];

// Шаг 5. События submit, click и input.
form.addEventListener("submit", addTask);
board.addEventListener("click", moveTask);
searchInput.addEventListener("input", updateBoard);
taskInput.addEventListener("input", () => {
  taskInput.setAttribute("aria-invalid", "false");
  if (message.classList.contains("error")) showMessage("");
});

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

// Шаг 6. Динамически создаём карточку и её кнопки.
function addTask(event) {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title || title.length > 100) {
    taskInput.setAttribute("aria-invalid", "true");
    showMessage("Введите название задачи от 1 до 100 символов.", true);
    taskInput.focus();
    return;
  }

  const card = document.createElement("li");
  card.className = "task-card";
  card.dataset.column = "0";
  const heading = document.createElement("h3");
  heading.className = "task-title";
  heading.textContent = title;
  const actions = document.createElement("div");
  actions.className = "task-actions";

  [-1, 1].forEach((direction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "move-btn";
    button.dataset.direction = String(direction);
    button.textContent = direction === -1 ? "← Назад" : "Вперёд →";
    actions.append(button);
  });
  card.append(heading, actions);
  columns[0].list.append(card);
  updateControls(card);
  updateBoard();

  form.reset();
  taskInput.setAttribute("aria-invalid", "false");
  showMessage(`Добавлена карточка: ${title}.`
    + (card.hidden ? " Она скрыта текущим поиском." : ""));
  taskInput.focus();
}

function updateControls(card) {
  const position = Number(card.dataset.column);
  const title = card.querySelector(".task-title").textContent;
  card.querySelectorAll(".move-btn").forEach((button) => {
    const target = position + Number(button.dataset.direction);
    button.disabled = target < 0 || target >= columns.length;
    button.setAttribute("aria-label", button.disabled
      ? `Для задачи «${title}» нет соседнего этапа в этом направлении`
      : `Переместить «${title}» в колонку «${columns[target].title}»`);
  });
}

function moveTask(event) {
  const button = event.target.closest(".move-btn");
  if (!button || !board.contains(button) || button.disabled) return;
  const card = button.closest(".task-card");
  const target = Number(card.dataset.column) + Number(button.dataset.direction);
  if (!Number.isInteger(target) || target < 0 || target >= columns.length) return;

  // append переносит существующий элемент, не создавая копию.
  columns[target].list.append(card);
  card.dataset.column = String(target);
  updateControls(card);
  updateBoard();
  const title = card.querySelector(".task-title").textContent;
  showMessage(`«${title}»: перемещено в «${columns[target].title}».`);

  // Если использованная кнопка стала недоступна, фокусируем соседнюю.
  const focusButton = button.disabled
    ? card.querySelectorAll(".move-btn")[target === 0 ? 1 : 0]
    : button;
  focusButton.focus();
}

// Дополнительная функция: поиск без удаления карточек.
function updateBoard() {
  const query = searchInput.value.trim().toLocaleLowerCase("ru");
  let total = 0;
  let shown = 0;
  columns.forEach((column) => {
    const cards = column.list.querySelectorAll(".task-card");
    let visible = 0;
    cards.forEach((card) => {
      const title = card.querySelector(".task-title").textContent;
      card.hidden = !title.toLocaleLowerCase("ru").includes(query);
      if (!card.hidden) visible += 1;
    });
    column.count.textContent = String(cards.length);
    column.empty.hidden = visible > 0;
    column.empty.textContent = cards.length === 0
      ? "Пока нет карточек." : "Нет совпадений.";
    total += cards.length;
    shown += visible;
  });
  summary.textContent = `Всего: ${total} · Показано: ${shown}`;
}

updateBoard();
