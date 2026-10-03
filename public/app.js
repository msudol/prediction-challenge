"use strict";
const form = document.querySelector("#guess-form");
const error = document.querySelector("#error");
form.addEventListener("submit", event => {
  error.textContent = "";
  const name = form.name.value.trim().replace(/\s+/g, " ");
  const guessText = form.guess.value.trim();
  if (!/^[A-Za-z0-9 ]{2,40}$/.test(name)) {
    event.preventDefault();
    error.textContent = "Name must be 2-40 characters using letters, numbers, and spaces only.";
    form.name.focus(); return;
  }
  if (!/^\d{7,8}$/.test(guessText)) {
    event.preventDefault(); error.textContent = "Guess must contain 7-8 digits only."; form.guess.focus(); return;
  }
  const guess = Number(guessText);
  if (!Number.isSafeInteger(guess) || guess < 25296099 || guess > 50000000) {
    event.preventDefault(); error.textContent = "Guess must be between 25,296,099 and 50,000,000."; form.guess.focus(); return;
  }
  form.name.value = name;
});
