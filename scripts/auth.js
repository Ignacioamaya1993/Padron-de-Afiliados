
import { supabase } from "./supabase.js";

const SESSION_KEY = "sesionUnicaId";

function obtenerSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);

  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
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


export async function login(identificador, password) {
  let response;

  try {
    response = await fetch("/api/padron/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        identifier: identificador,
        password
      }),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(35000)
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el servicio de inicio de sesión. Intentá nuevamente."
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "No se pudo iniciar sesión. Intentá nuevamente."
    );
  }

  if (!response.ok) {
    const mensajes = {
      INVALID_CREDENTIALS:
        "Usuario o contraseña incorrectos.",
      INVALID_REQUEST:
        "Solicitud de inicio de sesión inválida.",
      RATE_LIMITED:
        "Demasiados intentos. Esperá unos minutos e intentá nuevamente.",
      SERVICE_UNAVAILABLE:
        "No se pudo iniciar sesión. Intentá nuevamente."
    };

    const error = new Error(
      mensajes[data?.code] ||
      "No se pudo iniciar sesión. Intentá nuevamente."
    );

    error.code = data?.code;

    throw error;
  }

  if (
    typeof data?.access_token !== "string" ||
    !data.access_token ||
    typeof data?.refresh_token !== "string" ||
    !data.refresh_token
  ) {
    throw new Error(
      "No se pudo establecer una sesión válida."
    );
  }

  try {
    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    });

    if (sessionError || !sessionData?.session) {
      throw new Error(
        "No se pudo establecer una sesión válida."
      );
    }

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
    } catch {
      console.error("No se pudo liberar la sesión.");
    }

    await supabase.auth.signOut({
      scope: "local"
    });

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
    await supabase.auth.signOut({ scope: "local" });
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
