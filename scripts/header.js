import { authObserver, logout } from "./auth.js";

/* =====================
   NOTIFICACIONES
===================== */
function actualizarNotificaciones(cantidad) {
  const badge = document.querySelector("#notificacionesBtn .badge");
  if (!badge) return;

  if (cantidad <= 0) {
    badge.hidden = true;
    return;
  }

  badge.hidden = false;
  badge.textContent = cantidad > 99 ? "99+" : cantidad;
}

/* =====================
   HEADER
===================== */
export async function cargarHeader() {
  const container = document.getElementById("header-container");
  if (!container) return;

  try {
    // Cargar HTML del header
    const res = await fetch("/pages/header.html");
    const html = await res.text();
    container.innerHTML = html;

    // Inicializar lógica del header
    inicializarAuthHeader();

  } catch (err) {
    console.error("Error cargando header:", err);
  }
}

function inicializarAuthHeader() {
  const statusSpan = document.getElementById("status");
  const logoutBtn = document.getElementById("logoutBtn");
  const reportesBtn = document.getElementById("reportesBtn");
  const notificacionesBtn = document.getElementById("notificacionesBtn");

  authObserver(user => {
    if (!user) {
      window.location.href = "/pages/login.html";
      return;
    }

    if (statusSpan) {
      statusSpan.innerHTML =
        `Bienvenido, <strong>${user.email}</strong>`;
    }

    // Cantidad de notificaciones
    actualizarNotificaciones(5);
  });

  logoutBtn?.addEventListener("click", logout);

  reportesBtn?.addEventListener("click", () => {
    window.location.href = "/pages/reportes.html";
  });

  notificacionesBtn?.addEventListener("click", () => {
  });
}