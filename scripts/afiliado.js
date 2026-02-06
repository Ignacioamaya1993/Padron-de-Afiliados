import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

/* =====================
   AVISO IMPORTANTE SOBRE PLAN MATERNO
=====================

El cambio automático de categoría de "Plan Materno" a "Obligatorios" se realiza
directamente desde Supabase, no desde este javaScript.

- Función SQL que realiza el cambio automático: 
  -> vencer_planes_maternos()
     Esta función revisa las fechas de plan_materno_hasta y actualiza la categoria_id
     cuando el plan materno vence.

- Trigger asociado:
  -> historial_cambios_plan_materno
     Se dispara después de cada update sobre afiliados o afiliado_plan_materno
     y registra en la tabla afiliado_plan_materno_historial todos los cambios
     de fechas y categoría, junto con quién hizo el cambio y cuándo.

- Historial de cambios:
  -> Tabla: afiliado_plan_materno_historial
     Guarda:
       * plan_materno_desde_anterior / plan_materno_desde_nueva
       * plan_materno_hasta_anterior / plan_materno_hasta_nueva
       * categoria_anterior / categoria_nueva
       * motivo del cambio
       * cambiado_por (usuario)
       * cambiado_en (timestamp)

Para consultar manualmente o revisar registros:
1. En Supabase, ir a **SQL Editor**
2. Para ver el historial:
   SELECT * FROM afiliado_plan_materno_historial ORDER BY cambiado_en DESC;
3. Para revisar la función automática:
   DATABASE -> Functions -> vencer_planes_maternos

===================== */

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
let cud_documentos = [];

const desde = document.getElementById("planMaternoDesde");
const hasta = document.getElementById("planMaternoHasta");

if (desde && desde.tagName === "INPUT") desde.disabled = true;
if (hasta && hasta.tagName === "INPUT") hasta.disabled = true;

/* =====================
   HELPERS
===================== */

function esTitular(numeroAfiliado) {
  if (!numeroAfiliado) return false;
  return numeroAfiliado.trim().endsWith("/00");
}

// =====================
// CUD – helpers edición
// =====================

function activarCamposCudEdicion() {
    const emisionField = document.getElementById("cudEmisionField");
    const vencField = document.getElementById("cudVencimientoField");
    const sinVencField = document.getElementById("cudSinVencimientoField");

    emisionField.style.display = "block";
    vencField.style.display = "block";
    sinVencField.style.display = "block"; // <-- siempre visible en edición

    const ultimoCud = cud_documentos.length
      ? cud_documentos[cud_documentos.length - 1]
      : null;

    reemplazarPorInput(
      "cudEmision",
      formatoInputDate(ultimoCud?.fecha_emision),
      "date"
    );

    reemplazarPorInput(
      "cudVencimiento",
      ultimoCud?.sin_vencimiento ? "" : formatoInputDate(ultimoCud?.fecha_vencimiento),
      "date"
    );

    reemplazarPorCheckbox(
      "cudSinVencimiento",
      ultimoCud?.sin_vencimiento
    );

    // Lógica checkbox
    const sinVenc = document.getElementById("cudSinVencimiento");
    const venc = document.getElementById("cudVencimiento");
    venc.disabled = sinVenc.checked;

    sinVenc.addEventListener("change", () => {
        if (sinVenc.checked) {
            venc.value = "";
            venc.disabled = true;
        } else {
            venc.disabled = false;
        }
    });
}

function normalizarTelefonoWA(tel) {
  if (!tel) return null;
  // deja solo números
  const limpio = tel.replace(/\D/g, "");

  // si ya tiene 54, lo dejamos
  if (limpio.startsWith("54")) return limpio;

  // si no, asumimos Argentina
  return "54" + limpio;
}

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
  return nombre === "Jubilado ANSES" || nombre === "Pensionado ANSES reparto";
}

/* =====================
   CARGAR AFILIADO
===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase
    .from("afiliados")
    .select(`*, parentesco_id (nombre), plan_id (nombre), categoria_id (nombre), localidad_id (nombre), grupo_sanguineo_id (nombre)`)
    .eq("id", afiliadoId)
    .single();

  if (error || !data) {
    Swal.fire("Error", "No se pudo cargar el afiliado", "error");
    return;
  }

  afiliado = data;
  afiliado.grupo_familiar_codigo = calcularGrupoFamiliar(afiliado.numero_afiliado);

  // TRAER CUD DOCUMENTOS
  cud_documentos = [];
  if (afiliado.discapacidad) {
    const { data: cudData, error: cudError } = await supabase
      .from("cud_documentos")
      .select("*")
      .eq("afiliado_id", afiliado.id)
      .order("created_at", { ascending: true });

    if (cudError) console.error("Error cargando CUD:", cudError);
    else cud_documentos = cudData;
  }

  renderFicha(cud_documentos); // PASAMOS LA DATA A LA FUNCIÓN
  cargarGrupoFamiliar();
}

/* =====================
   RENDER FICHA
===================== */
async function renderFicha(cud_documentos = []) {
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
  document.getElementById("edadVista").textContent = afiliado.fechaNacimiento? calcularEdad(afiliado.fechaNacimiento) + " años" : "-";

// Campos básicos con mapping entre span ID y columna real
const campos = {
  telefono: "telefono",
  numeroAfiliado: "numero_afiliado",
  grupoFamiliar: "grupo_familiar_codigo",
  dni: "dni",
  cuil: "cuil",
  sexo: "sexo",
  cbuCvu: "cbu_cvu",
  parentesco: "parentesco_id",
  plan: "plan_id",
  categoria: "categoria_id",
  localidad: "localidad_id",
  mail: "mail",
};

for (const [idSpan, columna] of Object.entries(campos)) {
  const span = document.getElementById(idSpan);
  if (!span) continue;

  // TELÉFONO CON LINK A WHATSAPP
  if (idSpan === "telefono" && afiliado.telefono) {
    const telNormalizado = normalizarTelefonoWA(afiliado.telefono);

    span.innerHTML = `
      <a href="https://wa.me/${telNormalizado}" 
         target="_blank"
         style="color:#16a34a; font-weight:600; text-decoration:none">
        📱 ${afiliado.telefono}
      </a>
    `;
    continue;
  }

// MAIL CON LINK MAILTO
if (idSpan === "mail" && afiliado.mail) {
  span.innerHTML = `
    <a href="mailto:${afiliado.mail}"
       style="color:#2563eb; text-decoration:none; font-weight:500">
      ${afiliado.mail}
    </a>
  `;
  continue;
}

  if (columna.endsWith("_id")) {
    span.textContent = afiliado[columna]?.nombre || "-";
  } else {
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

  // Discapacidad
  document.getElementById("discapacidad").textContent = afiliado.discapacidad ? "Sí" : "No";
  const nivelField = document.getElementById("nivelDiscapacidadField");
  if(afiliado.discapacidad) {
    nivelField.style.display = "block";
    document.getElementById("nivelDiscapacidad").textContent = afiliado.nivel_discapacidad || "-";
  } else {
    nivelField.style.display = "none";
  }

// =========================
// CUD Fechas (modo vista)
// =========================
const cudEmisionField = document.getElementById("cudEmisionField");
const cudVencimientoField = document.getElementById("cudVencimientoField");
const cudSinVencField = document.getElementById("cudSinVencimientoField"); // NO se mostrará

const cudEmisionSpan = document.getElementById("cudEmision");
const cudVencimientoSpan = document.getElementById("cudVencimiento");

if (afiliado.discapacidad) {
  cudEmisionField.style.display = "block";
  cudVencimientoField.style.display = "block";

 const ultimoCud = cud_documentos.length ? cud_documentos[cud_documentos.length - 1] : null;

cudEmisionSpan.textContent = ultimoCud?.fecha_emision
  ? ultimoCud.fecha_emision.split("-").reverse().join("/")
  : "-";

cudVencimientoSpan.textContent = ultimoCud
  ? (ultimoCud.sin_vencimiento ? "Sin vencimiento" : ultimoCud.fecha_vencimiento?.split("-").reverse().join("/"))
  : "-";

  // Ocultar checkbox en modo vista
  cudSinVencField.style.display = "none";
} else {
  cudEmisionField.style.display = "none";
  cudVencimientoField.style.display = "none";
  cudSinVencField.style.display = "none";
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

  // Estado
  mostrarEstado(afiliado.activo);

  // =========================
// PLAN MATERNO (vista)
// =========================
const categoriaNombre = afiliado.categoria_id?.nombre || "";

const planMaternoDesde = afiliado.plan_materno_desde;
const planMaternoHasta = afiliado.plan_materno_hasta;

const mostrarPlanMaterno =
  categoriaNombre === "Plan Materno" ||
  (planMaternoHasta && new Date(planMaternoHasta) >= new Date());

const desdeField = document.getElementById("planMaternoDesdeField");
const hastaField = document.getElementById("planMaternoHastaField");

if (mostrarPlanMaterno) {
  desdeField.style.display = "block";
  hastaField.style.display = "block";

  document.getElementById("planMaternoDesde").textContent =
    planMaternoDesde ? planMaternoDesde.split("-").reverse().join("/") : "-";

  document.getElementById("planMaternoHasta").textContent =
    planMaternoHasta ? planMaternoHasta.split("-").reverse().join("/") : "-";
} else {
  desdeField.style.display = "none";
  hastaField.style.display = "none";
}

const pagoField = document.getElementById("fechaUltimoPagoField");
const pagoSpan = document.getElementById("fechaUltimoPago");
const alerta = document.getElementById("alertaDeudor");

const categoriaElem = document.getElementById("categoria");
const categoria = categoriaElem?.value ?? categoriaElem?.textContent;

const fechaElem = document.getElementById("fechaNacimiento");
const fechaNac = fechaElem?.value ?? fechaElem?.textContent;

const numeroAfiliado = document.getElementById("numeroAfiliado")?.value ?? document.getElementById("numeroAfiliado")?.textContent;

console.log("categoria:", categoria);
console.log("fechaNac raw:", fechaNac);

const edad = fechaNac ? calcularEdad(fechaNac) : null;
console.log("edad calculada:", edad);

console.log("esCategoriaJubilado(categoria):", esCategoriaJubilado(categoria));
console.log("fechaNac && edad < 80:", fechaNac && edad < 80);
console.log("esTitular(numeroAfiliado):", esTitular(numeroAfiliado));

const pagaCuota =
  esCategoriaJubilado(categoria) &&
  edad !== null &&
  edad < 80 &&
  esTitular(numeroAfiliado);

console.log("pagaCuota final:", pagaCuota);

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

  renderAdjuntosDiscapacidad();
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
  document.getElementById("edadVista").textContent = edad !== null ? `${edad} años` : "-";

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

function formatoInputDate(fecha) {
  if (!fecha) return "";
  return fecha.split("T")[0]; // YYYY-MM-DD exacto, sin timezone
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

  // ------------------ REEMPLAZO DE CAMPOS ------------------
  reemplazarPorInput("telefono", afiliado.telefono);
  reemplazarPorInput("fechaNacimiento", formatoInputDate(afiliado.fechaNacimiento), "date");
  reemplazarPorInput("numeroAfiliado", afiliado.numero_afiliado);
  reemplazarPorInput("dni", afiliado.dni);
  reemplazarPorInput("cuil", afiliado.cuil);
  reemplazarPorInput("mail", afiliado.mail, "email");
  reemplazarPorInput("grupoFamiliarReal", afiliado.grupo_familiar_real);
  reemplazarPorSelect("parentesco", opciones.parentescos, parentescoNombre);
  reemplazarPorSelect("sexo", ["F", "M"], afiliado.sexo);
  reemplazarPorSelect("plan", opciones.planes, planNombre);
  reemplazarPorSelect("categoria", opciones.categorias, categoriaNombre);
  reemplazarPorSelect("localidad", opciones.localidades, localidadNombre);
  reemplazarPorSelect("grupoSanguineo", opcionesGrupoSanguineo, afiliado.grupo_sanguineo_id?.nombre);
  reemplazarPorCheckbox("discapacidad", afiliado.discapacidad);
  reemplazarPorInput("planMaternoDesde", formatoInputDate(afiliado.plan_materno_desde), "date");
  reemplazarPorInput("planMaternoHasta", formatoInputDate(afiliado.plan_materno_hasta), "date");
  reemplazarPorInput("cbuCvu", afiliado.cbu_cvu);

  // ------------------ ELEMENTOS ------------------
  const categoriaSelect = document.getElementById("categoria");
  const planMaternoHastaInput = document.getElementById("planMaternoHasta");
  const planMaternoDesdeInput = document.getElementById("planMaternoDesde");
  const fechaInput = document.getElementById("fechaNacimiento");
  const parentescoSelect = document.getElementById("parentesco");
  const dispCheckbox = document.getElementById("discapacidad");
  const nivelField = document.getElementById("nivelDiscapacidadField");

  planMaternoDesdeInput.disabled = false;
  planMaternoHastaInput.disabled = false;

  // ------------------ FUNCIONES CALLBACK ------------------
  function manejarCambioDiscapacidad() {
    if (dispCheckbox.checked) {
      nivelField.style.display = "block";
      convertirNivelDiscapacidadASelect();
      activarCamposCudEdicion();
    } else {
      nivelField.style.display = "none";
      document.getElementById("cudEmisionField").style.display = "none";
      document.getElementById("cudVencimientoField").style.display = "none";
      document.getElementById("cudSinVencimientoField").style.display = "none";
    }
    actualizarAdjuntoEdicion();
    actualizarCampoPago();
    actualizarPlanMaternoEdicion();
    renderAdjuntosDiscapacidad();
  }

  function manejarCambioCategoria() {
    actualizarCampoPago();
    actualizarPlanMaternoEdicion();
  }

  function manejarCambioFechaOParentesco() {
    actualizarEdadYEstudios();
    actualizarAdjuntoEdicion();
    actualizarCampoPago();
  }

  function manejarCambioPlanMaternoHasta() {
    controlarVencimientoPlanMaterno();
  }

  // ------------------ REMOVER LISTENERS EXISTENTES Y AGREGAR NUEVOS ------------------
  dispCheckbox.removeEventListener("change", manejarCambioDiscapacidad);
  dispCheckbox.addEventListener("change", manejarCambioDiscapacidad);

  categoriaSelect.removeEventListener("change", manejarCambioCategoria);
  categoriaSelect.addEventListener("change", manejarCambioCategoria);

  fechaInput.removeEventListener("input", manejarCambioFechaOParentesco);
  fechaInput.addEventListener("input", manejarCambioFechaOParentesco);

  parentescoSelect.removeEventListener("change", manejarCambioFechaOParentesco);
  parentescoSelect.addEventListener("change", manejarCambioFechaOParentesco);

  planMaternoHastaInput?.removeEventListener("change", manejarCambioPlanMaternoHasta);
  planMaternoHastaInput?.addEventListener("change", manejarCambioPlanMaternoHasta);

  // ------------------ INICIALIZAR CAMPOS SEGÚN DISCAPACIDAD ------------------
  if (afiliado.discapacidad) {
    nivelField.style.display = "block";
    reemplazarPorSelect("nivelDiscapacidad", ["Permanente", "Temporal"], afiliado.nivel_discapacidad);
    activarCamposCudEdicion();
  } else {
    nivelField.style.display = "none";
  }

  // ------------------ ACTUALIZAR CAMPOS INICIALES ------------------
  actualizarCampoPago();
  actualizarEdadYEstudios();
  actualizarAdjuntoEdicion();
  toggleBotones(true);
  renderAdjuntosDiscapacidad();

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

async function renderAdjuntosDiscapacidad() {
  const field = document.getElementById("adjuntoDiscapacidadField");
  const contenedor = document.getElementById("adjuntoDiscapacidadContenido");
  if (!field || !contenedor) return;

  // Limpia
  contenedor.innerHTML = "";

  // === VISIBILIDAD DEL FIELD ===
  if (!modoEdicion && !afiliado.discapacidad) {
    field.style.display = "none";
    return;
  }

  if (modoEdicion) {
    const chk = document.getElementById("discapacidad");
    if (!chk || !chk.checked) {
      field.style.display = "none";
      return;
    }
  }

  field.style.display = "block";

  // Traer documentos desde Supabase
const { data: cudDocs, error } = await supabase
  .from("cud_documentos")
  .select("*")
  .eq("afiliado_id", afiliado.id)
  .order("created_at", { ascending: true });

if (error) {
  contenedor.textContent = "Error al cargar documentos CUD";
  return;
}

if (!cudDocs || cudDocs.length === 0) {
  contenedor.innerHTML = `<span style="opacity:.7">No hay documentos CUD cargados</span>`;
} else {
  cudDocs.forEach(doc => {
  const row = document.createElement("div");
  row.classList.add("cud-item");

    row.innerHTML = `
      📎 <a href="${doc.archivo_url}" target="_blank">${doc.nombre_archivo || "Documento CUD"}</a>
    `;

    if (modoEdicion) {
      const btnEliminar = document.createElement("button");
      btnEliminar.textContent = "❌";
      btnEliminar.type = "button";
      btnEliminar.classList.add("btn-eliminar-cud");

      btnEliminar.onclick = async () => {
        await supabase.from("cud_documentos").delete().eq("id", doc.id);
        renderAdjuntosDiscapacidad();
      };

      row.appendChild(btnEliminar);
    }

    contenedor.appendChild(row);
  });
}

if (modoEdicion) {
  const btnAgregar = document.createElement("button");
  btnAgregar.type = "button";
  btnAgregar.textContent = "➕ Agregar CUD";
  btnAgregar.classList.add("btn-agregar-cud");

  btnAgregar.onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.png";
    input.style.display = "block";
    input.style.marginTop = "6px";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const url = await subirArchivoCloudinary(file, afiliado.numero_afiliado);
        if (!url) {
          Swal.fire("Error", "No se pudo subir el archivo", "error");
          return;
        }

        const fecha_emision = document.getElementById("cudEmision")?.value || null;
        const sin_vencimiento = document.getElementById("cudSinVencimiento")?.checked || false;
        const fecha_vencimiento = sin_vencimiento
          ? null
          : document.getElementById("cudVencimiento")?.value || null;

        if (!fecha_emision) {
          Swal.fire("Falta fecha", "Debe ingresar la fecha de emisión del CUD", "warning");
          return;
        }

        const { error } = await supabase
          .from("cud_documentos")
          .insert({
            afiliado_id: afiliado.id,
            archivo_url: url,
            nombre_archivo: file.name,
            fecha_emision,
            fecha_vencimiento,
            sin_vencimiento,
            tipo: "CUD"
          });

        if (error) {
          console.error("Error insertando CUD:", error);
          Swal.fire("Error", error.message, "error");
          return;
        }

        await renderAdjuntosDiscapacidad();

      } catch (err) {
        console.error(err);
        Swal.fire("Error", "Error inesperado al cargar el CUD", "error");
      }
    };

    contenedor.appendChild(input);
  };

  contenedor.appendChild(btnAgregar);
}

}

function controlarVencimientoPlanMaterno() {
  if (!modoEdicion) return;

  const hastaInput = document.getElementById("planMaternoHasta");
  const categoriaSelect = document.getElementById("categoria");

  if (!hastaInput || !categoriaSelect) return;

  if (!hastaInput.value) return;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fechaHasta = new Date(hastaInput.value);
  fechaHasta.setHours(0, 0, 0, 0);

  // Si venció y sigue en Plan Materno → cambia solo
  if (fechaHasta < hoy && categoriaSelect.value === "Plan Materno") {
    categoriaSelect.value = "Obligatorios";
    categoriaSelect.dispatchEvent(new Event("change"));
  }
}

function actualizarPlanMaternoEdicion() {
  if (!modoEdicion) return;

  const categoriaSelect = document.getElementById("categoria");
  const desdeField = document.getElementById("planMaternoDesdeField");
  const hastaField = document.getElementById("planMaternoHastaField");
  const desdeInput = document.getElementById("planMaternoDesde");
  const hastaInput = document.getElementById("planMaternoHasta");

  if (!categoriaSelect || !desdeField || !hastaField) return;

  const esPlanMaterno = categoriaSelect.value === "Plan Materno";

  if (esPlanMaterno) {
    // Mostrar y habilitar
    desdeField.style.display = "block";
    hastaField.style.display = "block";

    desdeInput.disabled = false;
    hastaInput.disabled = false;

    // Restaurar valores si estaban vacíos
    if (!desdeInput.value) {
      desdeInput.value = formatoInputDate(afiliado.plan_materno_desde);
    }
    if (!hastaInput.value) {
      hastaInput.value = formatoInputDate(afiliado.plan_materno_hasta);
    }

  } else {
    // Ocultar
    desdeField.style.display = "none";
    hastaField.style.display = "none";

    // Limpiar valores
    desdeInput.value = "";
    hastaInput.value = "";

    // Deshabilitar (CLAVE)
    desdeInput.disabled = true;
    hastaInput.disabled = true;
  }
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
  ["Grado", "Posgrado", "Terciario", "Universitario"].forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (afiliado.estudios === op) o.selected = true;
    select.appendChild(o);
  });
  actual.replaceWith(select);
}
function restaurarCampos() {

  // -------- Inputs simples --------
  ["telefono","mail","fechaNacimiento","numeroAfiliado","dni","cuil","cbuCvu"].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === "INPUT") {
      const span = document.createElement("span");
      span.id = id;
      span.textContent = afiliado[id] || "-";
      el.replaceWith(span);
    }
  });

  // -------- CUD (usar último documento) --------
  const ultimoCud = cud_documentos.length
    ? cud_documentos[cud_documentos.length - 1]
    : null;

  ["cudEmision", "cudVencimiento"].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === "INPUT") {
      const span = document.createElement("span");
      span.id = id;

      let valor = null;

      if (ultimoCud) {
        if (id === "cudEmision") {
          valor = ultimoCud.fecha_emision;
        } else {
          valor = ultimoCud.sin_vencimiento
            ? "Sin vencimiento"
            : ultimoCud.fecha_vencimiento;
        }
      }

      span.textContent = valor
        ? valor.split?.("-").reverse().join("/") || valor
        : "-";

      el.replaceWith(span);
    }
  });

  // -------- Checkbox sin vencimiento --------
  const sinV = document.getElementById("cudSinVencimiento");
  if (sinV && sinV.tagName === "INPUT") {
    const span = document.createElement("span");
    span.id = "cudSinVencimiento";
    span.textContent = ultimoCud?.sin_vencimiento ? "Sí" : "No";
    sinV.replaceWith(span);
  }

  // -------- Grupo familiar real --------
  const elGrupoReal = document.getElementById("grupoFamiliarReal");
  if (elGrupoReal && (elGrupoReal.tagName === "INPUT" || elGrupoReal.tagName === "SELECT")) {
    const span = document.createElement("span");
    span.id = "grupoFamiliarReal";
    span.textContent = afiliado.grupo_familiar_real || "-";
    elGrupoReal.replaceWith(span);
  }

  // -------- Selects --------
  ["parentesco","sexo","plan","categoria","localidad","discapacidad","nivelDiscapacidad","grupoSanguineo"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === "SELECT" || el.tagName === "INPUT") {
      const span = document.createElement("span");
      span.id = id;

      if (id === "discapacidad") span.textContent = afiliado.discapacidad ? "Sí" : "No";
      else if (id === "nivelDiscapacidad") span.textContent = afiliado.nivel_discapacidad || "-";
      else if (id === "grupoSanguineo") span.textContent = afiliado.grupo_sanguineo_id?.nombre || "-";
      else span.textContent = afiliado[id] || "-";

      el.replaceWith(span);
    }
  });

  // -------- Estudios --------
  const est = document.getElementById("estudios");
  if (est && est.tagName === "SELECT") {
    const span = document.createElement("span");
    span.id = "estudios";
    span.textContent = afiliado.estudios || "-";
    est.replaceWith(span);
  }

  // -------- Plan materno --------
  ["planMaternoDesde", "planMaternoHasta"].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === "INPUT") {
      const span = document.createElement("span");
      span.id = id;

      const valor = afiliado[id === "planMaternoDesde"
        ? "plan_materno_desde"
        : "plan_materno_hasta"
      ];

      span.textContent = valor
        ? valor.split("-").reverse().join("/")
        : "-";

      el.replaceWith(span);
    }
  });
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
  const cuil = document.getElementById("cuil")?.value || null;
  const mail = document.getElementById("mail")?.value || null;
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
  const plan_materno_desde = document.getElementById("planMaternoDesde")?.value || null;
  const plan_materno_hasta = document.getElementById("planMaternoHasta")?.value || null;
  const cbu_cvu = document.getElementById("cbuCvu")?.value || null;
  const fecha_emision = document.getElementById("cudEmision")?.value || null;
  const fecha_vencimiento = document.getElementById("cudVencimiento")?.value || null;
  const sin_vencimiento = document.getElementById("cudSinVencimiento")?.checked || false;

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
      adjuntoEstudiosUrl = await subirArchivoCloudinary(file, numero_afiliado);
    }
  } else {
    adjuntoEstudiosUrl = null;
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
// VALIDACIÓN FECHAS PLAN MATERNO
// =========================
if (plan_materno_desde && plan_materno_hasta) {
  const desdePM = new Date(plan_materno_desde);
  const hastaPM = new Date(plan_materno_hasta);

  desdePM.setHours(0, 0, 0, 0);
  hastaPM.setHours(0, 0, 0, 0);

  if (hastaPM < desdePM) {
    Swal.fire(
      "Fechas inválidas",
      "La fecha 'Hasta' del Plan Materno no puede ser anterior a la fecha 'Desde'.",
      "error"
    );
    return;
  }
}

  // =========================
  // Payload con IDs y campos
  // =========================
  const payload = {
    telefono,
    fechaNacimiento: fecha_nacimiento,
    dni,
    cuil,
    mail,
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
    grupo_sanguineo_id: gsData?.id || null,
    fecha_ultimo_pago_cuota,
    plan_materno_desde,
    plan_materno_hasta,
    cbu_cvu
  };

  const { error } = await supabase.from("afiliados").update(payload).eq("id", afiliadoId);

  if (error) {
    Swal.fire("Error", "No se pudo guardar los cambios", "error");
    console.error(error);
    return;
  }

  // =========================
// VALIDACIÓN FECHAS CUD
// =========================
if (discapacidad) {
  if (!fecha_emision) {
    Swal.fire(
      "Falta fecha",
      "Debe ingresar la fecha de emisión del CUD.",
      "warning"
    );
    return;
  }

  if (!sin_vencimiento && fecha_vencimiento) {
    const emision = new Date(fecha_emision);
    const venc = new Date(fecha_vencimiento);

    emision.setHours(0, 0, 0, 0);
    venc.setHours(0, 0, 0, 0);

    if (venc < emision) {
      Swal.fire(
        "Fechas inválidas",
        "La fecha de vencimiento del CUD no puede ser anterior a la fecha de emisión.",
        "error"
      );
      return;
    }
  }
}

  // =========================
// ACTUALIZAR CUD EXISTENTE
// =========================
if (discapacidad && cud_documentos.length > 0) {
  const ultimoCud = cud_documentos[cud_documentos.length - 1];

  const { error: cudUpdateError } = await supabase
    .from("cud_documentos")
    .update({
      fecha_emision,
      fecha_vencimiento: sin_vencimiento ? null : fecha_vencimiento,
      sin_vencimiento
    })
    .eq("id", ultimoCud.id);

  if (cudUpdateError) {
    console.error("Error actualizando CUD:", cudUpdateError);
    Swal.fire("Error", "No se pudo actualizar el CUD", "error");
    return;
  }
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
await cargarAfiliado(); 
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
document.getElementById("btnVolver").addEventListener("click", () => {
  window.location.href = "/pages/padron.html";
});

document.getElementById("btnFichaMedica")?.addEventListener("click", () => {
  if (!afiliado?.id) return;
  window.location.href = `/pages/fichaMedica.html?id=${afiliado.id}`;
});


// =====================
// ELIMINAR DEFINITIVO
// =====================
async function eliminarAfiliado() {
  const res = await Swal.fire({
    title: "¿Eliminar afiliado definitivamente?",
    text: "Esta acción no se puede deshacer.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar"
  });

  if (!res.isConfirmed) return;

  const { error } = await supabase.from("afiliados").delete().eq("id", afiliadoId);

  if (error) {
    Swal.fire("Error", "No se pudo eliminar el afiliado", "error");
    console.error(error);
    return;
  }

  Swal.fire("Eliminado", "El afiliado ha sido eliminado correctamente", "success").then(() => {
    window.location.href = "/pages/padron.html";
  });
}

document.getElementById("btnEliminar").addEventListener("click", eliminarAfiliado);

/* =====================
   INICIO
===================== */
await cargarHeader();
await cargarAfiliado();