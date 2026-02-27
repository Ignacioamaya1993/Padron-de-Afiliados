import { supabase } from "./supabase.js";
import { authObserver, logout } from "./auth.js";
import { generarNotificaciones } from "./notificaciones.js";

const MAX_NOTIF = 10;

let headerInicializado = false;
let usuarioActual = null;

// =====================
// UTIL STORAGE
// =====================
function guardarUsuarioLocal(usuario) {
  localStorage.setItem("usuarioSistema", JSON.stringify(usuario));
}

function obtenerUsuarioLocal() {
  const data = localStorage.getItem("usuarioSistema");
  return data ? JSON.parse(data) : null;
}

function limpiarUsuarioLocal() {
  localStorage.removeItem("usuarioSistema");
}

// =====================
// ACTUALIZAR BADGE
// =====================
export function actualizarNotificaciones(cantidad) {
  const badge = document.querySelector("#notificacionesBtn .badge");
  if (!badge) return;

  if (cantidad > 0) {
    badge.textContent = cantidad;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

// =====================
// CONTAR NO LEÍDAS
// =====================
async function actualizarNotificacionesBadge(usuarioId) {
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

  actualizarNotificaciones(count || 0);
}

// =====================
// RENDER NOTIFICACIONES
// =====================
async function renderNotificaciones() {
  if (!usuarioActual) return;

  const dropdown = document.getElementById("notificacionesDropdown");
  if (!dropdown) return;

  dropdown.innerHTML = "";

  const tiposPermitidos = usuarioActual.notificaciones || [];

  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuarioActual.id)
    .in("tipo", tiposPermitidos)
    .order("creada", { ascending: false })
    .limit(MAX_NOTIF);

  if (error) {
    console.error("Error cargando notificaciones:", error);
    return;
  }

  if (!data || data.length === 0) {
    dropdown.innerHTML = `<div class="notif-item">No hay notificaciones</div>`;
    return;
  }

  for (const notif of data) {
    const item = document.createElement("div");
    item.classList.add("notif-item");

    if (notif.leida) item.classList.add("leida");

    // Formatear fecha
    function formatearFecha(fechaISO) {
      const fecha = new Date(fechaISO);
      return fecha.toLocaleDateString("es-AR");
    }

    const fechaFormateada = notif.creada
      ? formatearFecha(notif.creada)
      : "";

    // Crear estructura interna
    item.innerHTML = `
      <div class="notif-contenido">
        <div class="notif-mensaje">${notif.mensaje}</div>
        <div class="notif-fecha">${fechaFormateada}</div>
      </div>
    `;

    item.addEventListener("click", async () => {
      try {
        if (!notif.leida) {
          await supabase
            .from("notificaciones")
            .update({ leida: true })
            .eq("id", notif.id);

          item.classList.add("leida");
          await actualizarNotificacionesBadge(usuarioActual.id);
        }

      if (notif.afiliado_id) {
        window.location.href =
          `/pages/fichaMedica.html?id=${notif.afiliado_id}&modulo=${notif.tipo}`;
      }
      } catch (err) {
        console.error("Error al procesar notificación:", err);
      }
    });

    dropdown.appendChild(item);
  }
}

// =====================
// CARGAR HEADER
// =====================
export async function cargarHeader() {
  const container = document.getElementById("header-container");
  if (!container) return;

  try {
    const res = await fetch("/pages/header.html");
    const html = await res.text();
    container.innerHTML = html;

    if (!headerInicializado) {
      inicializarHeader();
      headerInicializado = true;
    }

  } catch (err) {
    console.error("Error cargando header:", err);
  }
}

// =====================
// INICIALIZAR HEADER
// =====================
function inicializarHeader() {
  const statusSpan = document.getElementById("status");
  const logoutBtn = document.getElementById("logoutBtn");
  const reportesBtn = document.getElementById("reportesBtn");
  const notificacionesBtn = document.getElementById("notificacionesBtn");
  const dropdown = document.getElementById("notificacionesDropdown");

  if (!notificacionesBtn || !dropdown) return;

  // Toggle dropdown
  notificacionesBtn.addEventListener("click", async (e) => {
    e.stopPropagation();

    dropdown.classList.toggle("hidden");

    if (!dropdown.classList.contains("hidden")) {
      await renderNotificaciones();
      if (usuarioActual) {
        await actualizarNotificacionesBadge(usuarioActual.id);
      }
    }
  });

  // Cerrar al hacer click afuera
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== notificacionesBtn) {
      dropdown.classList.add("hidden");
    }
  });

  // =====================
  // AUTH OBSERVER
  // =====================
  authObserver(async user => {

    if (!user) {
      limpiarUsuarioLocal();
      window.location.href = "/pages/login.html";
      return;
    }

    // Intentar traer usuario desde localStorage
    let usuario = obtenerUsuarioLocal();

    // Si no existe o cambió el email → consultar DB
    if (!usuario || usuario.email !== user.email) {

      const { data, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("email", user.email)
        .single();

      if (error || !data) {
        console.error("Error obteniendo usuario:", error);
        return;
      }

      usuario = data;
      guardarUsuarioLocal(usuario);
    }

    usuarioActual = usuario;

    // Mostrar nombre completo
    if (statusSpan) {
      const nombre = usuario.nombre_completo || user.email;
      statusSpan.innerHTML = `Bienvenido/a, <strong>${nombre}</strong>`;
    }

    // Generar notificaciones una sola vez por sesión
    await generarNotificaciones(usuarioActual);

    await actualizarNotificacionesBadge(usuarioActual.id);
  });

  // =====================
  // LOGOUT
  // =====================
  logoutBtn?.addEventListener("click", async () => {
    limpiarUsuarioLocal();
    await logout();
  });

  reportesBtn?.addEventListener("click", () => {
    window.location.href = "/pages/reportes.html";
  });
}