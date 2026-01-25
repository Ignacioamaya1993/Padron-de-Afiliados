import { supabase } from "./supabase.js";

const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

let afiliadoOriginal = null;
let modoEdicion = false;

/* =====================
   HELPERS
===================== */

function calcularEdad(fecha) {
  if (!fecha) return "-";
  const hoy = new Date();
  const nac = new Date(fecha);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
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

  if (error) {
    Swal.fire("Error", "No se pudo cargar el afiliado", "error");
    return;
  }

  afiliadoOriginal = data;
  renderVista(data);
  cargarGrupoFamiliar(data.grupo_familiar);
}

/* =====================
   RENDER FICHA
===================== */

function renderVista(a) {
  document.getElementById("nombreCompleto").textContent =
    `${a.nombre} ${a.apellido}`;

  document.getElementById("dni").textContent = a.dni;
  document.getElementById("fechaNacimiento").textContent =
    a.fecha_nacimiento || "-";
  document.getElementById("edad").textContent =
    calcularEdad(a.fecha_nacimiento);
  document.getElementById("telefono").textContent = a.telefono || "-";
  document.getElementById("numeroAfiliado").textContent = a.numero_afiliado;
  document.getElementById("grupoFamiliar").textContent = a.grupo_familiar;
  document.getElementById("relacion").textContent = a.relacion;

  if (a.estudios) {
    document.getElementById("estudiosField").style.display = "block";
    document.getElementById("estudios").textContent = a.estudios;
  } else {
    document.getElementById("estudiosField").style.display = "none";
  }

  salirModoEdicion();
}

/* =====================
   MODO EDICIÓN
===================== */

const camposEditables = [
  "telefono",
  "fechaNacimiento",
  "numeroAfiliado",
  "relacion",
  "estudios"
];

function entrarModoEdicion() {
  if (modoEdicion) return;
  modoEdicion = true;

  camposEditables.forEach(id => {
    const span = document.getElementById(id);
    if (!span) return;

    const input = document.createElement("input");
    input.value = afiliadoOriginal[idMap(id)] || "";
    input.id = id;
    span.replaceWith(input);
  });

  toggleBotones(true);
}

function salirModoEdicion() {
  modoEdicion = false;

  camposEditables.forEach(id => {
    const input = document.getElementById(id);
    if (!input || input.tagName !== "INPUT") return;

    const span = document.createElement("span");
    span.id = id;
    span.textContent = afiliadoOriginal[idMap(id)] || "-";
    input.replaceWith(span);
  });

  toggleBotones(false);
}

function toggleBotones(editando) {
  document.getElementById("btnEditar").style.display = editando ? "none" : "inline-block";
  document.getElementById("btnGuardar").style.display = editando ? "inline-block" : "none";
  document.getElementById("btnCancelar").style.display = editando ? "inline-block" : "none";
}

function idMap(id) {
  return {
    fechaNacimiento: "fecha_nacimiento",
    numeroAfiliado: "numero_afiliado"
  }[id] || id;
}

/* =====================
   GUARDAR CAMBIOS
===================== */

async function guardarCambios() {
  const payload = {};

  camposEditables.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === "INPUT") {
      payload[idMap(id)] = el.value.trim() || null;
    }
  });

  // 🔑 Si cambia el número de afiliado → actualizar grupo familiar
  if (
    payload.numero_afiliado &&
    payload.numero_afiliado !== afiliadoOriginal.numero_afiliado
  ) {
    payload.grupo_familiar = payload.numero_afiliado;
  }

  const { error } = await supabase
    .from("afiliados")
    .update(payload)
    .eq("id", afiliadoId);

  if (error) {
    Swal.fire("Error", error.message, "error");
    return;
  }

  afiliadoOriginal = { ...afiliadoOriginal, ...payload };

  Swal.fire("Guardado", "Cambios guardados correctamente", "success");
  renderVista(afiliadoOriginal);
  cargarGrupoFamiliar(afiliadoOriginal.grupo_familiar);
}

/* =====================
   GRUPO FAMILIAR
===================== */

async function cargarGrupoFamiliar(grupo) {
  const { data, error } = await supabase
    .from("afiliados")
    .select("id, nombre, apellido, dni, numero_afiliado, relacion")
    .eq("grupo_familiar", grupo)
    .order("relacion");

  if (error) return;

  const tbody = document.querySelector("#tablaGrupoFamiliar tbody");
  tbody.innerHTML = "";

  data.forEach(a => {
    const tr = document.createElement("tr");

    if (a.id === afiliadoOriginal.id) {
      tr.style.background = "#e0f2fe";
      tr.style.fontWeight = "600";
    }

    tr.innerHTML = `
      <td>${a.nombre} ${a.apellido}</td>
      <td>${a.dni}</td>
      <td>${a.numero_afiliado}</td>
      <td>${a.relacion}</td>
    `;

    tbody.appendChild(tr);
  });
}

/* =====================
   EVENTOS
===================== */

document.getElementById("btnEditar").onclick = entrarModoEdicion;
document.getElementById("btnGuardar").onclick = guardarCambios;
document.getElementById("btnCancelar").onclick = () =>
  renderVista(afiliadoOriginal);

/* =====================
   INIT
===================== */

cargarAfiliado();
