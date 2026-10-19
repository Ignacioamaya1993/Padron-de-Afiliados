
import { supabase } from "./supabase.js";
import {
  authObserver,
  logout,
  reservarSesion,
  renovarSesion
} from "./auth.js";
import { generarNotificaciones } from "./notificaciones.js";

const MAX_NOTIF = 10;
const INTERVALO_VERIFICACION = 30000;

let usuarioActual = null;
let heartbeatTimer = null;
let validandoSesion = false;
let redirigiendoLogin = false;

// =====================
// UTIL STORAGE
// =====================

function guardarUsuarioLocal(usuario) {
  localStorage.setItem("usuarioSistema", JSON.stringify(usuario));
}

function obtenerUsuarioLocal() {
  const data = localStorage.getItem("usuarioSistema");

  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    localStorage.removeItem("usuarioSistema");
    return null;
  }
}

function limpiarUsuarioLocal() {
  localStorage.removeItem("usuarioSistema");
}

// =====================
// CONTROL DE SESIÓN
// =====================

function detenerVerificacionSesion() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function cerrarSesionPorConflicto(mensaje) {
  if (redirigiendoLogin) return;

  redirigiendoLogin = true;
  detenerVerificacionSesion();
  limpiarUsuarioLocal();

  sessionStorage.setItem("mensajeSesion", mensaje);

  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Error cerrando la sesión:", error);
  } finally {
    window.location.href = "/pages/login.html";
  }
}

function iniciarVerificacionSesion() {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(async () => {
    try {
      const vigente = await renovarSesion();

      if (!vigente) {
        await cerrarSesionPorConflicto(
          "Tu sesión dejó de estar activa porque la cuenta se inició en otro dispositivo. Ingresá nuevamente."
        );
      }
    } catch (error) {
      console.error("Error verificando la sesión:", error);
    }
  }, INTERVALO_VERIFICACION);
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
    console.error("Error contando notificaciones:", error);
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
    dropdown.innerHTML =
      '<div class="notif-item">No hay notificaciones</div>';
    return;
  }

  function formatearFecha(fechaISO) {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString("es-AR");
  }

  for (const notif of data) {
    const item = document.createElement("div");
    item.classList.add("notif-item");

    if (notif.leida) {
      item.classList.add("leida");
    }

    const fechaFormateada = notif.creada
      ? formatearFecha(notif.creada)
      : "";

    const contenido = document.createElement("div");
    contenido.classList.add("notif-contenido");

    const mensaje = document.createElement("div");
    mensaje.classList.add("notif-mensaje");

    // Usar textContent para que el mensaje no se interprete como HTML.
    mensaje.textContent = notif.mensaje || "";

    const fecha = document.createElement("div");
    fecha.classList.add("notif-fecha");
    fecha.textContent = fechaFormateada;

    contenido.appendChild(mensaje);
    contenido.appendChild(fecha);
    item.appendChild(contenido);

    item.addEventListener("click", async () => {
      try {
        if (!notif.leida) {
          const { error: errorActualizacion } = await supabase
            .from("notificaciones")
            .update({ leida: true })
            .eq("id", notif.id);

          if (errorActualizacion) {
            throw errorActualizacion;
          }

          item.classList.add("leida");
          await actualizarNotificacionesBadge(usuarioActual.id);
        }

        if (notif.afiliado_id) {
          window.location.href =
            `/pages/fichaMedica.html?id=${notif.afiliado_id}` +
            `&modulo=${notif.tipo}` +
            `&registro=${notif.registro_id}`;
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

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status} al cargar el encabezado`);
    }

    const html = await res.text();
    container.innerHTML = html;

    inicializarHeader();
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

  // Cerrar al hacer clic afuera
  document.addEventListener("click", (e) => {
    if (
      !dropdown.contains(e.target) &&
      !notificacionesBtn.contains(e.target)
    ) {
      dropdown.classList.add("hidden");
    }
  });

  // =====================
  // AUTH OBSERVER + SESIÓN ÚNICA
  // =====================

  authObserver(async (user) => {
    if (!user) {
      detenerVerificacionSesion();
      limpiarUsuarioLocal();
      usuarioActual = null;

      // Evita redirigir repetidamente si ya estamos en el login.
      if (
        !window.location.pathname.endsWith("/login.html") &&
        !redirigiendoLogin
      ) {
        window.location.href = "/pages/login.html";
      }

      return;
    }

    if (validandoSesion || redirigiendoLogin) return;

    validandoSesion = true;

    try {
      // Confirmar que esta sesión corresponde al dispositivo autorizado.
      const permitida = await reservarSesion();

      if (!permitida) {
        await cerrarSesionPorConflicto(
          "Tu sesión dejó de estar activa porque la cuenta se inició en otro dispositivo. Ingresá nuevamente."
        );
        return;
      }

      // Obtener el usuario desde localStorage si corresponde.
      let usuario = obtenerUsuarioLocal();

      // Si no existe o cambió el email, consultar Supabase.
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

      // Mostrar nombre completo.
      if (statusSpan) {
        const nombre = usuario.nombre_completo || user.email;

        statusSpan.innerHTML =
          `Bienvenido/a, <strong>${nombre}</strong>`;
      }

      // Mantener las notificaciones existentes.
      await generarNotificaciones(usuarioActual);
      await actualizarNotificacionesBadge(usuarioActual.id);

      // Iniciar la verificación periódica.
      iniciarVerificacionSesion();

    } catch (error) {
      console.error("Error validando la sesión:", error);

      await cerrarSesionPorConflicto(
        "No se pudo verificar tu sesión. Ingresá nuevamente."
      );
    } finally {
      validandoSesion = false;
    }
  });

  // =====================
  // LOGOUT
  // =====================

  logoutBtn?.addEventListener("click", async () => {
    detenerVerificacionSesion();
    limpiarUsuarioLocal();
    await logout();
  });

  // =====================
  // REPORTES
  // =====================

  reportesBtn?.addEventListener("click", () => {
    window.location.href = "/pages/reportes.html";
  });
}