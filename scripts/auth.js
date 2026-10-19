
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
      await supabase.auth.signOut();

      const errorSesion = new Error(
        "Este usuario ya tiene una sesión iniciada en otro dispositivo."
      );

      errorSesion.code = "SESION_ACTIVA";
      throw errorSesion;
    }
  } catch (e) {
    await supabase.auth.signOut();
    throw e;
  }
}

// LOGOUT
export async function logout() {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
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
