import { supabase } from "./supabase.js";
import { authObserver, logout } from "./auth.js";

/* =====================
   AUTH
===================== */
authObserver(user => {
  if (!user) {
    window.location.href = "/pages/login.html";
    return;
  }
  document.getElementById("status").textContent = `Bienvenido ${user.email}`;
});

document.getElementById("logoutBtn")?.addEventListener("click", logout);

/* =====================
   ID
===================== */
const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) {
  Swal.fire("Error", "Afiliado no encontrado", "error");
  throw new Error("ID faltante");
}

let afiliadoActual = null;
let editando = false;

/* =====================
   HELPERS
===================== */
function calcularEdad(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  const fn = new Date(fecha);
  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
  return edad;
}

/* =====================
   CARGAR AFILIADO
===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase
    .from("afiliados")
    .select("*")
    .eq("id", afiliadoId)
    .single();

  if (error || !data) {
    Swal.fire("Error", "No se pudo cargar el afiliado", "error");
    return;
  }

  afiliadoActual = data;
  render();
}

/* =====================
   RENDER
===================== */
function render() {
  const a = afiliadoActual;
  editando ? renderEdit() : renderView(a);
}

function renderView(a) {
  editando = false;

  document.getElementById("nombreCompleto").innerHTML =
    `${a.nombre} ${a.apellido}` +
    (!a.activo ? ` <span style="color:#dc2626">(BAJA)</span>` : "");

  setSpan("dni", a.dni);
  setSpan("telefono", a.telefono);
  setSpan("numeroAfiliado", a.numero_afiliado);
  setSpan("grupoFamiliar", a.grupo_familiar_codigo);
  setSpan("relacion", a.relacion);

  if (a.fecha_nacimiento) {
    setSpan(
      "fechaNacimiento",
      new Date(a.fecha_nacimiento).toLocaleDateString("es-AR")
    );
    setSpan("edad", `${calcularEdad(a.fecha_nacimiento)} años`);
  } else {
    setSpan("fechaNacimiento", "-");
    setSpan("edad", "-");
  }

  const edad = calcularEdad(a.fecha_nacimiento);
  const estudiosField = document.getElementById("estudiosField");

  if (
    a.relacion === "Hijo/a" &&
    edad >= 18 &&
    edad <= 25 &&
    a.estudios
  ) {
    estudiosField.style.display = "block";
    setSpan("estudios", a.estudios);
  } else {
    estudiosField.style.display = "none";
  }

  toggleButtons();
}

function renderEdit() {
  editando = true;

  replaceWithInput("dni", afiliadoActual.dni);
  replaceWithInput("telefono", afiliadoActual.telefono);
  replaceWithInput("numeroAfiliado", afiliadoActual.numero_afiliado);
  replaceWithInput("fechaNacimiento", afiliadoActual.fecha_nacimiento, "date");

  replaceWithSelect("relacion", ["Titular", "Cónyuge", "Hijo/a", "Otro"], afiliadoActual.relacion);
  replaceWithSelect("estudios", ["Terciario", "Universitario", "Posgrado"], afiliadoActual.estudios);

  toggleButtons();
}

/* =====================
   DOM HELPERS
===================== */
function setSpan(id, value) {
  document.getElementById(id).textContent = value || "-";
}

function replaceWithInput(id, value, type = "text") {
  const el = document.getElementById(id);
  el.innerHTML = `<input type="${type}" id="${id}Input" value="${value || ""}">`;
}

function replaceWithSelect(id, options, selected) {
  const el = document.getElementById(id);
  el.innerHTML = `
    <select id="${id}Input">
      ${options
        .map(
          o => `<option value="${o}" ${o === selected ? "selected" : ""}>${o}</option>`
        )
        .join("")}
    </select>
  `;
}

function toggleButtons() {
  document.getElementById("btnEditar").style.display =
    !editando && afiliadoActual.activo ? "inline-block" : "none";
  document.getElementById("btnGuardar").style.display =
    editando ? "inline-block" : "none";
  document.getElementById("btnCancelar").style.display =
    editando ? "inline-block" : "none";
  document.getElementById("btnBaja").style.display =
    afiliadoActual.activo ? "inline-block" : "none";
}

/* =====================
   EVENTS
===================== */
document.getElementById("btnEditar").onclick = () => {
  renderEdit();
};

document.getElementById("btnCancelar").onclick = () => {
  renderView(afiliadoActual);
};

document.getElementById("btnGuardar").onclick = async () => {
  const payload = {
    dni: document.getElementById("dniInput").value.trim(),
    telefono: document.getElementById("telefonoInput").value.trim() || null,
    numero_afiliado: document.getElementById("numeroAfiliadoInput").value.trim(),
    fecha_nacimiento: document.getElementById("fechaNacimientoInput").value || null,
    relacion: document.getElementById("relacionInput").value,
    estudios: document.getElementById("estudiosInput")?.value || null
  };

  const { error } = await supabase
    .from("afiliados")
    .update(payload)
    .eq("id", afiliadoId);

  if (error) {
    if (error.code === "23505") {
      Swal.fire("Duplicado", "DNI o número de afiliado ya existe", "warning");
      return;
    }
    Swal.fire("Error", "No se pudo guardar", "error");
    return;
  }

  Swal.fire("Guardado", "Cambios actualizados", "success");
  cargarAfiliado();
};

document.getElementById("btnBaja").onclick = async () => {
  const res = await Swal.fire({
    title: "¿Dar de baja?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Dar de baja"
  });

  if (!res.isConfirmed) return;

  await supabase
    .from("afiliados")
    .update({ activo: false })
    .eq("id", afiliadoId);

  Swal.fire("Baja realizada", "", "success");
  cargarAfiliado();
};

document.getElementById("btnEliminar").onclick = async () => {
  const res = await Swal.fire({
    title: "ELIMINAR DEFINITIVO",
    text: "Esta acción no se puede deshacer",
    icon: "error",
    showCancelButton: true,
    confirmButtonText: "Eliminar"
  });

  if (!res.isConfirmed) return;

  await supabase.from("afiliados").delete().eq("id", afiliadoId);
  Swal.fire("Eliminado", "", "success");
  window.location.href = "/pages/padron.html";
};

/* =====================
   INIT
===================== */
cargarAfiliado();
