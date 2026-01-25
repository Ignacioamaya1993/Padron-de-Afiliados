import { supabase } from "./supabase.js";
import { authObserver, logout } from "./auth.js"; // Para mostrar email en header

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
   AUTH HEADER
===================== */
authObserver(user => {
  if (!user) {
    window.location.href = "/pages/login.html";
    return;
  }
  document.getElementById("userEmail").textContent = user.email;
  document.getElementById("bienvenido").style.display = "inline-block";
});

document.getElementById("logoutBtn")?.addEventListener("click", logout);

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
  const estadoEl = document.getElementById("estadoAfiliado");
  if (activo) {
    estadoEl.textContent = "Activo";
    estadoEl.style.color = "";
    estadoEl.style.fontWeight = "normal";
  } else {
    estadoEl.textContent = "Dado de baja";
    estadoEl.style.color = "#dc2626";
    estadoEl.style.fontWeight = "700";
  }
}

function calcularGrupoFamiliar(numeroAfiliado) {
  const match = numeroAfiliado.match(/^\d+-(.+)$/);
  if (!match) return numeroAfiliado;
  return match[1].replace(/^0+/, ""); // elimino ceros iniciales
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
  modoEdicion = false;

  document.getElementById("nombreCompleto").textContent =
    `${afiliado.nombre} ${afiliado.apellido}`;

  document.getElementById("dni").textContent = afiliado.dni;
  document.getElementById("fechaNacimiento").textContent =
    afiliado.fecha_nacimiento || "-";

  const edad = calcularEdad(afiliado.fecha_nacimiento);
  document.getElementById("edad").textContent =
    edad !== null ? `${edad} años` : "-";

  document.getElementById("telefono").textContent = afiliado.telefono || "-";
  document.getElementById("numeroAfiliado").textContent = afiliado.numero_afiliado;
  document.getElementById("grupoFamiliar").textContent =
    calcularGrupoFamiliar(afiliado.numero_afiliado);
  
  // Relación
  const relacionEl = document.getElementById("relacion");
  relacionEl.textContent = afiliado.relacion;

  mostrarEstado(afiliado.activo);

  // Estudios
  const estudiosField = document.getElementById("estudiosField");
  if (afiliado.relacion === "Hijo/a" && edad >= 18 && edad <= 25) {
    estudiosField.style.display = "block";
    document.getElementById("estudios").textContent = afiliado.estudios || "-";
  } else {
    estudiosField.style.display = "none";
  }

  toggleBotones(false);

  document.getElementById("btnEditar").style.display =
    afiliado.activo ? "inline-block" : "none";
  document.getElementById("btnBaja").style.display =
    afiliado.activo ? "inline-block" : "none";
  document.getElementById("btnReactivar").style.display =
    afiliado.activo ? "none" : "inline-block";
}

/* =====================
   MODO EDICIÓN
===================== */
function entrarModoEdicion() {
  if (!afiliado.activo) return;

  modoEdicion = true;

  reemplazarPorInput("dni", afiliado.dni);
  reemplazarPorInput("telefono", afiliado.telefono);
  reemplazarPorInput("fechaNacimiento", afiliado.fecha_nacimiento, "date");
  reemplazarPorInput("numeroAfiliado", afiliado.numero_afiliado);

  convertirRelacionASelect();
  actualizarEstudiosEnEdicion();

  // Recalcular edad y mostrar/ocultar estudios al cambiar fecha
  const fechaInput = document.getElementById("fechaNacimiento");
  fechaInput.addEventListener("input", () => {
    const edad = calcularEdad(fechaInput.value);
    document.getElementById("edad").textContent =
      edad !== null ? `${edad} años` : "-";
    actualizarEstudiosEnEdicion();
  });

  toggleBotones(true);
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

function convertirRelacionASelect() {
  const span = document.getElementById("relacion");
  const select = document.createElement("select");
  select.id = "relacion";

  ["Titular", "Cónyuge", "Hijo/a", "Otro"].forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (op === afiliado.relacion) o.selected = true;
    select.appendChild(o);
  });

  span.replaceWith(select);
}

function actualizarEstudiosEnEdicion() {
  if (!modoEdicion) return;
  const rel = document.getElementById("relacion").value;
  if (rel !== "Hijo/a") {
    document.getElementById("estudiosField").style.display = "none";
    return;
  }

  const fecha = document.getElementById("fechaNacimiento").value;
  if (!fecha) return;

  const edad = calcularEdad(fecha);
  const field = document.getElementById("estudiosField");
  if (edad >= 18 && edad <= 25) {
    field.style.display = "block";
    convertirEstudiosASelect();
  } else {
    field.style.display = "none";
  }
}

function convertirEstudiosASelect() {
  const span = document.getElementById("estudios");
  if (span.tagName === "SELECT") return;

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

function toggleBotones(editando) {
  document.getElementById("btnEditar").style.display = editando ? "none" : "inline-block";
  document.getElementById("btnGuardar").style.display = editando ? "inline-block" : "none";
  document.getElementById("btnCancelar").style.display = editando ? "inline-block" : "none";
}

/* =====================
   GUARDAR
===================== */
async function guardarCambios() {
  const payload = {
    dni: document.getElementById("dni").value,
    telefono: document.getElementById("telefono").value || null,
    fecha_nacimiento: document.getElementById("fechaNacimiento").value || null,
    numero_afiliado: document.getElementById("numeroAfiliado").value,
    relacion: document.getElementById("relacion").value
  };

  const estudiosEl = document.getElementById("estudios");
  if (estudiosEl && estudiosEl.tagName === "SELECT") {
    payload.estudios = estudiosEl.value;
  }

  // Calcular grupo familiar correctamente
  payload.grupo_familiar_codigo = calcularGrupoFamiliar(payload.numero_afiliado);

  const { error } = await supabase.from("afiliados").update(payload).eq("id", afiliado.id);

  if (error) {
    Swal.fire("Error", error.message, "error");
    return;
  }

  Swal.fire("Guardado", "Cambios guardados", "success");
  cargarAfiliado();
}

/* =====================
   BAJA / REACTIVAR / ELIMINAR
===================== */
async function darDeBaja() {
  const res = await Swal.fire({title:"¿Dar de baja afiliado?", icon:"warning", showCancelButton:true, confirmButtonText:"Dar de baja"});
  if (!res.isConfirmed) return;
  await supabase.from("afiliados").update({activo:false}).eq("id",afiliado.id);
  cargarAfiliado();
}

async function reactivar() {
  const res = await Swal.fire({title:"¿Reactivar afiliado?", icon:"question", showCancelButton:true, confirmButtonText:"Reactivar"});
  if (!res.isConfirmed) return;
  await supabase.from("afiliados").update({activo:true}).eq("id",afiliado.id);
  cargarAfiliado();
}

async function eliminarDefinitivo() {
  const res = await Swal.fire({title:"ELIMINAR DEFINITIVAMENTE", text:"Esta acción no se puede deshacer", icon:"error", showCancelButton:true, confirmButtonText:"Eliminar"});
  if (!res.isConfirmed) return;
  await supabase.from("afiliados").delete().eq("id",afiliado.id);
  window.location.href = "/pages/padron.html";
}

/* =====================
   GRUPO FAMILIAR
===================== */
async function cargarGrupoFamiliar() {
  if (!afiliado.grupo_familiar_codigo) return;

  const { data } = await supabase.from("afiliados").select("id,nombre,apellido,dni,numero_afiliado,relacion,activo")
    .eq("grupo_familiar_codigo",afiliado.grupo_familiar_codigo)
    .order("relacion");

  const tbody = document.querySelector("#tablaGrupoFamiliar tbody");
  tbody.innerHTML = "";

  data.forEach(a => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    if(a.id === afiliado.id){tr.style.background="#e0f2fe";tr.style.fontWeight="600";}
    tr.innerHTML = `<td>${a.nombre} ${a.apellido}</td><td>${a.dni}</td><td>${a.numero_afiliado}</td><td>${a.relacion}</td><td>${a.activo?"Activo":"Dado de baja"}</td>`;
    tr.onclick = () => { window.location.href=`/pages/afiliado.html?id=${a.id}`; };
    tbody.appendChild(tr);
  });
}

/* =====================
   EVENTOS
===================== */
document.getElementById("btnEditar").onclick = entrarModoEdicion;
document.getElementById("btnGuardar").onclick = guardarCambios;
document.getElementById("btnCancelar").onclick = cargarAfiliado;
document.getElementById("btnBaja").onclick = darDeBaja;
document.getElementById("btnEliminar").onclick = eliminarDefinitivo;
document.getElementById("btnReactivar").onclick = reactivar;

/* =====================
   INIT
===================== */
cargarAfiliado();
