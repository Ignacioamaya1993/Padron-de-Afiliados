import { authObserver, logout } from "./auth.js";

export async function cargarHeader() {
  const container = document.getElementById("header-container");
  if (!container) return;

  try {
    // Cargar HTML
    const res = await fetch("/pages/header.html");
    const html = await res.text();
    container.innerHTML = html;

    // Inicializar auth DEL HEADER
    inicializarAuthHeader();

  } catch (err) {
    console.error("Error cargando header:", err);
  }
}

function inicializarAuthHeader() {
  const statusSpan = document.getElementById("status");
  const logoutBtn = document.getElementById("logoutBtn");

  authObserver(user => {
    if (!user) {
      window.location.href = "/pages/login.html";
      return;
    }

    if (statusSpan) {
      statusSpan.innerHTML =
        `Bienvenido, <strong>${user.email}</strong>`;
    }
  });

  logoutBtn?.addEventListener("click", logout);
}
