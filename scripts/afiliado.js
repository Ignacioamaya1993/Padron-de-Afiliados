import { authObserver, logout } from "./auth.js";
import { supabase } from "./supabase.js";

/* =====================
   HELPERS
===================== */
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;

  const hoy = new Date();
  const fn = new Date(fechaNacimiento);

  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();

  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) {
    edad--;
  }

  return edad;
}

function formatearFecha(fecha) {
  if (!fecha) return "-";
  const f = new Date(fecha);
  return f.toLocaleDateString("es-AR");
}

/* =====================
   AUTH
===================== */
authObserver(user => {
  if (!user) {
    window.location.href = "/pages/login.html";
    return;
  }

  document.getElementById("status").textContent =
    `Bienvenido ${user.email}`;
});

document
  .getElementById("logoutBtn")
  ?.addEventListener("click", logout);

/* =====================
   CARGAR AFILIADO
===================== */
const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) {
  Swal.fire("Error", "Afiliado no especificado", "error");
  throw new Error("ID faltante");
}

async function cargarAfiliado() {
  try {
    const { data, error } = await supabase
      .from("afiliados")
      .select("*")
      .eq("id", afiliadoId)
      .single();

    if (error) throw error;

    const edad = calcularEdad(data.fecha_nacimiento);

    document.getElementById("nombreCompleto").textContent =
      data.nombre_completo;

    document.getElementById("dni").textContent =
      data.dni || "-";

    document.getElementById("fechaNacimiento").textContent =
      formatearFecha(data.fecha_nacimiento);

    document.getElementById("edad").textContent =
      edad !== null ? edad : "-";

    document.getElementById("telefono").textContent =
      data.telefono || "-";

    document.getElementById("numeroAfiliado").textContent =
      data.numero_afiliado;

    document.getElementById("grupoFamiliar").textContent =
      data.grupo_familiar_codigo;

    document.getElementById("relacion").textContent =
      data.relacion;

    // Estudios solo si corresponde
    if (
      data.relacion === "Hijo/a" &&
      edad >= 18 &&
      edad <= 25 &&
      data.estudios
    ) {
      document.getElementById("estudios").textContent =
        data.estudios;
      document.getElementById("estudiosField").style.display = "block";
    }

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo cargar el afiliado", "error");
  }
}

cargarAfiliado();
