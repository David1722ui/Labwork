"use strict";

const STORAGE_KEY = "lab5-almaty-expenses-v1";
const form = document.querySelector("#expense-form");
const nameInput = document.querySelector("#name");
const amountInput = document.querySelector("#amount");
const list = document.querySelector("#expense-list");
const error = document.querySelector("#error");
const currency = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 2 });
let expenses = [];

// Деньги хранятся в тиынах (целые числа), чтобы не накапливать ошибки округления.
function parseAmount(value) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10000000000) return null;
  return amount;
}

function saveExpenses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch {
    document.querySelector("#storage-note").textContent = "Сохранение недоступно. Записи сохранятся только до закрытия страницы.";
  }
}

function loadExpenses() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) {
      expenses = saved.filter(item => item && typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 80 && Number.isSafeInteger(item.amount) && item.amount > 0 && item.amount <= 10000000000);
      if (!Number.isSafeInteger(expenses.reduce((sum, item) => sum + item.amount, 0))) expenses = [];
    }
  } catch {
    document.querySelector("#storage-note").textContent = "Сохранённые записи недоступны. Можно добавлять новые расходы.";
  }
}

function renderExpenses() {
  list.replaceChildren();
  let total = 0;
  // Цикл создаёт элементы DOM и одновременно вычисляет общую сумму.
  for (let i = 0; i < expenses.length; i++) {
    const expense = expenses[i];
    total += expense.amount;
    const row = document.createElement("li");
    row.classList.add("expense-row");
    const number = document.createElement("span");
    number.className = "number";
    number.textContent = `${i + 1}.`;
    const name = document.createElement("span");
    name.className = "expense-name";
    name.textContent = expense.name;
    const amount = document.createElement("span");
    amount.className = "expense-amount";
    amount.textContent = currency.format(expense.amount / 100);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "delete";
    button.dataset.index = String(i);
    button.textContent = "Удалить";
    button.setAttribute("aria-label", `Удалить расход: ${expense.name}`);
    row.append(number, name, amount, button);
    list.append(row);
  }
  document.querySelector("#total").textContent = currency.format(total / 100);
  document.querySelector("#count").textContent = String(expenses.length);
  document.querySelector("#empty").hidden = expenses.length > 0;
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const amount = parseAmount(amountInput.value);
  nameInput.setAttribute("aria-invalid", String(!name || name.length > 80));
  amountInput.setAttribute("aria-invalid", String(amount === null));
  if (!name || name.length > 80) {
    error.textContent = "Введите название расхода (до 80 символов).";
    nameInput.focus();
  } else if (amount === null) {
    error.textContent = "Введите сумму от 0,01 до 100 000 000 ₸, не более двух знаков после запятой.";
    amountInput.focus();
  } else if (!Number.isSafeInteger(expenses.reduce((sum, item) => sum + item.amount, 0) + amount)) {
    error.textContent = "Общая сумма слишком велика. Удалите часть записей.";
  } else {
    expenses.push({ name, amount });
    saveExpenses();
    renderExpenses();
    form.reset();
    error.textContent = "";
    document.querySelector("#status").textContent = `Добавлен расход: ${name}.`;
    nameInput.focus();
  }
});

list.addEventListener("click", event => {
  const button = event.target.closest("button[data-index]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const removed = expenses.splice(index, 1)[0];
  saveExpenses();
  renderExpenses();
  document.querySelector("#status").textContent = `Удалён расход: ${removed.name}.`;
  const nextButton = list.querySelectorAll("button")[Math.min(index, expenses.length - 1)];
  if (nextButton) nextButton.focus();
  else nameInput.focus();
});

form.addEventListener("input", event => {
  error.textContent = "";
  event.target.removeAttribute("aria-invalid");
});

loadExpenses();
renderExpenses();
