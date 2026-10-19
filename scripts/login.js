
import { login } from "./auth.js";
import { supabase } from "./supabase.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorEl = document.getElementById("error");
const togglePasswordBtn = document.getElementById("togglePassword");
const togglePasswordIcon = document.getElementById("togglePasswordIcon");

let showPassword = false;
let procesandoLogin = false;

// --------------------------------------------------
// MENSAJES DE SESIÓN
// --------------------------------------------------

const mensajeSesion = sessionStorage.getItem("mensajeSesion");

if (mensajeSesion) {
  errorEl.textContent = mensajeSesion;
  sessionStorage.removeItem("mensajeSesion");
}

// --------------------------------------------------
// VALIDACIONES Y ERRORES
// --------------------------------------------------

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

// --------------------------------------------------
// VERIFICAR UNA SESIÓN QUE YA ESTABA ABIERTA
// --------------------------------------------------

async function verificarSesionExistente() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error || !session) return;

  try {
    const { reservarSesion } = await import("./auth.js");
    const permitida = await reservarSesion();

    if (permitida) {
      window.location.href = "/pages/padron.html";
      return;
    }

    await supabase.auth.signOut();

    errorEl.textContent =
      "Este usuario ya tiene una sesión iniciada en otro dispositivo. " +
      "Cerrá la otra sesión e intentá nuevamente.";
  } catch (e) {
    console.error("Error verificando la sesión existente:", e);

    errorEl.textContent =
      "No se pudo verificar la sesión. Intentá nuevamente.";
  }
}

verificarSesionExistente();

// --------------------------------------------------
// INICIO DE SESIÓN
// --------------------------------------------------

async function ejecutarLogin() {
  if (procesandoLogin) return;

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

  procesandoLogin = true;
  loginBtn.disabled = true;

  try {
    let emailReal = identificador;

    // Si no ingresó un email, buscar el email asociado al usuario.
    if (!emailValido(identificador)) {
      const {
        data: usuario,
        error
      } = await supabase
        .from("usuarios_login")
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

    await login(emailReal, password);

    // El login redirige al padrón cuando la sesión es válida.
    window.location.href = "/pages/padron.html";

  } catch (e) {
    console.error("Error al iniciar sesión:", e);

    if (e.code === "SESION_ACTIVA") {
      errorEl.textContent =
        "Este usuario ya tiene una sesión iniciada en otro dispositivo. " +
        "Cerrá la otra sesión e intentá nuevamente.";
    } else {
      errorEl.textContent =
        e.message || "Usuario o contraseña incorrectos";
    }

  } finally {
    procesandoLogin = false;
    loginBtn.disabled = false;
  }
}

// --------------------------------------------------
// EVENTOS
// --------------------------------------------------

loginBtn.addEventListener("click", ejecutarLogin);

[emailInput, passwordInput].forEach(input => {
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      ejecutarLogin();
    }
  });
});

// --------------------------------------------------
// MOSTRAR / OCULTAR CONTRASEÑA
// --------------------------------------------------

togglePasswordBtn.addEventListener("click", () => {
  showPassword = !showPassword;

  passwordInput.type = showPassword ? "text" : "password";

  togglePasswordIcon.src = showPassword
    ? "../assets/images/eye-open.png"
    : "../assets/images/eye-closed.png";
});