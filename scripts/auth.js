
import { supabase } from "./supabase.js";

const SESSION_KEY = "sesionUnicaId";

function obtenerSessionId() {
  let id = localStorage.getItem(SESSION_KEY);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }

  return id;
}


function obtenerNombreNavegador() {
  const ua = navigator.userAgent;
  let nombre = "Navegador desconocido";

  if (/Edg\//i.test(ua)) {
    nombre = "Microsoft Edge";
  } else if (/OPR\//i.test(ua)) {
    nombre = "Opera";
  } else if (/Chrome\//i.test(ua)) {
    nombre = "Google Chrome";
  } else if (/Firefox\//i.test(ua)) {
    nombre = "Mozilla Firefox";
  } else if (/Safari\//i.test(ua)) {
    nombre = "Safari";
  }

  const version = {
    "Google Chrome": /Chrome\/([\d.]+)/,
    "Microsoft Edge": /Edg\/([\d.]+)/,
    "Opera": /OPR\/([\d.]+)/,
    "Mozilla Firefox": /Firefox\/([\d.]+)/,
    "Safari": /Version\/([\d.]+)/
  }[nombre];

  const coincidencia = version ? ua.match(version) : null;

  return coincidencia
    ? `${nombre} ${coincidencia[1]}`
    : nombre;
}

// VALIDAR / RESERVAR SESIÓN ÚNICA
export async function reservarSesion() {
  const { data: { session }, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !session) return false;

  const { data, error } = await supabase.rpc("reservar_sesion", {
    p_session_id: obtenerSessionId()
  });

  if (error) {
    console.error("Error al validar sesión:", error);
    throw new Error("No se pudo validar la sesión. Intentá nuevamente.");
  }

  return data === true;
}

// RENOVAR SESIÓN ÚNICA
export async function renovarSesion() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return false;

  const { data, error } = await supabase.rpc("renovar_sesion", {
    p_session_id: obtenerSessionId()
  });

  if (error) {
    console.error("Error al renovar sesión:", error);
    throw new Error("No se pudo verificar la sesión.");
  }

  return data === true;
}

// REGISTRAR INICIO EN EL HISTORIAL
async function registrarInicioHistorial() {
  const { error } = await supabase.rpc("registrar_inicio_historial", {
    p_session_id: obtenerSessionId(),
p_navegador: obtenerNombreNavegador()
  });

  if (error) {
    console.error("Error registrando inicio de sesión:", error);
    throw new Error("No se pudo registrar el inicio de sesión.");
  }
}

// ACTUALIZAR ÚLTIMA ACTIVIDAD
export async function actualizarActividadHistorial() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return false;

  const { data, error } = await supabase.rpc(
    "actualizar_actividad_historial",
    { p_session_id: obtenerSessionId() }
  );

  if (error) {
    console.error("Error actualizando actividad:", error);
    return false;
  }

  return data === true;
}

// REGISTRAR MOTIVO DE CIERRE
export async function cerrarHistorialSesion(motivo = "otro") {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return false;

  const { data, error } = await supabase.rpc(
    "cerrar_historial_sesion",
    {
      p_session_id: obtenerSessionId(),
      p_motivo: motivo
    }
  );

  if (error) {
    console.error("Error registrando cierre de sesión:", error);
    return false;
  }

  return data === true;
}

// LOGIN
export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  try {
    const permitida = await reservarSesion();

    if (!permitida) {
      const errorSesion = new Error(
        "Este usuario ya tiene una sesión iniciada en otro dispositivo."
      );
      errorSesion.code = "SESION_ACTIVA";
      throw errorSesion;
    }

    // Solo registrar si la sesión única fue aceptada.
    await registrarInicioHistorial();

  } catch (e) {
    try {
      await supabase.rpc("liberar_sesion", {
        p_session_id: obtenerSessionId()
      });
    } catch (errorLiberacion) {
      console.error("Error liberando la sesión:", errorLiberacion);
    }

    await supabase.auth.signOut();
    throw e;
  }
}

// LOGOUT
export async function logout(motivo = "manual") {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      await cerrarHistorialSesion(motivo);

      const { error } = await supabase.rpc("liberar_sesion", {
        p_session_id: obtenerSessionId()
      });

      if (error) {
        console.error("No se pudo liberar la sesión:", error);
      }
    }
  } finally {
    await supabase.auth.signOut();
    window.location.href = "/pages/login.html";
  }
}

// OBSERVADOR DE AUTH
export function authObserver(callback) {
  supabase.auth.getSession().then(({ data }) => {
    callback(data.session?.user ?? null);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}
