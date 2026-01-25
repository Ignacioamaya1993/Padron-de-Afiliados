import { supabase } from "./supabase.js";

/* =====================
   PARAMS
===================== */

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

function mostrarEstadoAfiliado(activo) {
  const estado = document.getElementById("estadoAfiliado");
  if (!estado) return;

  if (activo) {
    estado.textContent = "Activo";
    estado.style.color = "";
    estado.style.fontWeight = "normal";
  } else {
    estado.textContent = "Dado de baja";
    estado.style.color = "#dc2626";
    estado.style.fontWeight = "700";
  }
}

/* =====================
   CARGAR AFILIADO
==================== */

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
==================== */

function renderFicha() {
  modoEdicion = false;

  document.getElementById("nombreCompleto").textContent =
    `${afiliado.nombre} ${afiliado.apellido}`;
  document.getElementById("dni").textContent = afiliado.dni;
  document.getElementById("fechaNacimiento").textContent = afiliado.fecha_nacimiento || "-";

  const edad = calcularEdad(afiliado.fecha_nacimiento);
  document.getElementById("edad").textContent = edad !== null ? `${edad} años` : "-";

  document.getElementById("telefono").textContent = afiliado.telefono || "-";
  document.getElementById("numeroAfiliado").textContent = afiliado.numero_afiliado || "-";
  document.getElementById("grupoFamiliar").textContent = afiliado.grupo_familiar_codigo || "-";
  document.getElementById("relacion").textContent = afiliado.relacion;
  mostrarEstadoAfiliado(afiliado.activo);

  // Estudios
  const estudiosField = document.getElementById("estudiosField");
  if (afiliado.relacion === "Hijo/a" && edad >= 18 && edad <= 25) {
    estudiosField.style.display = "block";
    document.getElementById("estudios").textContent = afiliado.estudios || "-";
  } else {
    estudiosField.style.display = "none";
  }

  toggleBotones(false);

  document.getElementById("btnEditar").style.display = afiliado.activo ? "inline-block" : "none";
  document.getElementById("btnBaja").style.display = afiliado.activo ? "inline-block" : "none";
  document.getElementById("btnReactivar").style.display = afiliado.activo ? "none" : "inline-block";
}

/* =====================
   MODO EDICIÓN
==================== */

function entrarModoEdicion() {
  if (!afiliado.activo) return;

  modoEdicion = true;

  // DNI y número de afiliado como input normal
  reemplazarPorInput("dni", afiliado.dni);
  reemplazarPorInput("numeroAfiliado", afiliado.numero_afiliado);

  // Fecha de nacimiento como input date
  reemplazarPorInput("fechaNacimiento", afiliado.fecha_nacimiento, "date");

  // Teléfono como input
  reemplazarPorInput("telefono", afiliado.telefono);

  // Relación como select
  convertirRelacionASelect();

  // Escucha cambios en fecha de nacimiento
  const fechaInput = document.getElementById("fechaNacimiento");
  fechaInput.addEventListener("input", actualizarEdadYEstudios);

  // Escucha cambios en relación para actualizar estudios
  const relacionSelect = document.getElementById("relacion");
  relacionSelect.addEventListener("change", actualizarEdadYEstudios);

  // Inicializa edad y estudios
  actualizarEdadYEstudios();

  toggleBotones(true);
}

function actualizarEdadYEstudios() {
  if (!modoEdicion) return;

  const fechaInput = document.getElementById("fechaNacimiento");
  const relacionInput = document.getElementById("relacion");
  const edadSpan = document.getElementById("edad");
  const estudiosField = document.getElementById("estudiosField");

  if (!fechaInput.value) return;

  const edad = calcularEdad(fechaInput.value);
  edadSpan.textContent = edad !== null ? `${edad} años` : "-";

  // Mostrar selector de estudios solo si Hijo/a y edad entre 18-25
  if (relacionInput.value === "Hijo/a" && edad >= 18 && edad <= 25) {
    estudiosField.style.display = "block";
    convertirEstudiosASelect();
  } else {
    estudiosField.style.display = "none";
  }
}

function convertirEstudiosASelect() {
  const actual = document.getElementById("estudios");
  if (actual.tagName === "SELECT") return;

  const select = document.createElement("select");
  select.id = "estudios";

  ["Primario", "Secundario", "Terciario", "Universitario"].forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (op === afiliado.estudios) o.selected = true;
    select.appendChild(o);
  });

  actual.replaceWith(select);
}

function convertirRelacionASelect() {
  const actual = document.getElementById("relacion");
  if (actual.tagName === "SELECT") return;

  const select = document.createElement("select");
  select.id = "relacion";

  ["Titular", "Hijo/a", "Cónyuge", "Otro"].forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (op === afiliado.relacion) o.selected = true;
    select.appendChild(o);
  });

  actual.replaceWith(select);
}

function reemplazarPorInput(id, valor, tipo = "text") {
  const span = document.getElementById(id);
  if (!span) return;

  const input = document.createElement("input");
  input.type = tipo;
  input.id = id;
  if (tipo === "date" && valor) {
    // formatear YYYY-MM-DD
    input.value = valor.split("T")[0]; 
  } else {
    input.value = valor || "";
  }
  span.replaceWith(input);
}

function toggleBotones(editando) {
  document.getElementById("btnEditar").style.display = editando ? "none" : "inline-block";
  document.getElementById("btnGuardar").style.display = editando ? "inline-block" : "none";
  document.getElementById("btnCancelar").style.display = editando ? "inline-block" : "none";
}

/* =====================
   GUARDAR
==================== */

async function guardarCambios() {
  const payload = {
    telefono: document.getElementById("telefono").value || null,
    fecha_nacimiento: document.getElementById("fechaNacimiento").value || null,
    numero_afiliado: document.getElementById("numeroAfiliado").value,
    dni: document.getElementById("dni").value,
    relacion: document.getElementById("relacion").value,
  };

  const estudiosEl = document.getElementById("estudios");
  if (estudiosEl && estudiosEl.tagName === "SELECT") {
    payload.estudios = estudiosEl.value;
  }

  if (payload.numero_afiliado !== afiliado.numero_afiliado) {
    payload.grupo_familiar_codigo = payload.numero_afiliado;
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
   BAJA / REACTIVAR / ELIMINAR
==================== */

async function darDeBaja() {
  const res = await Swal.fire({
    title: "¿Dar de baja afiliado?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Dar de baja"
  });

  if (!res.isConfirmed) return;

  await supabase
    .from("afiliados")
    .update({ activo: false })
    .eq("id", afiliado.id);

  cargarAfiliado();
}

async function reactivar() {
  const res = await Swal.fire({
    title: "¿Reactivar afiliado?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Reactivar"
  });

  if (!res.isConfirmed) return;

  await supabase
    .from("afiliados")
    .update({ activo: true })
    .eq("id", afiliado.id);

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

  window.location.href = "/pages/padron.html";
}

/* =====================
   GRUPO FAMILIAR
==================== */

async function cargarGrupoFamiliar() {
  if (!afiliado.grupo_familiar_codigo) return;

  const { data } = await supabase
    .from("afiliados")
    .select("id, nombre, apellido, dni, numero_afiliado, relacion, activo")
    .eq("grupo_familiar_codigo", afiliado.grupo_familiar_codigo)
    .order("relacion");

  const tbody = document.querySelector("#tablaGrupoFamiliar tbody");
  tbody.innerHTML = "";

  data.forEach(a => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    if (a.id === afiliado.id) {
      tr.style.background = "#e0f2fe";
      tr.style.fontWeight = "600";
    }

    tr.innerHTML = `
      <td>${a.nombre} ${a.apellido}</td>
      <td>${a.dni}</td>
      <td>${a.numero_afiliado}</td>
      <td>${a.relacion}</td>
      <td>${a.activo ? "Activo" : "Dado de baja"}</td>
    `;

    tr.onclick = () => {
      window.location.href = `/pages/afiliado.html?id=${a.id}`;
    };

    tbody.appendChild(tr);
  });
}

/* =====================
   EVENTOS
==================== */

document.getElementById("btnEditar").onclick = entrarModoEdicion;
document.getElementById("btnGuardar").onclick = guardarCambios;
document.getElementById("btnCancelar").onclick = cargarAfiliado;
document.getElementById("btnBaja").onclick = darDeBaja;
document.getElementById("btnEliminar").onclick = eliminarDefinitivo;
document.getElementById("btnReactivar").onclick = reactivar;

/* =====================
   INIT
==================== */

cargarAfiliado();
