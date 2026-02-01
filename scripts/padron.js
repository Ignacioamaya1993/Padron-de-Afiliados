import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

await cargarHeader();

let buscando = false;

/* =====================
   HELPERS
===================== */
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const hoy = new Date();
  const fn = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
  return edad;
}

function obtenerAlertaJubilado(categoriaNombre, fechaUltimoPago, fechaNacimiento) {
  if (
    (categoriaNombre === "Jubilado ANSES" ||
     categoriaNombre === "Pensionado ANSES reparto") &&
    fechaUltimoPago &&
    fechaNacimiento &&
    calcularEdad(fechaNacimiento) < 80
  ) {
    const hoy = new Date();
    const f = new Date(fechaUltimoPago);
    const dias = Math.floor((hoy - f) / (1000 * 60 * 60 * 24));

    if (dias > 40) {
      return "⚠ Jubilado con más de 40 días sin pago de cuota social";
    }
  }
  return null;
}

function mesesHastaCumple(fechaNacimiento, edadObjetivo) {
  const hoy = new Date();
  const fn = new Date(fechaNacimiento);
  const cumple = new Date(fn.getFullYear() + edadObjetivo, fn.getMonth(), fn.getDate());
  const diffMs = cumple - hoy;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
}

function pasoEdadLimite(fechaNacimiento, edadLimite) {
  if (!fechaNacimiento) return true;
  const fn = new Date(fechaNacimiento);
  const fechaLimite = new Date(fn.getFullYear() + edadLimite, fn.getMonth(), fn.getDate());
  return new Date() >= fechaLimite;
}

function obtenerAlertaHijo(fechaNacimiento, parentesco, estudios) {
  if (!fechaNacimiento) return null;

  // 🔹 Hijos
  if (parentesco === "Hijos") {
    const edad = calcularEdad(fechaNacimiento);
    const meses21 = mesesHastaCumple(fechaNacimiento, 21);

    if (edad === 20 && meses21 <= 2 && meses21 >= 0) {
      return "⚠ Próximo a cumplir 21 años (límite de cobertura)";
    }

    if (estudios) {
      const meses26 = mesesHastaCumple(fechaNacimiento, 26);
      if (edad === 25 && meses26 <= 2 && meses26 >= 0) {
        return "⚠ Próximo a cumplir 26 años (fin cobertura por estudios)";
      }
    }
  }

    // 🔹 Menor b/ guarda
    if (parentesco === "Menor B/ guarda") {
      const edad = calcularEdad(fechaNacimiento);
      const meses18 = mesesHastaCumple(fechaNacimiento, 18);

      if (edad !== null && edad === 17 && meses18 <= 2 && meses18 >= 0) {
        return "⚠ Próximo a cumplir 18 años (fin cobertura por guarda)";
      }
    }

  return null;
}

/* =====================
   ELEMENTOS FORMULARIO
===================== */
const f = document.getElementById("PadronForm");

const parentescoSelect = f.querySelector('[name="parentesco_id"]');
const fechaNacimientoInput = f.querySelector('[name="fechaNacimiento"]');
const estudiosField = document.getElementById("estudiosField");
const estudiosSelect = f.querySelector('[name="estudios"]');
const edadInput = f.querySelector('[name="edad"]');
const grupoSanguineoSelect = f.querySelector('[name="grupo_sanguineo_id"]');
const discapacidadCheckbox = document.getElementById("discapacidad");
const nivelDiscapacidadSelect = f.querySelector('[name="nivelDiscapacidad"]');
const adjuntoDiscapacidadField = document.getElementById("adjuntoDiscapacidadField");
const adjuntoDiscapacidadInput = f.querySelector('[name="adjuntoDiscapacidad"]');

const adjuntoEstudiosField = document.getElementById("adjuntoEstudiosField");

/* =====================
   CATÁLOGOS
===================== */
async function cargarSelect(tabla, select) {
  if (!select) return;
  const { data, error } = await supabase.from(tabla).select("id, nombre").order("nombre");
  if (error) {
    console.error(`Error cargando ${tabla}`, error);
    return;
  }
  data.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id; 
    opt.textContent = r.nombre;
    select.appendChild(opt);
  });
}

let dicParentescos = {};

async function cargarCatalogos() {
  const { data, error } = await supabase.from("parentescos").select("id,nombre").order("nombre");
  if (!error && data) {
    data.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.nombre;
      parentescoSelect.appendChild(opt);
      dicParentescos[r.id] = r.nombre;
    });
  }
  await cargarSelect("planes", f.querySelector('[name="plan_id"]'));
  await cargarSelect("categorias", f.querySelector('[name="categoria_id"]'));
  await cargarSelect("localidades", f.querySelector('[name="localidad_id"]'));
  await cargarSelect("grupo_sanguineo", grupoSanguineoSelect);
}

await cargarCatalogos();

function dentroRangoEstudio(fechaNacimiento) {
  if (!fechaNacimiento) return false;
  const fn = new Date(fechaNacimiento);
  const hoy = new Date();
  const cumple21 = new Date(fn.getFullYear() + 21, fn.getMonth(), fn.getDate());
  const cumple26 = new Date(fn.getFullYear() + 26, fn.getMonth(), fn.getDate());
  return hoy >= cumple21 && hoy < cumple26;
}

/* =====================
   EDAD / ESTUDIOS / ADJUNTOS
===================== */
function actualizarEdadYAdjunto() {
  const fechaNacimiento = fechaNacimientoInput.value;
  const parentescoId = parentescoSelect.value;
  const edad = calcularEdad(fechaNacimiento);
  const estudiosValue = estudiosSelect.value;

  edadInput.value = fechaNacimiento ? edad : "";

  if (parentescoId && dicParentescos[parentescoId] === "Hijos" && fechaNacimiento && dentroRangoEstudio(fechaNacimiento)) {
    estudiosField.style.display = "block";
  } else {
    estudiosField.style.display = "none";
    estudiosSelect.value = "";
  }

  if (estudiosValue && estudiosField.style.display === "block") {
    adjuntoEstudiosField.style.display = "block";
  } else {
    adjuntoEstudiosField.style.display = "none";
  }

  // Discapacidad
  if (discapacidadCheckbox.checked && nivelDiscapacidadSelect.value) {
    adjuntoDiscapacidadField.style.display = "block";
    adjuntoDiscapacidadInput.required = true;
  } else {
    adjuntoDiscapacidadField.style.display = "none";
    adjuntoDiscapacidadInput.required = false;
    adjuntoDiscapacidadInput.value = "";
  }
}

const categoriaSelect = f.querySelector('[name="categoria_id"]');
const planMaternoFields = document.getElementById("planMaternoFields");

function actualizarPlanMaterno() {
  const selectedText =
    categoriaSelect.options[categoriaSelect.selectedIndex]?.text;

  if (selectedText === "Plan Materno") {
    planMaternoFields.style.display = "flex";
  } else {
    planMaternoFields.style.display = "none";
    f.plan_materno_desde.value = "";
    f.plan_materno_hasta.value = "";
  }
}

categoriaSelect.addEventListener("change", actualizarPlanMaterno);

fechaNacimientoInput?.addEventListener("input", actualizarEdadYAdjunto);
parentescoSelect?.addEventListener("change", actualizarEdadYAdjunto);
estudiosSelect?.addEventListener("change", actualizarEdadYAdjunto);
discapacidadCheckbox?.addEventListener("change", actualizarEdadYAdjunto);
nivelDiscapacidadSelect?.addEventListener("change", actualizarEdadYAdjunto);

/* =====================
   TITULAR DE GRUPO
===================== */
const numeroAfiliadoInput = f.querySelector('[name="numero_afiliado"]');
const titularGrupoInput = document.getElementById("titularGrupo");
const titularGrupoWrapper = document.getElementById("titularGrupoWrapper");

function esTitular(numero) {
  return numero.endsWith("/00");
}

async function obtenerTitularGrupo(codigo) {
  const { data } = await supabase
    .from("afiliados")
    .select("nombre, apellido")
    .eq("grupo_familiar_codigo", codigo)
    .ilike("numero_afiliado", "%/00")
    .maybeSingle();
  return data ? `${data.nombre} ${data.apellido}` : null;
}

numeroAfiliadoInput.addEventListener("input", async () => {
  titularGrupoWrapper.style.display = "none";
  titularGrupoInput.value = "";
  const val = numeroAfiliadoInput.value.trim();
  if (!val || esTitular(val)) return;
  const match = val.match(/^[^-]+-([^/]+)\//);
  if (!match) return;
  const titular = await obtenerTitularGrupo(match[1]);
  if (titular) {
    titularGrupoInput.value = titular;
    titularGrupoWrapper.style.display = "block";
  }
});

/* =====================
   BUSCADOR
===================== */
const searchInput = document.getElementById("searchInput");
const resultadosDiv = document.createElement("div");
resultadosDiv.className = "resultados-busqueda";
searchInput.after(resultadosDiv);

let debounce;
searchInput.addEventListener("input", e => {
  clearTimeout(debounce);
  resultadosDiv.innerHTML = "";
  const texto = e.target.value.trim();
  if (texto.length < 3) return;
  debounce = setTimeout(() => buscarAfiliados(texto), 300);
});

async function buscarAfiliados(texto) {
  if (buscando) return;
  buscando = true;
  try {
    const { data: afiliados, error } = await supabase
      .from("afiliados")
.select(`
  id,
  nombre,
  apellido,
  dni,
  numero_afiliado,
  parentesco_id,
  fechaNacimiento,
  estudios,
  activo,
  grupo_familiar_codigo,
  fecha_ultimo_pago_cuota,
  categoria_id (nombre)
`)

      .or(`nombre.ilike.%${texto}%,apellido.ilike.%${texto}%,dni.ilike.%${texto}%,numero_afiliado.ilike.%${texto}%`)
      .limit(20);
    if (error) throw error;

    resultadosDiv.innerHTML = "";
    if (!afiliados.length) {
      resultadosDiv.innerHTML = "<p style='opacity:.7'>Sin resultados</p>";
      return;
    }

    const grupos = [...new Set(afiliados.map(a => a.grupo_familiar_codigo))];
    const { data: titulares } = await supabase
      .from("afiliados")
      .select("nombre, apellido, grupo_familiar_codigo")
      .in("grupo_familiar_codigo", grupos)
      .ilike("numero_afiliado", "%/00");

    const dicTitulares = {};
    titulares.forEach(t => {
      dicTitulares[t.grupo_familiar_codigo] = `${t.nombre} ${t.apellido}`;
    });

    afiliados.forEach(a => {
      const textoParentesco = a.numero_afiliado.endsWith("/00") ? "Titular" : (dicParentescos[a.parentesco_id] || "N/A");
      const alerta = obtenerAlertaHijo(a.fechaNacimiento, textoParentesco, a.estudios);
      const alertaJubilado = obtenerAlertaJubilado(a.categoria_id?.nombre, a.fecha_ultimo_pago_cuota);
      const edad = a.fechaNacimiento ? calcularEdad(a.fechaNacimiento) : "";
      const estado = a.activo
        ? `<span style="color:#16a34a;font-weight:600">🟢 Activo</span>`
        : `<span style="color:#dc2626;font-weight:600">🔴 Dado de baja</span>`;

      const div = document.createElement("div");
      div.className = "resultado-item";
      div.innerHTML = `
        <strong>${a.nombre} ${a.apellido} ${estado}</strong><br>
        DNI: ${a.dni || "-"} ${edad !== "" ? `| Edad: ${edad}` : ""}<br>
        Afiliado: ${a.numero_afiliado} | ${textoParentesco}
        ${alerta ? `<div class="alerta-edad">${alerta}</div>` : ""}
        ${alertaJubilado ? `<div class="alerta-edad">${alertaJubilado}</div>` : ""}
      `;
      div.onclick = () => location.href = `/pages/afiliado.html?id=${a.id}`;
      resultadosDiv.appendChild(div);
    });
  } catch (e) {
    console.error(e);
    Swal.fire("Error", "No se pudo buscar el afiliado", "error");
  } finally {
    buscando = false;
  }
}

/* =====================
   NUEVO AFILIADO
===================== */
f.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = f.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const data = Object.fromEntries(new FormData(f).entries());
    if (!data.nombre || !data.apellido || !data.dni || !data.numero_afiliado || !data.parentesco_id || !data.sexo) {
      Swal.fire("Atención", "Completá todos los campos obligatorios", "warning");
      btn.disabled = false; btn.textContent = "Guardar"; return;
    }

    const match = data.numero_afiliado.match(/^[^-]+-([^/]+)\//);
    if (!match) { Swal.fire("Formato incorrecto", "Formato esperado: 19-00639-4/00", "error"); btn.disabled = false; btn.textContent = "Guardar"; return; }

          // Validación de duplicados
      const { data: dniExistente } = await supabase
        .from("afiliados")
        .select("id")
        .eq("dni", data.dni);

      if (dniExistente.length) {
        Swal.fire("Error", "Ya existe un afiliado con ese DNI", "error");
        btn.disabled = false;
        btn.textContent = "Guardar";
        return;
      }

      const { data: nroExistente } = await supabase
        .from("afiliados")
        .select("id")
        .eq("numero_afiliado", data.numero_afiliado);

      if (nroExistente.length) {
        Swal.fire("Error", "Ya existe un afiliado con ese número de afiliado", "error");
        btn.disabled = false;
        btn.textContent = "Guardar";
        return;
      }

          // =====================
        // Validación Menor b/ guarda (hasta 18 años exactos)
        // =====================
    if (
      dicParentescos[data.parentesco_id] === "Menor B/ guarda" &&
      fechaNacimientoInput.value
    ) {
      const edadGuarda = calcularEdad(fechaNacimientoInput.value);

      if (edadGuarda !== null && edadGuarda >= 18) {
        Swal.fire(
          "Edad inválida",
          "Un menor bajo guarda solo puede afiliarse si tiene menos de 18 años.",
          "error"
        );
        btn.disabled = false;
        btn.textContent = "Guardar";
        return;
      }
    }

    // Validaciones hijos
    if (dicParentescos[data.parentesco_id] === "Hijos" && fechaNacimientoInput.value) {
      const edadHijo = calcularEdad(fechaNacimientoInput.value);
      if (edadHijo > 26) {
        Swal.fire("No permitido", "Los hijos mayores de 26 años no pueden afiliarse", "error");
        btn.disabled = false; btn.textContent = "Guardar"; return;
      }
      if (edadHijo >= 21 && !f.adjuntoEstudios?.files[0]) {
        Swal.fire("Requerido", "Debe adjuntar constancia de alumno regular", "warning");
        btn.disabled = false; btn.textContent = "Guardar"; return;
      }
    }

    // Validación discapacidad
    if (discapacidadCheckbox.checked && !adjuntoDiscapacidadInput?.files[0]) {
      Swal.fire("Requerido", "Debe adjuntar constancia de discapacidad (CUD)", "warning");
      btn.disabled = false; btn.textContent = "Guardar"; return;
    }

    // Validación discapacidad
if (discapacidadCheckbox.checked && !adjuntoDiscapacidadInput?.files[0]) {
  Swal.fire(
    "Requerido",
    "Debe adjuntar constancia de discapacidad (CUD)",
    "warning"
  );
  btn.disabled = false;
  btn.textContent = "Guardar";
  return;
}

/* =====================
   VALIDACIÓN PLAN MATERNO
===================== */
const categoriaText =
  categoriaSelect.options[categoriaSelect.selectedIndex]?.text;

if (categoriaText === "Plan Materno") {
  if (!data.plan_materno_desde || !data.plan_materno_hasta) {
    Swal.fire(
      "Datos incompletos",
      "Debe indicar desde y hasta para el Plan Materno",
      "warning"
    );
    btn.disabled = false;
    btn.textContent = "Guardar";
    return;
  }

  if (data.plan_materno_desde > data.plan_materno_hasta) {
    Swal.fire(
      "Fechas inválidas",
      "La fecha 'desde' no puede ser posterior a la fecha 'hasta'",
      "error"
    );
    btn.disabled = false;
    btn.textContent = "Guardar";
    return;
  }
}

const carpetaAfiliado = data.numero_afiliado;

const adjuntoEstudios = f.adjuntoEstudios?.files[0]
  ? await subirArchivoCloudinary(f.adjuntoEstudios.files[0], carpetaAfiliado)
  : null;

const adjuntoDiscapacidad = adjuntoDiscapacidadInput?.files[0]
  ? await subirArchivoCloudinary(adjuntoDiscapacidadInput.files[0], carpetaAfiliado)
  : null;


    const { data: user } = await supabase.auth.getUser();

    const { error } = await supabase.from("afiliados").insert({
      nombre: data.nombre,
      apellido: data.apellido,
      dni: data.dni,
      telefono: data.telefono || null,
      fechaNacimiento: fechaNacimientoInput.value || null,
      numero_afiliado: data.numero_afiliado,
      grupo_familiar_codigo: match[1],
      parentesco_id: data.parentesco_id,
      sexo: data.sexo,
      grupo_familiar_real: data.grupo_familiar_real || null,
      plan_id: data.plan_id || null,
      categoria_id: data.categoria_id || null,
      localidad_id: data.localidad_id || null,
      grupo_sanguineo_id: data.grupo_sanguineo_id || null,
      discapacidad: discapacidadCheckbox.checked,
      nivel_discapacidad: nivelDiscapacidadSelect.value || null,
      estudios: estudiosSelect.value || null,
      adjuntoEstudios,
      adjuntoDiscapacidad,
      edad: edadInput.value || null,
      created_by: user.user.id,
      plan_materno_desde: data.plan_materno_desde || null,
      plan_materno_hasta: data.plan_materno_hasta || null,  
    });
    
    if (error) throw error;

    Swal.fire("Guardado", "Afiliado agregado correctamente", "success");
    f.reset();
    actualizarEdadYAdjunto();
    actualizarPlanMaterno();

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo guardar el afiliado", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
});

/* =====================
   MOSTRAR / OCULTAR FORM
===================== */
const btnNuevo = document.getElementById("btnNuevoAfiliado");
const btnCancelar = document.getElementById("btnCancelarNuevo");
const nuevoSection = document.getElementById("nuevoAfiliadoSection");

btnNuevo.onclick = () => {
  nuevoSection.style.display = "block";
  btnNuevo.style.display = "none";
};
btnCancelar.onclick = () => {
  nuevoSection.style.display = "none";
  btnNuevo.style.display = "inline-block";
};
