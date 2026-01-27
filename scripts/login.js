import { login, authObserver } from "./auth.js";

// Elementos
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorEl = document.getElementById("error");

const togglePasswordBtn = document.getElementById("togglePassword");
const togglePasswordIcon = document.getElementById("togglePasswordIcon");

let showPassword = false;

/* =====================
   AUTH
===================== */
authObserver(user => {
  if (user) {
    window.location.href = "/pages/padron.html";
  }
});

/* =====================
   HELPERS
===================== */
function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function marcarError(input, mensaje) {
  input.classList.add("input-error");
  errorEl.textContent = mensaje;
  input.focus();
}

function limpiarErrores() {
  errorEl.textContent = "";
  emailInput.classList.remove("input-error");
  passwordInput.classList.remove("input-error");
}

/* =====================
   LOGIN
===================== */
async function ejecutarLogin() {
  limpiarErrores();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) {
    marcarError(emailInput, "Ingresá tu email");
    return;
  }

  if (!emailValido(email)) {
    marcarError(emailInput, "Ingresá un email válido");
    return;
  }

  if (!password) {
    marcarError(passwordInput, "Ingresá tu contraseña");
    return;
  }

  try {
    await login(email, password);
  } catch (e) {
    errorEl.textContent = "Email o contraseña incorrectos";
  }
}

// Click
loginBtn.addEventListener("click", ejecutarLogin);

// Enter
[emailInput, passwordInput].forEach(input => {
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      ejecutarLogin();
    }
  });
});

/* =====================
   TOGGLE PASSWORD
===================== */
togglePasswordBtn.addEventListener("click", () => {
  showPassword = !showPassword;

  passwordInput.type = showPassword ? "text" : "password";
  togglePasswordIcon.src = showPassword
    ? "../assets/images/eye-open.png"
    : "../assets/images/eye-closed.png";
});
