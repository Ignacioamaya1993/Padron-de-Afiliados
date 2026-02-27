import { login, authObserver } from "./auth.js";
import { supabase } from "./supabase.js";

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

  const identificador = emailInput.value.trim();
  const password = passwordInput.value;

  if (!identificador) {
    marcarError(emailInput, "Ingresá tu usuario o email");
    return;
  }

  if (!password) {
    marcarError(passwordInput, "Ingresá tu contraseña");
    return;
  }

  let emailReal = identificador;

  try {

    // Si NO es email → buscarlo por username (case-insensitive)
    if (!emailValido(identificador)) {

      const { data: usuario, error } = await supabase
        .from("usuarios")
        .select("email")
        .ilike("username", identificador)
        .limit(1)
        .single();

      if (error || !usuario) {
        marcarError(emailInput, "Usuario no encontrado");
        return;
      }

      emailReal = usuario.email;
    }

    // Login con email real
    await login(emailReal, password);

  } catch (e) {
    errorEl.textContent = "Usuario o contraseña incorrectos";
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