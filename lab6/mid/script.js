"use strict";

// Шаг 4. Получаем элементы DOM.
const form = document.querySelector("#studentForm");
const nameInput = document.querySelector("#nameInput");
const scoreInput = document.querySelector("#scoreInput");
const rows = document.querySelector("#studentRows");
const message = document.querySelector("#message");
const studentCount = document.querySelector("#studentCount");
const averageScore = document.querySelector("#averageScore");
const emptyState = document.querySelector("#emptyState");

// Шаг 5. Обрабатываем разные события: submit, click и input.
form.addEventListener("submit", addStudent);
rows.addEventListener("click", deleteStudent);
form.addEventListener("input", (event) => {
  if (event.target === nameInput || event.target === scoreInput) {
    event.target.setAttribute("aria-invalid", "false");
    if (message.classList.contains("error")) showMessage("");
  }
});

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function showError(input, text) {
  input.setAttribute("aria-invalid", "true");
  showMessage(text, true);
  input.focus();
}

// Шаг 6. Проверяем ввод и динамически создаём строку таблицы.
function addStudent(event) {
  event.preventDefault();
  nameInput.setAttribute("aria-invalid", "false");
  scoreInput.setAttribute("aria-invalid", "false");
  const name = nameInput.value.trim();
  const rawScore = scoreInput.value.trim();
  const score = Number(rawScore);

  if (!name || name.length > 60) {
    showError(nameInput, "Введите имя длиной от 1 до 60 символов.");
    return;
  }
  if (!rawScore || !Number.isInteger(score) || score < 0 || score > 100) {
    showError(scoreInput, "Введите целый балл от 0 до 100.");
    return;
  }

  const row = document.createElement("tr");
  row.dataset.score = String(score);
  const nameCell = document.createElement("td");
  nameCell.className = "student-name";
  nameCell.textContent = name;
  const scoreCell = document.createElement("td");
  scoreCell.textContent = String(score);
  const actionCell = document.createElement("td");
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Удалить";
  deleteBtn.setAttribute("aria-label", `Удалить студента ${name}`);
  actionCell.append(deleteBtn);
  row.append(nameCell, scoreCell, actionCell);
  rows.append(row);

  form.reset();
  updateSummary();
  showMessage(`Добавлен студент: ${name}, балл: ${score}.`);
  nameInput.focus();
}

function deleteStudent(event) {
  const button = event.target.closest(".delete-btn");
  if (!button || !rows.contains(button)) return;
  const row = button.closest("tr");
  const name = row.querySelector(".student-name").textContent;
  const nextRow = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  updateSummary();
  showMessage(`Удалён студент: ${name}.`);
  if (nextRow) nextRow.querySelector(".delete-btn").focus();
  else nameInput.focus();
}

// Дополнительная функция: пересчёт среднего балла.
function updateSummary() {
  const students = rows.querySelectorAll("tr");
  let total = 0;
  students.forEach((row) => { total += Number(row.dataset.score); });
  studentCount.textContent = String(students.length);
  averageScore.textContent = students.length
    ? (total / students.length).toFixed(1).replace(".", ",")
    : "—";
  emptyState.hidden = students.length > 0;
}

updateSummary();
