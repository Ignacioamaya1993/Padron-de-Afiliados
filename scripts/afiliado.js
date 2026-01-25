import { supabase } from "./supabase.js";

const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) {
  Swal.fire("Error", "Afiliado no encontrado", "error");
  throw new Error("ID faltante");
}

let afiliado = null;
let modoEdicion = false;

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

function mostrarEstado(activo) {
  const status = document.getElementById("status");
  if (activo) {
    status.textContent = "🟢 ACTIVO";
    status.style.color = "#16a34a";
  } else {
    status.textContent = "🔴 DADO DE BAJA";
    status.style.color = "#dc2626";
  }
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

  afiliado = data;
  renderFicha();
  cargarGrupoFamiliar();
}

/* =====================
   RENDER FICHA
===================== */

function renderFicha() {
  document.getElementById("nombreCompleto").textContent =
    `${afiliado.nombre} ${afiliado.apellido}`;

  document.getElementById("dni").textContent = afiliado.dni;
  document.getElementById("fechaNacimiento").textContent =
    afiliado.fecha_nacimiento || "-";

  const edad = calcularEdad(afiliado.fecha_nacimiento);
  document.getElementById("edad").textContent =
    edad !== null ? `${edad} años` : "-";

  document.getElementById("telefono").textContent =
    afiliado.telefono || "-";

  document.getElementById("numeroAfiliado").textContent =
    afiliado.numero_afiliado;

  document.getElementById("grupoFamiliar").textContent =
    afiliado.grupo_familiar;

  document.getElementById("relacion").textContent =
    afiliado.relacion;

  // Estudios
  const estudiosField = document.getElementById("estudiosField");
  if (
    afiliado.relacion === "Hijo/a" &&
    edad >= 18 &&
    edad <= 25
  ) {
    estudiosField.style.display = "block";
    document.getElementById("estudios").textContent =
      afiliado.estudios || "-";
  } else {
    estudiosField.style.display = "none";
  }

  mostrarEstado(afiliado.activo);

  salirModoEdicion();

  // Si está dado de baja → bloquear acciones
  if (!afiliado.activo) {
    document.getElementById("btnEditar").style.display = "none";
    document.getElementById("btnBaja").style.display = "none";
  }
}

/* =====================
   MODO EDICIÓN
===================== */

function entrarModoEdicion() {
  if (!afiliado.activo) return;

  modoEdicion = true;

  reemplazarPorInput("telefono", afiliado.telefono);
  reemplazarPorInput("fechaNacimiento", afiliado.fecha_nacimiento, "date");
  reemplazarPorInput("numeroAfiliado", afiliado.numero_afiliado);

  // Estudios → select
  if (document.getElementById("estudiosField").style.display === "block") {
    const span = document.getElementById("estudios");
    const select = document.createElement("select");
    select.id = "estudios";

    ["Primario", "Secundario", "Terciario", "Universitario"].forEach(op => {
      const o = document.createElement("option");
      o.value = op;
      o.textContent = op;
      if (op === afiliado.estudios) o.selected = true;
      select.appendChild(o);
    });

    span.replaceWith(select);
  }

  toggleBotones(true);
}

function salirModoEdicion() {
  modoEdicion = false;
  toggleBotones(false);
}

function reemplazarPorInput(id, valor, tipo = "text") {
  const span = document.getElementById(id);
  if (!span) return;

  const input = document.createElement("input");
  input.type = tipo;
  input.id = id;
  input.value = valor || "";
  span.replaceWith(input);
}

function toggleBotones(editando) {
  document.getElementById("btnEditar").style.display =
    editando ? "none" : "inline-block";
  document.getElementById("btnGuardar").style.display =
    editando ? "inline-block" : "none";
  document.getElementById("btnCancelar").style.display =
    editando ? "inline-block" : "none";
}

/* =====================
   GUARDAR
===================== */

async function guardarCambios() {
  const payload = {
    telefono: document.getElementById("telefono").value || null,
    fecha_nacimiento: document.getElementById("fechaNacimiento").value || null,
    numero_afiliado: document.getElementById("numeroAfiliado").value,
  };

  const estudiosEl = document.getElementById("estudios");
  if (estudiosEl && estudiosEl.tagName === "SELECT") {
    payload.estudios = estudiosEl.value;
  }

  // Si cambia número → actualizar grupo familiar
  if (payload.numero_afiliado !== afiliado.numero_afiliado) {
    payload.grupo_familiar = payload.numero_afiliado;
  }

  const { error } = await supabase
    .from("afiliados")
    .update(payload)
    .eq("id", afiliado.id);

  if (error) {
    Swal.fire("Error", error.message, "error");
    return;
  }

  Swal.fire("Guardado", "Cambios guardados", "success");
  cargarAfiliado();
}

/* =====================
   BAJA / ELIMINAR
===================== */

async function darDeBaja() {
  const res = await Swal.fire({
    title: "¿Dar de baja afiliado?",
    text: "El afiliado quedará inactivo",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Dar de baja"
  });

  if (!res.isConfirmed) return;

  await supabase
    .from("afiliados")
    .update({ activo: false })
    .eq("id", afiliado.id);

  Swal.fire("Baja realizada", "", "success");
  cargarAfiliado();
}

async function eliminarDefinitivo() {
  const res = await Swal.fire({
    title: "ELIMINAR DEFINITIVAMENTE",
    text: "Esta acción no se puede deshacer",
    icon: "error",
    showCancelButton: true,
    confirmButtonText: "Eliminar"
  });

  if (!res.isConfirmed) return;

  await supabase
    .from("afiliados")
    .delete()
    .eq("id", afiliado.id);

  Swal.fire("Eliminado", "", "success");
  window.location.href = "/pages/padron.html";
}

/* =====================
   GRUPO FAMILIAR
===================== */

async function cargarGrupoFamiliar() {
  if (!afiliado.grupo_familiar) return;

  const { data } = await supabase
    .from("afiliados")
    .select("id, nombre, apellido, dni, numero_afiliado, relacion, activo")
    .eq("grupo_familiar", afiliado.grupo_familiar)
    .order("relacion");

  const tbody = document.querySelector("#tablaGrupoFamiliar tbody");
  tbody.innerHTML = "";

  data.forEach(a => {
    const tr = document.createElement("tr");

    if (a.id === afiliado.id) {
      tr.style.background = "#e0f2fe";
      tr.style.fontWeight = "600";
    }

    tr.innerHTML = `
      <td>${a.nombre} ${a.apellido}</td>
      <td>${a.dni}</td>
      <td>${a.numero_afiliado}</td>
      <td>${a.relacion}</td>
      <td>${a.activo ? "🟢" : "🔴"}</td>
    `;

    tbody.appendChild(tr);
  });
}

/* =====================
   EVENTOS
===================== */

document.getElementById("btnEditar").onclick = entrarModoEdicion;
document.getElementById("btnGuardar").onclick = guardarCambios;
document.getElementById("btnCancelar").onclick = renderFicha;
document.getElementById("btnBaja").onclick = darDeBaja;
document.getElementById("btnEliminar").onclick = eliminarDefinitivo;

/* =====================
   INIT
===================== */

cargarAfiliado();
