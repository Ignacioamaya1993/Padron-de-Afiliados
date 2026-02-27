// header.js
import { supabase } from "./supabase.js";
import { authObserver, logout } from "./auth.js";
import { generarNotificaciones, obtenerUltimasNotificaciones } from "./notificaciones.js";

const MAX_NOTIF = 10;

// =====================
// Actualizar badge
// =====================
export function actualizarNotificaciones(cantidad) {
  const badge = document.querySelector("#notificacionesBtn .badge");
  if (!badge) return console.log("Badge no encontrado");
  badge.hidden = cantidad <= 0;
  badge.textContent = cantidad > 99 ? "99+" : cantidad;
}

// =====================
// Renderizar dropdown
// =====================
export async function renderNotificaciones(usuario) {
  if (!usuario) return console.log("Usuario no definido para renderNotificaciones");

  const dropdown = document.getElementById("notificacionesDropdown");
  if (!dropdown) return console.log("Dropdown no encontrado en renderNotificaciones");

  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuario.id)
    .order("creada", { ascending: false })
    .limit(MAX_NOTIF);

  if (error) {
    console.error("Error fetch notificaciones:", error);
    actualizarNotificaciones(0);
    dropdown.innerHTML = "";
    return;
  }

  const notifs = data || [];
  console.log("Notificaciones obtenidas:", notifs);

  actualizarNotificaciones(notifs.filter(n => !n.leida).length);

  dropdown.innerHTML = "";
  notifs.forEach(n => {
    const item = document.createElement("div");
    item.className = "notif-item";
    item.textContent = n.mensaje;
    item.dataset.id = n.id;
    item.dataset.tabla = n.tipo;
    item.dataset.afiliadoId = n.afiliado_id; // crucial para redirigir

    item.addEventListener("click", async () => {
      console.log("Notificación clickeada:", n.mensaje);

      // cambio de color al click
      item.style.background = "#f9f9f9";

      // marcar notificación como leída
      if (!n.leida) {
        const { error: errUpdate } = await supabase
          .from("notificaciones")
          .update({ leida: true })
          .eq("id", n.id);
        if (errUpdate) console.error("Error marcando notificación como leída:", errUpdate);
        else n.leida = true;
      }

      // actualizar badge
      actualizarNotificacionesBadge(usuario.id);

      // redirigir a fichaMedica.html con afiliado y módulo
      const targetAfiliadoId = n.afiliado_id || usuario.id;
      const targetModulo = n.tipo;
      if (targetAfiliadoId && targetModulo) {
        const url = `/pages/fichaMedica.html?id=${targetAfiliadoId}&modulo=${targetModulo}`;
        console.log("Redirigiendo a:", url);
        window.location.href = url;
      } else {
        console.warn("Faltan afiliado_id o tipo para redirigir");
      }
    });

    dropdown.appendChild(item);
  });
}

// =====================
// Actualizar badge desde DB
// =====================
export async function actualizarNotificacionesBadge(usuarioId) {
  const { count, error } = await supabase
    .from("notificaciones")
    .select("*", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .eq("leida", false);

  if (error) {
    console.error("Error contar notificaciones:", error);
    actualizarNotificaciones(0);
    return;
  }

  console.log("Cantidad de notificaciones no leídas:", count);
  actualizarNotificaciones(count || 0);
}

// =====================
// Cargar header
// =====================
export async function cargarHeader() {
  const container = document.getElementById("header-container");
  if (!container) return console.log("Container header-container no encontrado");

  try {
    const res = await fetch("/pages/header.html");
    const html = await res.text();
    container.innerHTML = html;
    console.log("Header cargado correctamente");
    inicializarAuthHeader();
  } catch (err) {
    console.error("Error cargando header:", err);
  }
}

// =====================
// Inicializar header
// =====================
function inicializarAuthHeader() {
  const statusSpan = document.getElementById("status");
  const logoutBtn = document.getElementById("logoutBtn");
  const reportesBtn = document.getElementById("reportesBtn");
  const notificacionesBtn = document.getElementById("notificacionesBtn");
  const dropdown = document.getElementById("notificacionesDropdown");

  if (!notificacionesBtn || !dropdown) return;

  // Toggle dropdown
  notificacionesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
    console.log("Campana clickeada, dropdown hidden?", dropdown.classList.contains("hidden"));
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== notificacionesBtn) {
      dropdown.classList.add("hidden");
    }
  });

  // Observador de auth
  authObserver(async user => {
    console.log("authObserver llamado, user:", user);
    if (!user) {
      window.location.href = "/pages/login.html";
      return;
    }

    if (statusSpan) statusSpan.innerHTML = `Bienvenido, <strong>${user.email}</strong>`;

    const { data: usuario } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", user.email)
      .single();

    if (!usuario) return;

    console.log("Usuario obtenido de tabla usuarios:", usuario);

    await generarNotificaciones(usuario);
    await actualizarNotificacionesBadge(usuario.id);
    await renderNotificaciones(usuario);
  });

  logoutBtn?.addEventListener("click", logout);
  reportesBtn?.addEventListener("click", () => { window.location.href = "/pages/reportes.html"; });
}

// =====================
// Escucha para abrir módulo (fichaMedica)
document.addEventListener("abrirModulo", (e) => {
  const moduleName = e.detail;
  console.log("Evento abrirModulo recibido:", moduleName);

  const btn = Array.from(document.querySelectorAll(".tab-button"))
                   .find(b => b.dataset.module === moduleName);

  if (!btn) {
    console.warn("No se encontró pestaña para módulo:", moduleName);
    return;
  }

  btn.click();
});