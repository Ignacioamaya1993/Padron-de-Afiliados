import { supabase } from "./supabase.js";

/* =====================
   LOGIN
===================== */
export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
}

/* =====================
   LOGOUT
===================== */
export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/pages/login.html";
}

/* =====================
   OBSERVADOR DE AUTH
===================== */
export function authObserver(callback) {
  supabase.auth.getSession().then(({ data }) => {
    callback(data.session?.user ?? null);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}
