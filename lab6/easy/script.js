"use strict";

// Шаг 4: получаем необходимые элементы DOM.
const input = document.querySelector("#productInput");
const addBtn = document.querySelector("#addBtn");
const list = document.querySelector("#shoppingList");
const message = document.querySelector("#message");
const counter = document.querySelector("#counter");
const emptyState = document.querySelector("#emptyState");

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  input.setAttribute("aria-invalid", String(isError));
}

// Дополнительная функция: счётчик покупок.
function updateCounter() {
  const total = list.querySelectorAll(".item").length;
  const done = list.querySelectorAll(".item.done").length;
  counter.textContent = `Всего: ${total} · Куплено: ${done}`
    + ` · Осталось: ${total - done}`;
  emptyState.hidden = total > 0;
}

// Шаг 6: динамически создаём пункт списка.
function addProduct() {
  const name = input.value.trim();
  if (!name) {
    showMessage("Введите название покупки.", true);
    input.focus();
    return;
  }
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "item";
  button.textContent = name;
  button.setAttribute("aria-pressed", "false");
  item.append(button);
  list.append(item);
  input.value = "";
  showMessage(`Добавлено: ${name}`);
  updateCounter();
  input.focus();
}

function toggleProduct(event) {
  const button = event.target.closest(".item");
  if (!button || !list.contains(button)) return;
  const done = button.classList.toggle("done");
  button.setAttribute("aria-pressed", String(done));
  showMessage((done ? "Куплено: " : "Снова в списке: ")
    + button.textContent);
  updateCounter();
}

// Шаг 5: обработчики click и keydown.
addBtn.addEventListener("click", addProduct);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    addProduct();
  }
});
// Делегирование: один обработчик для всех покупок.
list.addEventListener("click", toggleProduct);
updateCounter();
