import { login, authObserver } from "./auth.js";

// Elementos
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorEl = document.getElementById("error");

// Si ya está logueado, redirigir
authObserver(user => {
  if (user) {
    window.location.href = "/pages/contactos.html";
  }
});

// Evento login
loginBtn.addEventListener("click", async () => {
  errorEl.textContent = "";

  try {
    await login(emailInput.value, passwordInput.value);
  } catch (e) {
    errorEl.textContent = e.message;
  }
});
