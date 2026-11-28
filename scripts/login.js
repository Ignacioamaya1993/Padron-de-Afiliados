
import { login } from "./auth.js";
import { supabase } from "./supabase.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginForm = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const togglePasswordBtn = document.getElementById("togglePassword");
const togglePasswordIcon = document.getElementById("togglePasswordIcon");

let showPassword = false;
let procesandoLogin = false;
let ventanaAdmin = null;

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

function marcarError(input, mensaje) {
  input.classList.add("input-error");
  input.setAttribute("aria-invalid", "true");
  errorEl.textContent = mensaje;
  input.focus();
}

function limpiarErrores() {
  errorEl.textContent = "";
  emailInput.classList.remove("input-error");
  passwordInput.classList.remove("input-error");
  emailInput.removeAttribute("aria-invalid");
  passwordInput.removeAttribute("aria-invalid");
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
      const { data: { user } } = await supabase.auth.getUser();
      window.location.href = user?.email?.toLowerCase() === "ignacioamaya04@gmail.com"
        ? "/pages/admin.html"
        : "/pages/padron.html";
      return;
    }

    await supabase.auth.signOut({ scope: "local" });

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
  loginBtn.setAttribute("aria-busy", "true");

try {
    await login(identificador, password);

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email?.toLowerCase() === "ignacioamaya04@gmail.com") {
      if (ventanaAdmin && !ventanaAdmin.closed) {
        ventanaAdmin.location.replace("/pages/admin.html");
      } else {
        window.location.href = "/pages/admin.html";
        return;
      }
    } else if (ventanaAdmin && !ventanaAdmin.closed) {
      ventanaAdmin.close();
      ventanaAdmin = null;
    }
    window.location.href = "/pages/padron.html";

  } catch (e) {
    if (ventanaAdmin && !ventanaAdmin.closed) {
      ventanaAdmin.close();
      ventanaAdmin = null;
    }
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
    loginBtn.removeAttribute("aria-busy");
  }
}

// --------------------------------------------------
// EVENTOS
// --------------------------------------------------

loginForm.addEventListener("submit", event => {
  event.preventDefault();
  if (emailInput.value.trim() && passwordInput.value) {
    ventanaAdmin = window.open("about:blank", "_blank");
    if (ventanaAdmin) ventanaAdmin.opener = null;
  }
  ejecutarLogin();
});

// --------------------------------------------------
// MOSTRAR / OCULTAR CONTRASEÑA
// --------------------------------------------------

togglePasswordBtn.addEventListener("click", () => {
  showPassword = !showPassword;

  passwordInput.type = showPassword ? "text" : "password";
  togglePasswordBtn.setAttribute("aria-pressed", String(showPassword));
  togglePasswordBtn.setAttribute("aria-label", showPassword ? "Ocultar contraseña" : "Mostrar contraseña");

  togglePasswordIcon.src = showPassword
    ? "../assets/images/eye-open.png"
    : "../assets/images/eye-closed.png";
});
