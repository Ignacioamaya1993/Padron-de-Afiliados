import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

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

function pasoEdadLimite(fechaNacimiento, edadLimite) {
  if (!fechaNacimiento) return true;
  const fn = new Date(fechaNacimiento);
  const fechaLimite = new Date(fn.getFullYear() + edadLimite, fn.getMonth(), fn.getDate());
  return new Date() >= fechaLimite;
}

function calcularGrupoFamiliar(numeroAfiliado) {
  if (!numeroAfiliado) return "";
  const guionIndex = numeroAfiliado.indexOf("-"); // primer guion
  const slashIndex = numeroAfiliado.indexOf("/"); // la barra
  if (guionIndex === -1 || slashIndex === -1) return numeroAfiliado;
  return numeroAfiliado.substring(guionIndex + 1, slashIndex); // toma todo lo que está entre guion y barra
}

function mesesParaCumplirEdad(fechaNacimiento, edadObjetivo) {
  if (!fechaNacimiento) return null;
  const hoy = new Date();
  const fn = new Date(fechaNacimiento);
  const fechaLimite = new Date(fn.getFullYear() + edadObjetivo, fn.getMonth(), fn.getDate());
  const diffMeses = (fechaLimite.getFullYear() - hoy.getFullYear()) * 12 + (fechaLimite.getMonth() - hoy.getMonth());
  return diffMeses;
}

function mostrarEstado(activo) {
  const estadoSpan = document.getElementById("estadoAfiliado");
  if (!estadoSpan) return;
  if (activo) {
    estadoSpan.textContent = "Activo";
    estadoSpan.style.color = "";
    estadoSpan.style.fontWeight = "normal";
  } else {
    estadoSpan.textContent = "Dado de baja";
    estadoSpan.style.color = "#dc2626";
    estadoSpan.style.fontWeight = "700";
  }
}

function diasDesde(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  const f = new Date(fecha);
  const diff = hoy - f;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function esCategoriaJubilado(nombre) {
  return nombre === "Jubilado ANSES" || nombre === "Jubilado tramite";
}

function tieneMenosDe80(fechaNacimiento) {
  if (!fechaNacimiento) return false;
  return calcularEdad(fechaNacimiento) < 80;
}

/* =====================
   CARGAR AFILIADO
===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase
    .from("afiliados")
    .select(`
      *,
      parentesco_id (nombre),
      plan_id (nombre),
      categoria_id (nombre),
      localidad_id (nombre),
      grupo_sanguineo_id (nombre)
    `)
    .eq("id", afiliadoId)
    .single();


  if (error || !data) {
    Swal.fire("Error", "No se pudo cargar el afiliado", "error");
    return;
  }

  afiliado = data;
  afiliado.grupo_familiar_codigo = calcularGrupoFamiliar(afiliado.numero_afiliado);

  renderFicha();
  cargarGrupoFamiliar();
}

/* =====================
   RENDER FICHA
===================== */
function renderFicha() {
  // Desactivar modo edición
  modoEdicion = false;

  // Restaurar todos los campos a spans
  restaurarCampos();

  // Nombre completo
  document.getElementById("nombreCompleto").textContent = `${afiliado.nombre} ${afiliado.apellido}`;

  document.getElementById("grupoFamiliarReal").textContent = afiliado.grupo_familiar_real || "-";

  // Fecha y edad
  const fechaText = afiliado.fechaNacimiento
    ? `${afiliado.fechaNacimiento.split("-")[2]}/${afiliado.fechaNacimiento.split("-")[1]}/${afiliado.fechaNacimiento.split("-")[0]}`
    : "-";
  document.getElementById("fechaNacimiento").textContent = fechaText;
  document.getElementById("edad").textContent = calcularEdad(afiliado.fechaNacimiento) + " años";

// Campos básicos con mapping entre span ID y columna real
const campos = {
  telefono: "telefono",
  numeroAfiliado: "numero_afiliado",
  grupoFamiliar: "grupo_familiar_codigo",
  dni: "dni",
  sexo: "sexo",
  parentesco: "parentesco_id",
  plan: "plan_id",
  categoria: "categoria_id",
  localidad: "localidad_id"
};

for (const [idSpan, columna] of Object.entries(campos)) {
  const span = document.getElementById(idSpan);
  if (!span) continue;

  if (columna.endsWith("_id")) {
    // Relaciones: mostrar el nombre
    span.textContent = afiliado[columna]?.nombre || "-";
  } else {
    // Campos directos
    span.textContent = afiliado[columna] || "-";
  }
}

const pagoInput = document.getElementById("fechaUltimoPago");
if (pagoInput && pagoInput.tagName === "INPUT") {
  const span = document.createElement("span");
  span.id = "fechaUltimoPago";
  span.textContent = afiliado.fecha_ultimo_pago_cuota
    ? afiliado.fecha_ultimo_pago_cuota.split("-").reverse().join("/")
    : "-";
  pagoInput.replaceWith(span);
}

// Mostrar grupo sanguíneo
const grupoSanguineoSpan = document.getElementById("grupoSanguineo");
grupoSanguineoSpan.textContent = afiliado.grupo_sanguineo_id?.nombre || "-";

// Mostrar grupo familiar real
const grupoRealSpan = document.getElementById("grupoFamiliarReal");
if (grupoRealSpan) {
  grupoRealSpan.textContent = afiliado.grupo_familiar_real || "-";
}

for (const [spanId, col] of Object.entries(campos)) {
  const span = document.getElementById(spanId);
  if (!span) continue;

  if (col.endsWith("_id")) {
    span.textContent = afiliado[col]?.nombre || "-";
  } else {
    span.textContent = afiliado[col] || "-";
  }
}

  // Discapacidad
  document.getElementById("discapacidad").textContent = afiliado.discapacidad ? "Sí" : "No";
  const nivelField = document.getElementById("nivelDiscapacidadField");
  if(afiliado.discapacidad) {
    nivelField.style.display = "block";
    document.getElementById("nivelDiscapacidad").textContent = afiliado.nivel_discapacidad || "-";
  } else {
    nivelField.style.display = "none";
  }

  // Estudios
  const estudiosField = document.getElementById("estudiosField");
  const estudiosSpan = document.getElementById("estudios");
  const parentescoNombre = afiliado.parentesco_id?.nombre || "";
  const cumplio21 = pasoEdadLimite(afiliado.fechaNacimiento, 21);
  const cumplio26 = pasoEdadLimite(afiliado.fechaNacimiento, 26);
  if(parentescoNombre === "Hijos" && cumplio21 && !cumplio26){
    estudiosField.style.display = "block";
    estudiosSpan.textContent = afiliado.estudios || "No seleccionado";
  } else {
    estudiosField.style.display = "none";
    estudiosSpan.textContent = "-";
  }

  // Adjuntos
  const adjEstudiosField = document.getElementById("adjuntoEstudiosField");
  const adjEstudiosContenido = document.getElementById("adjuntoEstudiosContenido");
  if(parentescoNombre === "Hijos" && cumplio21 && !cumplio26){
    adjEstudiosField.style.display = "block";
    adjEstudiosContenido.innerHTML = afiliado.adjuntoEstudios
      ? `<a href="${afiliado.adjuntoEstudios}" target="_blank">📎 Ver adjunto</a>`
      : "No hay adjunto cargado";
  } else {
    adjEstudiosField.style.display = "none";
    adjEstudiosContenido.innerHTML = "";
  }

  const adjDispField = document.getElementById("adjuntoDiscapacidadField");
  const adjDispContenido = document.getElementById("adjuntoDiscapacidadContenido");
  if(afiliado.discapacidad){
    adjDispField.style.display = "block";
    adjDispContenido.innerHTML = afiliado.adjuntoDiscapacidad
      ? `<a href="${afiliado.adjuntoDiscapacidad}" target="_blank">📎 Ver adjunto</a>`
      : "No hay adjunto cargado";
  } else {
    adjDispField.style.display = "none";
    adjDispContenido.innerHTML = "";
  }

  // Estado
  mostrarEstado(afiliado.activo);

  const categoriaNombre = afiliado.categoria_id?.nombre || "";
const pagoField = document.getElementById("fechaUltimoPagoField");
const pagoSpan = document.getElementById("fechaUltimoPago");
const alerta = document.getElementById("alertaDeudor");

const esJubilado = esCategoriaJubilado(categoriaNombre);
const pagaCuota = esJubilado && tieneMenosDe80(afiliado.fechaNacimiento);

if (pagaCuota) {
  pagoField.style.display = "block";

  if (afiliado.fecha_ultimo_pago_cuota) {
    pagoSpan.textContent = afiliado.fecha_ultimo_pago_cuota
      .split("-")
      .reverse()
      .join("/");

    const dias = diasDesde(afiliado.fecha_ultimo_pago_cuota);
    alerta.style.display = dias > 40 ? "block" : "none";
  } else {
    pagoSpan.textContent = "-";
    alerta.style.display = "none";
  }
} else {
  pagoField.style.display = "none";
  alerta.style.display = "none";
}

  // Botones
  toggleBotones(false);
  document.getElementById("btnEditar").style.display = afiliado.activo ? "inline-block" : "none";
  document.getElementById("btnBaja").style.display = afiliado.activo ? "inline-block" : "none";
  document.getElementById("btnReactivar").style.display = afiliado.activo ? "none" : "inline-block";
}

/* =====================
   ACTUALIZAR EDAD / ESTUDIOS
===================== */
function actualizarEdadYEstudios() {
  if (!modoEdicion) return;

  const fechaInput = document.getElementById("fechaNacimiento");
  const parentescoSelect = document.getElementById("parentesco");
  const estudiosField = document.getElementById("estudiosField");

  const edad = fechaInput.value ? calcularEdad(fechaInput.value) : null;
  document.getElementById("edad").textContent = edad !== null ? `${edad} años` : "-";

  const cumplio21 = fechaInput.value ? pasoEdadLimite(fechaInput.value, 21) : false;
  const cumplio26 = fechaInput.value ? pasoEdadLimite(fechaInput.value, 26) : true;

  if (parentescoSelect.value === "Hijos" && cumplio21 && !cumplio26) {
    estudiosField.style.display = "block";
    convertirEstudiosASelect();
  } else {
    estudiosField.style.display = "none";
  }
}

function actualizarAdjuntoEdicion() {
  if (!modoEdicion) return;

  const fechaNac = document.getElementById("fechaNacimiento")?.value;
  const parentesco = document.getElementById("parentesco")?.value;
  const discapacidad = document.getElementById("discapacidad")?.checked;

  // Hijos (21-26)
  const adjEstudiosField = document.getElementById("adjuntoEstudiosField");
  const adjEstudiosContenido = document.getElementById("adjuntoEstudiosContenido");
  if (parentesco === "Hijos" && fechaNac && pasoEdadLimite(fechaNac, 21) && !pasoEdadLimite(fechaNac, 26)) {
    adjEstudiosField.style.display = "block";
    adjEstudiosContenido.innerHTML = afiliado.adjuntoEstudios
      ? `<a href="${afiliado.adjuntoEstudios}" target="_blank">📎 Adjunto actual</a><br>
         <input type="file" id="adjuntoEstudiosInput" accept=".pdf,.jpg,.png" />`
      : `<input type="file" id="adjuntoEstudiosInput" accept=".pdf,.jpg,.png" />`;
  } else {
    adjEstudiosField.style.display = "none";
    adjEstudiosContenido.innerHTML = "";
  }

  // Discapacidad
  const adjDispField = document.getElementById("adjuntoDiscapacidadField");
  const adjDispContenido = document.getElementById("adjuntoDiscapacidadContenido");
  if (discapacidad) {
    adjDispField.style.display = "block";
    adjDispContenido.innerHTML = afiliado.adjuntoDiscapacidad
      ? `<a href="${afiliado.adjuntoDiscapacidad}" target="_blank">📎 Adjunto actual</a><br>
         <input type="file" id="adjuntoDiscapacidadInput" accept=".pdf,.jpg,.png" />`
      : `<input type="file" id="adjuntoDiscapacidadInput" accept=".pdf,.jpg,.png" />`;
  } else {
    adjDispField.style.display = "none";
    adjDispContenido.innerHTML = "";
  }
}

/* =====================
   MODO EDICIÓN
===================== */
async function obtenerOpciones() {
  // Obtener todas las opciones de la DB
  const { data: planes } = await supabase.from("planes").select("nombre");
  const { data: categorias } = await supabase.from("categorias").select("nombre");
  const { data: parentescos } = await supabase.from("parentescos").select("nombre");
  const { data: localidades } = await supabase.from("localidades").select("nombre");

  return {
    planes: planes?.map(p => p.nombre) || [],
    categorias: categorias?.map(c => c.nombre) || [],
    parentescos: parentescos?.map(p => p.nombre) || [],
    localidades: localidades?.map(l => l.nombre) || []
  };
}

/* Formato YYYY-MM-DD para inputs de tipo date */
function formatoInputDate(fecha) {
  if (!fecha) return "";
  const d = new Date(fecha);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function entrarModoEdicion() {
  if (!afiliado.activo) return;
  modoEdicion = true;

  const opciones = await obtenerOpciones();

  // Valores actuales de afiliado como strings
  const parentescoNombre = afiliado.parentesco_id?.nombre || "";
  const planNombre = afiliado.plan_id?.nombre || "";
  const categoriaNombre = afiliado.categoria_id?.nombre || "";
  const localidadNombre = afiliado.localidad_id?.nombre || "";
  const { data: gruposSanguineos } = await supabase.from("grupo_sanguineo").select("nombre");
  const opcionesGrupoSanguineo = gruposSanguineos?.map(g => g.nombre) || [];  

  reemplazarPorInput("telefono", afiliado.telefono);
  reemplazarPorInput("fechaNacimiento", formatoInputDate(afiliado.fechaNacimiento), "date");
  reemplazarPorInput("numeroAfiliado", afiliado.numero_afiliado);
  reemplazarPorInput("dni", afiliado.dni);
  reemplazarPorInput("grupoFamiliarReal", afiliado.grupo_familiar_real);
  reemplazarPorSelect("parentesco", opciones.parentescos, parentescoNombre);
  reemplazarPorSelect("sexo", ["F","M"], afiliado.sexo);
  reemplazarPorSelect("plan", opciones.planes, planNombre);
  reemplazarPorSelect("categoria", opciones.categorias, categoriaNombre);
  reemplazarPorSelect("localidad", opciones.localidades, localidadNombre);
  reemplazarPorSelect("grupoSanguineo", opcionesGrupoSanguineo, afiliado.grupo_sanguineo_id?.nombre);
  reemplazarPorCheckbox("discapacidad", afiliado.discapacidad);

  const categoriaSelect = document.getElementById("categoria");
  categoriaSelect.addEventListener("change", actualizarCampoPago);
  

  actualizarCampoPago();

  const nivelField = document.getElementById("nivelDiscapacidadField");
  const dispCheckbox = document.getElementById("discapacidad");
  if (afiliado.discapacidad) {
    nivelField.style.display = "block";
    reemplazarPorSelect("nivelDiscapacidad", ["Permanente","Temporal"], afiliado.nivel_discapacidad);
  } else {
    nivelField.style.display = "none";
  }

  dispCheckbox.addEventListener("change", () => {
  const nivelField = document.getElementById("nivelDiscapacidadField");
  if (dispCheckbox.checked) {
    nivelField.style.display = "block";
    convertirNivelDiscapacidadASelect();
  } else {
    nivelField.style.display = "none";
  }

  actualizarAdjuntoEdicion();
  actualizarCampoPago();
});

  const fechaInput = document.getElementById("fechaNacimiento");
  const parentescoSelect = document.getElementById("parentesco");
  

  fechaInput.addEventListener("input", actualizarCampoPago);
  fechaInput.addEventListener("input", actualizarEdadYEstudios);
  parentescoSelect.addEventListener("change", actualizarEdadYEstudios);
  fechaInput.addEventListener("input", actualizarAdjuntoEdicion);
  parentescoSelect.addEventListener("change", actualizarAdjuntoEdicion);

  actualizarEdadYEstudios();
  toggleBotones(true);
  actualizarAdjuntoEdicion();
}

/* =====================
   FUNCIONES COMUNES EDICIÓN
===================== */
function reemplazarPorInput(id, valor, tipo = "text") {
  const span = document.getElementById(id);
  if (!span) return;
  const input = document.createElement("input");
  input.type = tipo;
  input.id = id;
  input.value = valor || "";
  span.replaceWith(input);
}

function actualizarCampoPago() {
  const categoria = document.getElementById("categoria")?.value;
  const field = document.getElementById("fechaUltimoPagoField");
  const span = document.getElementById("fechaUltimoPago");

  const fechaNac = document.getElementById("fechaNacimiento")?.value;
  const pagaCuota =
    esCategoriaJubilado(categoria) &&
    fechaNac &&
    calcularEdad(fechaNac) < 80;

  if (!pagaCuota) {
    field.style.display = "none";
    const input = document.getElementById("fechaUltimoPago");
    if (input) input.value = "";
    return;
  }

  field.style.display = "block";

  if (span && span.tagName === "SPAN") {
    const input = document.createElement("input");
    input.type = "date";
    input.id = "fechaUltimoPago";
    input.value = formatoInputDate(afiliado.fecha_ultimo_pago_cuota);
    span.replaceWith(input);
  }
}

function reemplazarPorSelect(id, opciones, valorActual) {
  const span = document.getElementById(id);
  if (!span) return;
  const select = document.createElement("select");
  select.id = id;
  opciones.forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (valorActual === op) o.selected = true;
    select.appendChild(o);
  });
  span.replaceWith(select);
}

function reemplazarPorCheckbox(id, valorActual) {
  const span = document.getElementById(id);
  if (!span) return;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = !!valorActual;
  span.replaceWith(input);
}

function convertirNivelDiscapacidadASelect() {
  const span = document.getElementById("nivelDiscapacidad");
  if (!span || span.tagName === "SELECT") return;
  const select = document.createElement("select");
  select.id = "nivelDiscapacidad";
  ["Permanente","Temporal"].forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (afiliado.nivel_discapacidad === op) o.selected = true;
    select.appendChild(o);
  });
  span.replaceWith(select);
}

function convertirEstudiosASelect() {
  const actual = document.getElementById("estudios");
  if (!actual || actual.tagName === "SELECT") return;
  const select = document.createElement("select");
  select.id = "estudios";
  ["Posgrado","Terciario","Universitario"].forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (afiliado.estudios === op) o.selected = true;
    select.appendChild(o);
  });
  actual.replaceWith(select);
}

function restaurarCampos() {
  ["telefono","fechaNacimiento","numeroAfiliado","dni"].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === "INPUT") {
      const span = document.createElement("span");
      span.id = id;
      span.textContent = afiliado[id] || "-";
      el.replaceWith(span);
    }
  });

const elGrupoReal = document.getElementById("grupoFamiliarReal");
if (elGrupoReal && (elGrupoReal.tagName === "INPUT" || elGrupoReal.tagName === "SELECT")) {
  const span = document.createElement("span");
  span.id = "grupoFamiliarReal";
  span.textContent = afiliado.grupo_familiar_real || "-";
  elGrupoReal.replaceWith(span);
}

["parentesco","sexo","plan","categoria","localidad","discapacidad","nivelDiscapacidad","grupoSanguineo"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === "SELECT" || el.tagName === "INPUT") {
    const span = document.createElement("span");
    span.id = id;
    if(id==="discapacidad") span.textContent = afiliado.discapacidad ? "Sí" : "No";
    else if(id==="nivelDiscapacidad") span.textContent = afiliado.nivel_discapacidad || "-";
    else if(id==="grupoSanguineo") span.textContent = afiliado.grupo_sanguineo_id?.nombre || "-";
    else span.textContent = afiliado[id] || "-";
    el.replaceWith(span);
  }
});

  const est = document.getElementById("estudios");
  if (est && est.tagName === "SELECT") {
    const span = document.createElement("span");
    span.id = "estudios";
    span.textContent = afiliado.estudios || "-";
    est.replaceWith(span);
  }
}

function toggleBotones(editando) {
  document.getElementById("btnEditar").style.display = editando ? "none" : "inline-block";
  document.getElementById("btnGuardar").style.display = editando ? "inline-block" : "none";
  document.getElementById("btnCancelar").style.display = editando ? "inline-block" : "none";
}

/* =====================
   GUARDAR CAMBIOS
===================== */
async function guardarCambios() {
  const telefono = document.getElementById("telefono").value || null;
  const fecha_nacimiento = document.getElementById("fechaNacimiento").value || null;
  const numero_afiliado = document.getElementById("numeroAfiliado").value;
  const dni = document.getElementById("dni").value;
  const sexo = document.getElementById("sexo")?.value || null;
  const planNombre = document.getElementById("plan")?.value || null;
  const categoriaNombre = document.getElementById("categoria")?.value || null;
  const localidadNombre = document.getElementById("localidad")?.value || null;
  const discapacidad = document.getElementById("discapacidad")?.checked || false;
  const nivel_discapacidad = (discapacidad && document.getElementById("nivelDiscapacidad")?.value) || null;
  const parentescoNombre = document.getElementById("parentesco")?.value || null;
  const grupo_familiar_real = document.getElementById("grupoFamiliarReal")?.value || null;
  const grupoSanguineoNombre = document.getElementById("grupoSanguineo")?.value || null;
  const fecha_ultimo_pago_cuota = document.getElementById("fechaUltimoPago")?.value || null;

  // IDs reales de relaciones
  const { data: parent } = await supabase.from("parentescos").select("id").eq("nombre", parentescoNombre).single();
  const { data: planData } = await supabase.from("planes").select("id").eq("nombre", planNombre).single();
  const { data: categoriaData } = await supabase.from("categorias").select("id").eq("nombre", categoriaNombre).single();
  const { data: localidadData } = await supabase.from("localidades").select("id").eq("nombre", localidadNombre).single();
  const { data: gsData } = await supabase.from("grupo_sanguineo").select("id").eq("nombre", grupoSanguineoNombre).single();

  // =========================
  // Validaciones de edad y adjuntos
  // =========================
  const adjEstudiosInput = document.getElementById("adjuntoEstudiosInput");
  const adjDispInput = document.getElementById("adjuntoDiscapacidadInput");

  // Hijos 21-26
  const esHijo21a26 = parentescoNombre === "Hijos" && fecha_nacimiento && pasoEdadLimite(fecha_nacimiento, 21) && !pasoEdadLimite(fecha_nacimiento, 26);

  // Capturar el valor de estudios si corresponde
  let estudios = null;
  if (esHijo21a26) {
    const estudiosSelect = document.getElementById("estudios");
    if (estudiosSelect) estudios = estudiosSelect.value || null;
  }

  // Validación y subida de adjunto estudios
  let adjuntoEstudiosUrl = afiliado.adjuntoEstudios;
  if (esHijo21a26) {
    if (!adjuntoEstudiosUrl && (!adjEstudiosInput || adjEstudiosInput.files.length === 0)) {
      Swal.fire("Adjunto requerido", "Debes cargar el certificado de alumno regular para hijos entre 21 y 26 años.", "error");
      return;
    }
    if (adjEstudiosInput && adjEstudiosInput.files.length > 0) {
      const file = adjEstudiosInput.files[0];
      adjuntoEstudiosUrl = await subirArchivoCloudinary(file);
    }
  } else {
    adjuntoEstudiosUrl = null;
  }

  // Validación y subida de adjunto discapacidad
  let adjuntoDiscapacidadUrl = afiliado.adjuntoDiscapacidad;
  if (discapacidad) {
    if (!adjuntoDiscapacidadUrl && (!adjDispInput || adjDispInput.files.length === 0)) {
      Swal.fire("Adjunto requerido", "Debes cargar el comprobante de discapacidad.", "error");
      return;
    }
    if (adjDispInput && adjDispInput.files.length > 0) {
      const file = adjDispInput.files[0];
      adjuntoDiscapacidadUrl = await subirArchivoCloudinary(file);
    }
  } else {
    adjuntoDiscapacidadUrl = null;
  }

  // =========================
// Validación Menor B/ guarda (edición)
// =========================
if (
  parentescoNombre === "Menor B/ guarda" &&
  fecha_nacimiento &&
  pasoEdadLimite(fecha_nacimiento, 18)
) {
  Swal.fire(
    "Edad inválida",
    "Un menor bajo guarda solo puede afiliarse hasta el día exacto en que cumple 18 años.",
    "error"
  );
  return;
}

  // =========================
  // Payload con IDs y campos
  // =========================
  const payload = {
    telefono,
    fechaNacimiento: fecha_nacimiento,
    dni,
    numero_afiliado,
    parentesco_id: parent?.id || null,
    plan_id: planData?.id || null,
    categoria_id: categoriaData?.id || null,
    localidad_id: localidadData?.id || null,
    sexo,
    grupo_familiar_real,
    discapacidad,
    nivel_discapacidad,
    grupo_familiar_codigo: calcularGrupoFamiliar(numero_afiliado),
    estudios,
    adjuntoEstudios: adjuntoEstudiosUrl,
    adjuntoDiscapacidad: adjuntoDiscapacidadUrl,
    grupo_sanguineo_id: gsData?.id || null,
    fecha_ultimo_pago_cuota
  };

  const { error } = await supabase.from("afiliados").update(payload).eq("id", afiliadoId);

  if (error) {
    Swal.fire("Error", "No se pudo guardar los cambios", "error");
    console.error(error);
    return;
  }

  // =========================
  // Actualizar la variable local y renderizar
  // =========================
afiliado = {
  ...afiliado,
  ...payload,
  parentesco_id: parent?.id ? { id: parent.id, nombre: parentescoNombre } : null,
  plan_id: planData?.id ? { id: planData.id, nombre: planNombre } : null,
  categoria_id: categoriaData?.id ? { id: categoriaData.id, nombre: categoriaNombre } : null,
  localidad_id: localidadData?.id ? { id: localidadData.id, nombre: localidadNombre } : null,
  grupo_sanguineo_id: gsData?.id ? { id: gsData.id, nombre: grupoSanguineoNombre } : null
};

  Swal.fire("Guardado", "Cambios guardados correctamente", "success");
  renderFicha(); // Refresca la ficha con los datos actualizados
  cargarGrupoFamiliar();
}

/* =====================
   DAR DE BAJA / REACTIVAR
===================== */
async function darDeBaja() {
  const res = await Swal.fire({
    title: "¿Dar de baja afiliado?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Dar de baja",
    cancelButtonText: "Cancelar"
  });
  if (!res.isConfirmed) return;

  await supabase.from("afiliados").update({ activo: false }).eq("id", afiliadoId);
  cargarAfiliado();
}

async function reactivarAfiliado() {
  await supabase.from("afiliados").update({ activo: true }).eq("id", afiliadoId);
  cargarAfiliado();
}

/* =====================
   CARGAR GRUPO FAMILIAR
===================== */
async function cargarGrupoFamiliar() {
  if (!afiliado.grupo_familiar_codigo && !afiliado.grupo_familiar_real) return;

  // ======== CONSULTA ========
 let query = supabase
  .from("afiliados")
  .select(`
    id, nombre, apellido, dni, numero_afiliado, activo,
    parentesco_id (nombre),
    grupo_familiar_real,
    grupo_familiar_codigo
  `)
  .order("parentesco_id", { ascending: true });

if (afiliado.grupo_familiar_real) {
  // Traer todos los que tienen su grupo_real o su grupo_codigo
  query = query.or(
    `grupo_familiar_real.eq.${afiliado.grupo_familiar_real},grupo_familiar_codigo.eq.${afiliado.grupo_familiar_codigo}`
  );
} else {
  // Solo tiene grupo_familiar_codigo
  query = query.eq("grupo_familiar_codigo", afiliado.grupo_familiar_codigo);
}

const { data: familiares, error } = await query;

  if (error) {
    console.error("Error cargando grupo familiar:", error);
    return;
  }

  const tbody = document.querySelector("#tablaGrupoFamiliar tbody");
  tbody.innerHTML = "";

  if (!familiares || familiares.length === 0) return;

  familiares.forEach(f => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    if (f.id === afiliado.id) {
      tr.style.background = "#e0f2fe";
      tr.style.fontWeight = "600";
    }

    tr.innerHTML = `
      <td>${f.nombre} ${f.apellido}</td>
      <td>${f.dni}</td>
      <td>${f.numero_afiliado}</td>
      <td>${f.parentesco_id?.nombre || "-"}</td>
      <td>${f.grupo_familiar_codigo || "-"}</td>
      <td>${f.grupo_familiar_real || "-"}</td>
      <td>${f.activo ? "Activo" : "Dado de baja"}</td>
    `;

    tr.onclick = () => {
      window.location.href = `/pages/afiliado.html?id=${f.id}`;
    };

    tbody.appendChild(tr);
  });
}

/* =====================
   EVENTOS
===================== */
document.getElementById("btnEditar").addEventListener("click", entrarModoEdicion);
document.getElementById("btnCancelar").addEventListener("click", renderFicha);
document.getElementById("btnGuardar").addEventListener("click", guardarCambios);
document.getElementById("btnBaja").addEventListener("click", darDeBaja);
document.getElementById("btnReactivar").addEventListener("click", reactivarAfiliado);
document.getElementById("btnVolver").addEventListener("click", () => window.history.back());

document.getElementById("btnFichaMedica")?.addEventListener("click", () => {
  if (!afiliado?.id) return;
  window.location.href = `/pages/fichaMedica.html?id=${afiliado.id}`;
});


/* =====================
   INICIO
===================== */
await cargarHeader();
await cargarAfiliado();
