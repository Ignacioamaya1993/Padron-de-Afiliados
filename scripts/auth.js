import { supabase } from "./supabase.js";

export function authObserver(cb) {
  const session = supabase.auth.getSession();
  session.then(({ data }) => cb(data.session?.user || null));

  supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user || null);
  });
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/pages/login.html";
}
