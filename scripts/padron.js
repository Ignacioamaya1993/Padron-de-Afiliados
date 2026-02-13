import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

await cargarHeader();

let buscando = false;
let searchToken = 0;

/* =====================
   HELPERS
===================== */

/*
  Calcula la edad en años a partir de una fecha de nacimiento.
  Tiene en cuenta si ya cumplió años este año o no.
*/
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const hoy = new Date();
  const fn = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
  return edad;
}

function obtenerAlertaCud(cuds) {
  if (!cuds || !cuds.length) return null;

  const cud = cuds[cuds.length - 1];
  if (cud.sin_vencimiento) return null;
  if (!cud.fecha_vencimiento) return null;

  const hoy = new Date();
  const venc = new Date(cud.fecha_vencimiento);
  const diffDias = Math.floor((venc - hoy) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return "❌ CUD vencido";
  }

  if (diffDias <= 90) {
    return "⚠ CUD próximo a vencer";
  }

  return null;
}

/*
  Genera una alerta para jubilados/pensionados ANSES
  si hace más de 40 días que no pagan y son menores de 80 años
*/
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

/*
  Calcula cuántos meses faltan para que una persona
  llegue a una edad específica (21, 26, 18, etc.)
*/
function mesesHastaCumple(fechaNacimiento, edadObjetivo) {
  const hoy = new Date();
  const fn = new Date(fechaNacimiento);
  const cumple = new Date(fn.getFullYear() + edadObjetivo, fn.getMonth(), fn.getDate());
  const diffMs = cumple - hoy;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
}

/*
  Genera alertas para hijos o menores bajo guarda
  cuando están cerca de perder cobertura por edad
*/
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

/*
  Referencias a todos los inputs y secciones del formulario
*/
const f = document.getElementById("PadronForm");
const parentescoSelect = f.querySelector('[name="parentesco_id"]');
const fechaNacimientoInput = f.querySelector('[name="fechaNacimiento"]');
const estudiosField = document.getElementById("estudiosField");
const estudiosSelect = f.querySelector('[name="estudios"]');
const edadInput = document.getElementById("edad");
const grupoSanguineoSelect = f.querySelector('[name="grupo_sanguineo_id"]');
const discapacidadCheckbox = document.getElementById("discapacidad");
const nivelDiscapacidadSelect = f.querySelector('[name="nivelDiscapacidad"]');
const adjuntoDiscapacidadField = document.getElementById("adjuntoDiscapacidadField");
const adjuntoDiscapacidadInput = f.querySelector('[name="adjuntoDiscapacidad"]');
const fechasDiscapacidadDiv = document.getElementById("fechasDiscapacidad");
const cudPermanenteCheckbox = document.getElementById("cudPermanente");
const cudVencimientoInput = f.querySelector('[name="cud_vencimiento"]');
const adjuntoEstudiosField = document.getElementById("adjuntoEstudiosField");

/* =====================
   CATÁLOGOS
===================== */

/*
  Carga opciones de una tabla (planes, categorías, etc.)
  dentro de un select HTML
*/
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

/*
  Diccionario id → nombre de parentescos
  Se usa en validaciones y alertas
*/
let dicParentescos = {};

/*
  Carga todos los catálogos necesarios al iniciar la pantalla
*/
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

/*
  Determina si un hijo está en el rango 21–26
  donde puede seguir cubierto solo si estudia
*/
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

/*
  Actualiza:
  - Edad calculada
  - Mostrar/ocultar estudios
  - Mostrar/ocultar adjuntos
  - Mostrar/ocultar discapacidad
*/
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

  // Manejo de discapacidad
    if (discapacidadCheckbox.checked && nivelDiscapacidadSelect.value) {
      adjuntoDiscapacidadField.style.display = "block";
      fechasDiscapacidadDiv.style.display = "flex";
      adjuntoDiscapacidadInput.required = true;

      // Si es permanente y tilda "sin vencimiento"
      if (nivelDiscapacidadSelect.value === "Permanente" && cudPermanenteCheckbox.checked) {
        cudVencimientoInput.value = "";
        cudVencimientoInput.disabled = true;
        cudVencimientoInput.required = false;
      } else {
        cudVencimientoInput.disabled = false;
        cudVencimientoInput.required = true;
      }

    } else {
      adjuntoDiscapacidadField.style.display = "none";
      fechasDiscapacidadDiv.style.display = "none";
      adjuntoDiscapacidadInput.required = false;

      cudVencimientoInput.disabled = false;
      cudPermanenteCheckbox.checked = false;
    }
}

/* =====================
   PLAN MATERNO
===================== */
/*
  Muestra campos adicionales solo si la categoría
  seleccionada es "Plan Materno"
*/
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
cudPermanenteCheckbox.addEventListener("change", actualizarEdadYAdjunto);

/* =====================
   TITULAR DE GRUPO
===================== */

/*
  Determina si un número de afiliado corresponde al titular del grupo
  Convención: los titulares terminan en "/00"
*/
const numeroAfiliadoInput = f.querySelector('[name="numero_afiliado"]');
const titularGrupoInput = document.getElementById("titularGrupo");
const titularGrupoWrapper = document.getElementById("titularGrupoWrapper");

/*
  Determina si un número de afiliado corresponde al titular del grupo
  Convención: los titulares terminan en "/00"
*/
function esTitular(numero) {
  return numero.endsWith("/00");
}

/*
  Busca en la base de datos al titular del grupo familiar
  usando el código de grupo_familiar_codigo
*/
async function obtenerTitularGrupo(codigo) {
  const { data } = await supabase
    .from("afiliados")
    .select("nombre, apellido")
    .eq("grupo_familiar_codigo", codigo)
    .ilike("numero_afiliado", "%/00")
    .maybeSingle();
  return data ? `${data.nombre} ${data.apellido}` : null;
}

/*
  Al escribir el número de afiliado:
  - Si es titular → no hace nada
  - Si es adherente → busca y muestra el titular del grupo
*/
numeroAfiliadoInput.addEventListener("input", async () => {
  titularGrupoWrapper.style.display = "none";
  titularGrupoInput.value = "";
  const val = numeroAfiliadoInput.value.trim();
  if (!val || esTitular(val)) return;

    // Extrae el código del grupo familiar del formato XX-XXXXX-X/YY
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
/*
  Buscador en vivo de afiliados:
  - Usa debounce para no saturar la base
  - Busca por nombre, apellido, DNI o número de afiliado
  - Muestra alertas de edad y jubilados
*/
const searchInput = document.getElementById("searchInput");
const resultadosDiv = document.createElement("div");
resultadosDiv.className = "resultados-busqueda";
searchInput.after(resultadosDiv);

let debounce;

/*
  Escucha escritura en el input de búsqueda
  Ejecuta la búsqueda recién después de 300ms sin teclear
*/
function manejarBusqueda() {
  clearTimeout(debounce);

  const texto = searchInput.value
    .trim()
    .replace(/\s+/g, " ");

  resultadosDiv.innerHTML = "";

  if (texto.length < 3) {
    searchToken++;
    return;
  }

  debounce = setTimeout(() => buscarAfiliados(texto, ++searchToken), 300);
}

// Escucha TODOS los posibles disparadores
searchInput.addEventListener("input", manejarBusqueda);

/*
  Consulta afiliados en Supabase y renderiza los resultados
  Incluye:
  - Estado activo/baja
  - Edad
  - Alertas por edad límite
  - Alertas por jubilación impaga
*/
async function buscarAfiliados(texto, token) {
  if (buscando) return;
  buscando = true;

  try {
    const palabras = texto.split(" ");

    let query = supabase
      .from("afiliados")
      .select(`
        id,
        nombre,
        apellido,
        nombre_completo,
        dni,
        numero_afiliado,
        parentesco_id,
        fechaNacimiento,
        estudios,
        activo,
        grupo_familiar_codigo,
        fecha_ultimo_pago_cuota,
        categoria_id (nombre),
        cud_documentos (
        fecha_vencimiento,
        sin_vencimiento
        )
      `);

    const filtro = palabras
      .map(p => 
        `nombre_completo.ilike.%${p}%,dni.ilike.%${p}%,numero_afiliado.ilike.%${p}%`
      )
      .join(",");

    query = query.or(filtro);

    const { data: afiliados, error } = await query.limit(20);
    if (error) throw error;

    // si ya hubo otra búsqueda, ignoro esta
    if (token !== searchToken) return;

    resultadosDiv.innerHTML = "";
    if (!afiliados.length) {
      resultadosDiv.innerHTML = "<p style='opacity:.7'>Sin resultados</p>";
      return;
    }

      /*
      Obtiene los titulares de cada grupo familiar
      para poder mostrar relaciones correctamente
    */
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

        /*
      Renderiza cada resultado con:
      - Datos básicos
      - Estado
      - Alertas de negocio
      - Link a ficha del afiliado
    */
    afiliados.forEach(a => {
      const textoParentesco = a.numero_afiliado.endsWith("/00") ? "Titular" : (dicParentescos[a.parentesco_id] || "N/A");
      const alertaCud = obtenerAlertaCud(a.cud_documentos);
      const alerta = obtenerAlertaHijo(a.fechaNacimiento, textoParentesco, a.estudios);
      const alertaJubilado = obtenerAlertaJubilado(a.categoria_id?.nombre, a.fecha_ultimo_pago_cuota, a.fechaNacimiento);      
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
        ${alertaCud ? `<div class="alerta-cud">${alertaCud}</div>` : ""}
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
/*
  Maneja el alta de un afiliado:
  - Validaciones de negocio
  - Validaciones de duplicados
  - Subida de adjuntos
  - Inserción en Supabase
*/
f.addEventListener("submit", async e => {
  e.preventDefault();

  const btn = f.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
       /*
      Obtiene todos los datos del formulario
      como objeto plano
    */
    const data = Object.fromEntries(new FormData(f).entries());

        // 🔹 VALIDACIÓN DISCAPACIDAD
    if (discapacidadCheckbox.checked) {
      if (!data.cud_emision) {
        Swal.fire(
          "Requerido",
          "Debe indicar la fecha de emisión del CUD",
          "warning"
        );
        btn.disabled = false;
        btn.textContent = "Guardar";
        return;
      }

      if (
        nivelDiscapacidadSelect.value === "Temporal" &&
        cudPermanenteCheckbox.checked
      ) {
        Swal.fire(
          "Datos inválidos",
          "Una discapacidad temporal no puede ser sin vencimiento",
          "error"
        );
        btn.disabled = false;
        btn.textContent = "Guardar";
        return;
      }

      if (!cudPermanenteCheckbox.checked && !data.cud_vencimiento) {
        Swal.fire(
          "Requerido",
          "Debe indicar la fecha de vencimiento del CUD",
          "warning"
        );
        btn.disabled = false;
        btn.textContent = "Guardar";
        return;
      }
}

        /*
      Validación de campos obligatorios
    */
      if (
        !data.nombre ||
        !data.apellido ||
        !data.dni ||
        !data.cuil ||          
        !data.numero_afiliado ||
        !data.parentesco_id ||
        !data.sexo
      ) {
        Swal.fire(
          "Atención",
          "Completá todos los campos obligatorios",
          "warning"
        );
        btn.disabled = false;
        btn.textContent = "Guardar";
        return;
      }

      //validacion Formato CUIL
  const cuilRegex = /^\d{2}-\d{8}-\d{1}$/;

  if (!cuilRegex.test(data.cuil)) {
    Swal.fire(
      "CUIL inválido",
      "Formato esperado: 20-12345678-3",
      "error"
    );
    btn.disabled = false;
    btn.textContent = "Guardar";
    return;
}

        /*
      Validación de formato de número de afiliado
    */
    const match = data.numero_afiliado.match(/^[^-]+-([^/]+)\//);
    if (!match) { Swal.fire("Formato incorrecto", "Formato esperado: 19-00639-4/00", "error"); btn.disabled = false; btn.textContent = "Guardar"; return; }

    /*
      Validación de duplicados por DNI y número de afiliado
    */
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

      //Validacion CUIL Duplicado
          const { data: cuilExistente } = await supabase
      .from("afiliados")
      .select("id")
      .eq("cuil", data.cuil);

    if (cuilExistente.length) {
      Swal.fire(
        "Error",
        "Ya existe un afiliado con ese CUIL",
        "error"
      );
      btn.disabled = false;
      btn.textContent = "Guardar";
      return;
    }

    /*
      Validaciones de reglas de negocio:
      - Menor bajo guarda
      - Hijos
      - Discapacidad
      - Plan Materno
    */
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

    const { data: nuevoAfiliado, error } = await supabase
    .from("afiliados")
    .insert({
    nombre: data.nombre,
    apellido: data.apellido,
    dni: data.dni,
    telefono: data.telefono || null,
    fechaNacimiento: fechaNacimientoInput.value || null,
    numero_afiliado: data.numero_afiliado,
    grupo_familiar_codigo: match[1],
    parentesco_id: data.parentesco_id,
    sexo: data.sexo,
    plan_id: data.plan_id || null,
    categoria_id: data.categoria_id || null,
    localidad_id: data.localidad_id || null,
    grupo_sanguineo_id: data.grupo_sanguineo_id || null,

    discapacidad: discapacidadCheckbox.checked,
    nivel_discapacidad: nivelDiscapacidadSelect.value || null,

    estudios: estudiosSelect.value || null,
    adjuntoEstudios,

    plan_materno_desde: data.plan_materno_desde || null,
    plan_materno_hasta: data.plan_materno_hasta || null,

    cbu_cvu: data.cbu_cvu || null,
    mail: data.mail?.trim().toLowerCase() || null,
    cuil: data.cuil,
    created_by: user.user.id,
}).select().maybeSingle();

if (error) {
  console.error("Error al insertar afiliado:", error);
  Swal.fire("Error", "No se pudo guardar el afiliado", "error");
  return;
}

  if (discapacidadCheckbox.checked && adjuntoDiscapacidad) {
  const { error: errorCUD } = await supabase
    .from("cud_documentos")
    .insert({
      afiliado_id: nuevoAfiliado.id,
      tipo: "Ver adjunto",
      archivo_url: adjuntoDiscapacidad,
      fecha_emision: data.cud_emision || null,
      fecha_vencimiento: cudPermanenteCheckbox.checked ? null : data.cud_vencimiento || null,
      sin_vencimiento: cudPermanenteCheckbox.checked,
      created_at: new Date().toISOString(),
    });
  if (errorCUD) throw errorCUD;
}
    
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