import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";

/* =====================
   INIT
===================== */
cargarHeader();

/* =====================
   CONSTANTES
===================== */
const PARENTESCO_HIJO_ID = "3f4b9de6-c920-44c4-8468-e32b74c1530b";

/* =====================
   ELEMENTOS
===================== */
const reporteCards = document.querySelectorAll(".reporte-card");
const reporteResultado = document.getElementById("reporteResultado");
const reporteTitulo = document.getElementById("reporteTitulo");
const exportExcelBtn = document.getElementById("exportExcel");
const exportPdfBtn = document.getElementById("exportPdf");
const buscarReporteInput = document.getElementById("buscarReporte");
const reporteCantidad = document.getElementById("reporteCantidad");

let datosReporteActual = [];
let tipoReporteActual = null;

/* =====================
   EVENTOS
===================== */
reporteCards.forEach(card => {
  card.addEventListener("click", async () => {
    const tipo = card.dataset.reporte;
    const boton = card.querySelector("button");

    const estaAbierto = reporteResultado.classList.contains("expanded");

    // Si está abierto el mismo → cerrar con animación
    if (tipoReporteActual === tipo && estaAbierto) {
      reporteResultado.classList.remove("expanded");
      reporteResultado.classList.add("collapsed");
      card.classList.remove("active");
      boton?.setAttribute("aria-expanded", "false");
      tipoReporteActual = null;
      return;
    }

    reporteCards.forEach(otraCard => {
      otraCard.classList.toggle("active", otraCard === card);
      otraCard.querySelector("button")?.setAttribute("aria-expanded", String(otraCard === card));
    });

    tipoReporteActual = tipo;
    datosReporteActual = [];
    if (buscarReporteInput) buscarReporteInput.value = "";
    renderizarTablaReporte("Generando el reporte...");

    if (tipo === "afiliados") await cargarAfiliados();
    if (tipo === "hijos-estudiantes") await cargarHijosSinCertificado();
    if (tipo === "discapacidad-sin-cud") await cargarDiscapacidadSinCud();
    if (tipo === "datos-faltantes") await cargarDatosFaltantes();
    if (tipo === "reintegros") await cargarReporteReintegros();
    if (tipo === "insulinodependientes") await cargarReporteInsulinodependientes();
    if (tipo === "cuota-social") await cargarReporteCuotaSocial();

    const mensajeVacio = ["reintegros", "insulinodependientes"].includes(tipo)
      ? "Completá los filtros y generá el reporte para ver los resultados."
      : "No hay registros para mostrar en este reporte.";
    renderizarTablaReporte(mensajeVacio);

    // Abrir con animación
    reporteResultado.classList.remove("collapsed");
    reporteResultado.classList.add("expanded");
  });
});

exportExcelBtn?.addEventListener("click", exportarExcel);
exportPdfBtn?.addEventListener("click", exportarPDF);

function renderizarTablaReporte(mensajeVacio = "No hay registros para mostrar en este reporte.") {
  const tabla = document.getElementById("tablaReporte");
  tabla.setAttribute("aria-label", reporteTitulo.textContent || "Resultados del reporte");
  const encabezado = tabla.tHead;
  const cuerpo = tabla.tBodies[0] || tabla.createTBody();
  encabezado.replaceChildren();
  cuerpo.replaceChildren();

  const columnas = datosReporteActual.length ? Object.keys(datosReporteActual[0]) : [];
  const datosFiltrados = obtenerDatosFiltrados();
  const consulta = normalizarTexto(buscarReporteInput?.value || "");

  if (reporteCantidad) {
    reporteCantidad.textContent = consulta
      ? `${datosFiltrados.length} de ${datosReporteActual.length} resultados`
      : `${datosReporteActual.length} resultados`;
  }
  const buscador = buscarReporteInput?.closest(".reporte-search");
  if (buscador) buscador.hidden = tipoReporteActual === "reintegros";

  if (!columnas.length) {
    const fila = cuerpo.insertRow();
    const celda = fila.insertCell();
    celda.colSpan = 1;
    celda.className = "report-empty";
    celda.textContent = mensajeVacio;
  } else {
    const filaEncabezado = encabezado.insertRow();
    columnas.forEach(columna => {
      const celda = document.createElement("th");
      celda.scope = "col";
      celda.textContent = etiquetaColumna(columna);
      celda.className = claseColumna(columna);
      filaEncabezado.appendChild(celda);
    });

    if (!datosFiltrados.length) {
      const fila = cuerpo.insertRow();
      const celda = fila.insertCell();
      celda.colSpan = columnas.length;
      celda.className = "report-empty";
      celda.textContent = datosReporteActual.length
        ? "No se encontraron coincidencias. Probá con otro nombre, DNI o número de afiliado."
        : mensajeVacio;
    } else {
      const fragmento = document.createDocumentFragment();
      datosFiltrados.forEach(registro => {
        const fila = document.createElement("tr");
        columnas.forEach(columna => {
          const celda = document.createElement("td");
          const valor = registro[columna];
          celda.textContent = valor == null ? "" : String(valor);
          celda.className = claseColumna(columna);
          fila.appendChild(celda);
        });
        fragmento.appendChild(fila);
      });
      cuerpo.appendChild(fragmento);
    }
  }

  const hayDatos = datosFiltrados.length > 0;
  if (exportExcelBtn) exportExcelBtn.disabled = !hayDatos;
  if (exportPdfBtn) exportPdfBtn.disabled = !hayDatos;
}

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();
}

function normalizarClaveColumna(clave) {
  return normalizarTexto(String(clave).replace(/([a-z0-9])([A-Z])/g, "$1 $2"))
    .replace(/_/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function etiquetaColumna(clave) {
  const claveNormalizada = normalizarClaveColumna(clave);
  const etiquetas = {
    "nombre": "Nombre",
    "nombre completo": "Nombre completo",
    "dni": "DNI",
    "n afiliado": "Número de afiliado",
    "numero afiliado": "Número de afiliado",
    "numero de afiliado": "Número de afiliado",
    "obra social": "Obra social",
    "fecha nacimiento": "Fecha de nacimiento",
    "edad": "Edad",
    "mail": "Correo electrónico",
    "telefono": "Teléfono",
    "cbu cvu": "CBU / CVU",
    "grupo sanguineo": "Grupo sanguíneo",
    "plan": "Plan",
    "parentesco": "Parentesco",
    "localidad": "Localidad",
    "categoria": "Categoría",
    "estudios": "Estudios",
    "certificado": "Certificado de estudios",
    "fechacargaestudio": "Fecha de carga de estudios",
    "fecha carga estudio": "Fecha de carga de estudios",
    "discapacidad": "Discapacidad",
    "nivel discapacidad": "Nivel de discapacidad",
    "cud": "CUD",
    "seccion": "Módulo o prestación",
    "detalle": "Observación",
    "fecha reintegro": "Fecha de reintegro",
    "monto": "Monto reintegrado",
    "estado": "Estado",
    "fecha carga": "Fecha de carga",
    "fecha inicio": "Fecha de inicio",
    "fecha vencimiento": "Fecha de vencimiento",
    "fecha entrega": "Fecha de entrega",
    "latas entregadas": "Latas entregadas",
    "proxima carga": "Próxima carga",
    "observaciones": "Observaciones",
    "tipo medicamento": "Tipo de medicamento",
    "ultimo pago": "Último pago",
    "dias desde pago": "Días desde el pago"
  };

  return etiquetas[claveNormalizada] || clave
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, letra => letra.toLocaleUpperCase("es-AR"));
}

function claseColumna(clave) {
  const claveNormalizada = normalizarClaveColumna(clave);
  if (["nombre", "nombre completo"].includes(claveNormalizada)) return "report-cell-name";
  if (claveNormalizada === "dni") return "report-cell-dni";
  if (claveNormalizada === "cud") return "report-cell-cud";
  if (["n afiliado", "numero afiliado", "numero de afiliado"].includes(claveNormalizada)) {
    return "report-cell-affiliate";
  }
  return "";
}

function obtenerDatosFiltrados() {
  const consulta = normalizarTexto(buscarReporteInput?.value || "");
  if (!consulta) return datosReporteActual;

  const columnasBuscables = new Set([
    "nombre",
    "nombre completo",
    "dni",
    "n afiliado",
    "numero afiliado",
    "numero de afiliado"
  ]);

  const terminos = consulta.split(/\s+/).filter(Boolean);
  return datosReporteActual.filter(registro =>
    Object.entries(registro).some(([clave, valor]) => {
      const claveNormalizada = normalizarClaveColumna(clave);
      if (!columnasBuscables.has(claveNormalizada)) return false;

      const valorNormalizado = normalizarTexto(valor);
      if (["nombre", "nombre completo"].includes(claveNormalizada)) {
        return terminos.every(termino => valorNormalizado.includes(termino));
      }
      return valorNormalizado.includes(consulta);
    })
  );
}

buscarReporteInput?.addEventListener("input", () => renderizarTablaReporte());

/* =====================
   UTILIDADES
===================== */
function formatearFechaAR(fecha) {
  if (!fecha) return "";

  if (fecha.includes("T")) return fecha.split("T")[0].split("-").reverse().join("/");
  return fecha.split("-").reverse().join("/");
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);

  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();

  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad;
}

function escaparHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

function obtenerRangoFechas() {
  const hoy = new Date();

  const fechaMax = new Date(hoy.getFullYear() - 21, hoy.getMonth(), hoy.getDate());
  const fechaMin = new Date(hoy.getFullYear() - 26, hoy.getMonth(), hoy.getDate() + 1);

  return {
    fechaMin: fechaMin.toISOString().split("T")[0],
    fechaMax: fechaMax.toISOString().split("T")[0]
  };
}

/* =====================
   REPORTE 1: AFILIADOS
===================== */
async function cargarAfiliados() {
  try {
    const { data, error } = await supabase
      .from("afiliados")
      .select(`
        nombre_completo,
        dni,
        numero_afiliado,
        afiliado_obra_social,
        fechaNacimiento,
        mail,
        telefono,
        cbu_cvu,
        grupo_sanguineo:grupo_sanguineo_id (nombre),
        plan:plan_id (nombre),
        parentesco:parentesco_id (nombre),
        localidad:localidad_id (nombre),
        categoria:categoria_id (nombre)
      `)
      .order("nombre_completo", { ascending: true });

    if (error) throw error;

    datosReporteActual = data.map(a => ({
      "Nombre completo": a.nombre_completo,
      "DNI": a.dni,
      "N° Afiliado": a.numero_afiliado,
      "Obra Social": a.afiliado_obra_social ? "Sí" : "No",
      "Fecha Nacimiento": a.fechaNacimiento
        ? new Date(a.fechaNacimiento).toLocaleDateString("es-AR")
        : "",
      "Edad": calcularEdad(a.fechaNacimiento),
      "Mail": a.mail || "",
      "Teléfono": a.telefono || "",
      "CBU / CVU": a.cbu_cvu || "",
      "Grupo sanguíneo": a.grupo_sanguineo?.nombre || "",
      "Plan": a.plan?.nombre || "",
      "Parentesco": a.parentesco?.nombre || "",
      "Localidad": a.localidad?.nombre || "",
      "Categoría": a.categoria?.nombre || ""
    }));

    reporteTitulo.textContent = "Listado de Afiliados";
    document.getElementById("resumenReporte").innerHTML = "";

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudieron cargar los afiliados", "error");
  }
}

/* =====================
   REPORTE 2: HIJOS 21-26
===================== */
async function cargarHijosSinCertificado() {
  try {
    const { fechaMin, fechaMax } = obtenerRangoFechas();

    const { data, error } = await supabase
      .from("afiliados")
      .select(`
        nombre_completo,
        dni,
        numero_afiliado,
        fechaNacimiento,
        estudios,
        adjuntoEstudios,
        fechacargaestudio,
        parentesco:parentesco_id (nombre)
      `)
      .eq("parentesco_id", PARENTESCO_HIJO_ID)
      .eq("activo", true)
      .gte("fechaNacimiento", fechaMin)
      .lte("fechaNacimiento", fechaMax);

    if (error) throw error;

    datosReporteActual = data.map(a => ({
      nombre_completo: a.nombre_completo,
      dni: a.dni,
      numero_afiliado: a.numero_afiliado,
      parentesco: a.parentesco?.nombre || "Hijo",
      fechaNacimiento: new Date(a.fechaNacimiento).toLocaleDateString("es-AR"),
      edad: calcularEdad(a.fechaNacimiento),
      estudios: a.estudios ? "Sí" : "No",
      certificado: a.adjuntoEstudios ? "PRESENTADO" : "NO PRESENTADO",
      fechacargaestudio: a.fechacargaestudio
        ? new Date(a.fechacargaestudio).toLocaleDateString("es-AR")
        : "-"
    }));

    reporteTitulo.textContent = "Hijos (21-26)";
    document.getElementById("resumenReporte").innerHTML = "";

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo generar el reporte", "error");
  }
}

/* =====================
   REPORTE 3: DISCAPACIDAD
===================== */
async function cargarDiscapacidadSinCud() {
  try {
    const { data: afiliados, error } = await supabase
      .from("afiliados")
      .select(`
        id,
        nombre_completo,
        dni,
        numero_afiliado,
        fechaNacimiento,
        discapacidad,
        nivel_discapacidad,
        mail,
        telefono
      `)
      .eq("discapacidad", true)
      .eq("activo", true);

    if (error) throw error;

    const { data: cudDocs } = await supabase
      .from("cud_documentos")
      .select("afiliado_id, archivo_url");

    const mapa = {};
    cudDocs.forEach(doc => {
      if (!mapa[doc.afiliado_id]) mapa[doc.afiliado_id] = [];
      mapa[doc.afiliado_id].push(doc.archivo_url);
    });

    const sinCud = afiliados.filter(a => !mapa[a.id] || !mapa[a.id].some(url => url && url !== ""));

    datosReporteActual = sinCud.map(a => ({
      nombre_completo: a.nombre_completo,
      dni: a.dni,
      numero_afiliado: a.numero_afiliado,
      fechaNacimiento: new Date(a.fechaNacimiento).toLocaleDateString("es-AR"),
      edad: calcularEdad(a.fechaNacimiento),
      discapacidad: "Sí",
      nivel_discapacidad: a.nivel_discapacidad,
      mail: a.mail || "",
      telefono: a.telefono || "",
      cud: "NO PRESENTADO"
    }));

    reporteTitulo.textContent = "Discapacidad sin CUD";
    document.getElementById("resumenReporte").innerHTML = "";

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo generar el reporte", "error");
  }
}

/* =====================
   REPORTE 4: DATOS FALTANTES
===================== */
async function cargarDatosFaltantes() {
  try {
    const { data, error } = await supabase
      .from("afiliados")
      .select(`
        nombre_completo,
        dni,
        numero_afiliado,
        fechaNacimiento,
        mail,
        telefono,
        cbu_cvu,
        grupo_sanguineo:grupo_sanguineo_id (nombre)
      `)
        .eq("activo", true);


    if (error) throw error;

    let sinMail = 0, sinTel = 0, sinCbu = 0, sinGrupo = 0;

    const filtrados = data.filter(a => {
      const m = !a.mail;
      const t = !a.telefono;
      const c = !a.cbu_cvu;
      const g = !a.grupo_sanguineo;
      if (m) sinMail++; if (t) sinTel++; if (c) sinCbu++; if (g) sinGrupo++;
      return m || t || c || g;
    });

    datosReporteActual = filtrados.map(a => ({
      nombre_completo: a.nombre_completo,
      dni: a.dni,
      numero_afiliado: a.numero_afiliado,
      fechaNacimiento: new Date(a.fechaNacimiento).toLocaleDateString("es-AR"),
      edad: calcularEdad(a.fechaNacimiento),
      mail: a.mail || "NO CARGADO",
      telefono: a.telefono || "NO CARGADO",
      cbu_cvu: a.cbu_cvu || "NO CARGADO",
      grupo_sanguineo: a.grupo_sanguineo?.nombre || "NO CARGADO"
    }));

    reporteTitulo.textContent = "Afiliados con Datos Faltantes";
    document.getElementById("resumenReporte").innerHTML = `
      <div class="report-summary">
        Sin mail: ${sinMail} |
        Sin teléfono: ${sinTel} |
        Sin CBU/CVU: ${sinCbu} |
        Sin grupo sanguíneo: ${sinGrupo}
      </div>
    `;

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo generar el reporte", "error");
  }
}

/* =====================
   REPORTE 5: REINTEGROS
===================== */
async function cargarReporteReintegros() {
  try {
    reporteTitulo.textContent = "Reporte de Reintegros";

    const resumen = document.getElementById("resumenReporte");
    resumen.innerHTML = `
      <div class="filtro-reintegros">
        <div class="fila-filtros">
          <div>
            <label for="dniAfiliado">DNI Afiliado</label>
            <input type="number" id="dniAfiliado" placeholder="Ingrese DNI">
          </div>
          <div>
            <label for="nombreAfiliado">Nombre</label>
            <input type="text" id="nombreAfiliado" disabled>
          </div>
          <div>
            <label for="fechaDesde">Desde</label>
            <input type="date" id="fechaDesde">
          </div>
          <div>
            <label for="fechaHasta">Hasta</label>
            <input type="date" id="fechaHasta">
          </div>
          <div>
            <button id="btnGenerarReintegro" class="btn-nuevo">
              Generar
            </button>
          </div>
        </div>
        <hr class="report-divider">
      </div>

      <!-- Contenedor donde se mostrarán los resultados -->
      <div id="resultadosReintegros"></div>
    `;

    const dniInput = document.getElementById("dniAfiliado");
    const nombreInput = document.getElementById("nombreAfiliado");
    const btnGenerar = document.getElementById("btnGenerarReintegro");
    const resultadosContenedor = document.getElementById("resultadosReintegros");

    datosReporteActual = [];
    let afiliadoActual = null;

    // Evitar listeners duplicados
    dniInput.replaceWith(dniInput.cloneNode(true));
    btnGenerar.replaceWith(btnGenerar.cloneNode(true));

    const dniInputNuevo = document.getElementById("dniAfiliado");
    const btnGenerarNuevo = document.getElementById("btnGenerarReintegro");

    // Listener input DNI
    dniInputNuevo.addEventListener("input", async () => {
      const dni = dniInputNuevo.value.trim();
      afiliadoActual = null;
      nombreInput.value = "";
      resultadosContenedor.innerHTML = "";

      if (dni.length < 7) return;

      const { data, error } = await supabase
        .from("afiliados")
        .select("id, nombre_completo")
        .eq("dni", dni)
        .maybeSingle();

      if (error) return console.error(error);

      if (!data) nombreInput.value = "No encontrado";
      else {
        nombreInput.value = data.nombre_completo;
        afiliadoActual = data;
      }
    });

    // Listener botón Generar
    btnGenerarNuevo.addEventListener("click", async () => {
      if (!afiliadoActual) return Swal.fire("Error", "Debe ingresar un afiliado válido", "error");

      const desde = document.getElementById("fechaDesde").value;
      const hasta = document.getElementById("fechaHasta").value;

      if (!desde || !hasta) return Swal.fire("Error", "Debe seleccionar rango de fechas", "error");

      const desdeISO = `${desde}T00:00:00`;
      const hastaISO = `${hasta}T23:59:59`;

      // Cambiar texto del botón
      btnGenerarNuevo.textContent = "Generando...";
      btnGenerarNuevo.disabled = true;
      resultadosContenedor.innerHTML = "";

      const tablas = [
        { nombre: "Medicamentos", tabla: "medicamentos", detalle: "observaciones", fecha: "fecha_reintegro" },
        { nombre: "Derivaciones", tabla: "derivaciones", detalle: "observaciones", fecha: "fecha_reintegro" },
        { nombre: "Atención Domiciliaria", tabla: "atencion_domiciliaria", detalle: "observacion", fecha: "fecha_reintegro" },
        { nombre: "Expediente Discapacidad", tabla: "expediente_discapacidad", detalle: "observacion", fecha: "fecha_reintegro" },
        { nombre: "Internaciones", tabla: "internaciones", detalle: "observaciones", fecha: "fecha_reintegro" },
        { nombre: "Odontología", tabla: "odontologia", detalle: "observacion", fecha: "fecha_reintegro" },
        { nombre: "Oxigenoterapia", tabla: "oxigenoterapia", detalle: "observacion", fecha: "fecha_reintegro" },
        { nombre: "Prácticas", tabla: "practicas", detalle: "observacion", fecha: "fecha_reintegro" },
        { nombre: "Prácticas Reintegro", tabla: "practicas_reintegro", detalle: "observacion", fecha: "fecha_reintegro" },
        { nombre: "Traslado Ambulancia", tabla: "traslado_ambulancia", detalle: "observacion", fecha: "fecha_reintegro" }
      ];

      try {
        // 🔹 Consultas en paralelo
        const resultadosTablas = await Promise.all(tablas.map(async t => {
          try {
            const { data, error } = await supabase
              .from(t.tabla)
              .select(`reintegro, ${t.fecha}, ${t.detalle || "null"}`)
              .eq("afiliado_id", afiliadoActual.id)
              .not("reintegro", "is", null)
              .or(`${t.fecha}.is.null,and(${t.fecha}.gte.${desdeISO},${t.fecha}.lte.${hastaISO})`);

            if (error) {
              console.error(`Error ${t.nombre}:`, error);
              return [];
            }

            return data.map(r => ({
              seccion: t.nombre,
              detalle: t.detalle ? r[t.detalle] || "" : "",
              fecha_reintegro: r[t.fecha] ? formatearFechaAR(r[t.fecha]) : "Sin fecha",
              monto: Number(r.reintegro) || 0
            }));
          } catch (e) {
            console.error(e);
            return [];
          }
        }));

        datosReporteActual = resultadosTablas.flat();
        const totalReintegro = datosReporteActual.reduce((acc, r) => acc + r.monto, 0);

        // Mostrar resultados
        resultadosContenedor.innerHTML = `
          <div class="report-summary">
            Afiliado: ${escaparHTML(afiliadoActual.nombre_completo)}<br>
            Periodo: ${formatearFechaAR(desde)} al ${formatearFechaAR(hasta)}<br><br>
            Total Reintegro: $${totalReintegro.toLocaleString("es-AR")}
          </div>
        `;
        renderizarTablaReporte("No se encontraron reintegros para el período indicado.");

      } catch (err) {
        console.error(err);
        Swal.fire("Error", "No se pudo generar el reporte", "error");
      } finally {
        // Volver botón a estado original
        btnGenerarNuevo.textContent = "Generar";
        btnGenerarNuevo.disabled = false;
      }
    });

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo cargar el reporte", "error");
  }
}

/* =====================
   REPORTE 6: INSULINODEPENDIENTES
===================== */
async function cargarReporteInsulinodependientes() {
  try {
    reporteTitulo.textContent = "Reporte de Insulinodependientes";

    const resumen = document.getElementById("resumenReporte");

    resumen.innerHTML = `
      <div class="filtro-reintegros">
        <div class="fila-filtros">
          <div>
            <label for="fechaDesdeInsulina">Desde</label>
            <input type="date" id="fechaDesdeInsulina">
          </div>
          <div>
            <label for="fechaHastaInsulina">Hasta</label>
            <input type="date" id="fechaHastaInsulina">
          </div>
          <div>
            <button id="btnGenerarInsulina" class="btn-nuevo">
              Generar
            </button>
          </div>
        </div>
        <hr class="report-divider">
      </div>

      <div id="resultadoReporte6"></div>
    `;

    datosReporteActual = [];

    const btnGenerar = document.getElementById("btnGenerarInsulina");
    const resultadoDiv = document.getElementById("resultadoReporte6");

    btnGenerar.addEventListener("click", async () => {

      const desde = document.getElementById("fechaDesdeInsulina").value;
      const hasta = document.getElementById("fechaHastaInsulina").value;

      if (!desde || !hasta) {
        return Swal.fire("Error", "Debe seleccionar rango de fechas", "error");
      }

      btnGenerar.textContent = "Generando...";
      btnGenerar.disabled = true;

      resultadoDiv.innerHTML = "";

      try {
        const { data, error } = await supabase
          .from("medicamentos")
          .select(`
            fecha_carga,
            fecha_inicio,
            fecha_vencimiento,
            fecha_entrega,
            proxima_carga,
            latas_entregadas,
            observaciones,
            estado,
            reintegro,
            fecha_reintegro,
            afiliados (
              nombre_completo,
              dni,
              numero_afiliado
            ),
            tipo_medicamentos (
              nombre
            )
          `)
          .gte("fecha_inicio", desde)
          .lte("fecha_inicio", hasta)
          .ilike("estado", "%insulin%")
          .order("fecha_inicio", { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
          datosReporteActual = [];
          renderizarTablaReporte("No se encontraron registros de insulinodependientes en el período indicado.");
          Swal.fire("Sin resultados", "No se encontraron registros", "info");
          return;
        }

        datosReporteActual = data.map(item => ({
          "Nombre completo": item.afiliados?.nombre_completo || "",
          "DNI": item.afiliados?.dni || "",
          "Numero de afiliado": item.afiliados?.numero_afiliado || "",
          "Estado": item.estado || "",
          "Fecha carga": formatearFechaAR(item.fecha_carga),
          "Fecha Inicio": formatearFechaAR(item.fecha_inicio),
          "Fecha vencimiento": formatearFechaAR(item.fecha_vencimiento),
          "Fecha entrega": formatearFechaAR(item.fecha_entrega),
          "Latas entregadas": item.latas_entregadas || 0,
          "Proxima carga": formatearFechaAR(item.proxima_carga),
          "Observaciones": item.observaciones || "",
          "Tipo medicamento": item.tipo_medicamentos?.nombre || "",
          "Reintegro": item.reintegro ? Number(item.reintegro) : 0,
          "Fecha reintegro": formatearFechaAR(item.fecha_reintegro)
        }));

        resultadoDiv.innerHTML = `
          <div class="report-summary">
            Periodo: ${formatearFechaAR(desde)} al ${formatearFechaAR(hasta)} <br>
            Total registros: ${datosReporteActual.length}
          </div>
        `;
        renderizarTablaReporte("No se encontraron registros de insulinodependientes en el período indicado.");

      } catch (err) {
        console.error(err);
        Swal.fire("Error", "No se pudo generar el reporte", "error");
      } finally {
        btnGenerar.textContent = "Generar";
        btnGenerar.disabled = false;
      }
    });

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo cargar el reporte", "error");
  }
}

/* =====================
   REPORTE 7: CUOTA SOCIAL JUBILADOS
===================== */

async function cargarReporteCuotaSocial() {
  try {

    reporteTitulo.textContent = "Cuota Social - Jubilados";

    const DIAS_VENCIMIENTO = 40;
    const hoy = new Date();

    const { data, error } = await supabase
      .from("afiliados")
      .select(`
        nombre_completo,
        dni,
        numero_afiliado,
        fechaNacimiento,
        fecha_ultimo_pago_cuota,
        categoria:categoria_id (nombre)
      `)
      .eq("activo", true);

    if (error) throw error;

    // 🔹 Filtrar solo jubilados titulares menores de 80
    const jubiladosCuota = data.filter(a => {

      const categoria = a.categoria?.nombre || "";

      const esJubilado =
        categoria === "Jubilado ANSES" ||
        categoria === "Pensionado ANSES reparto";

      if (!esJubilado) return false;

      if (!a.numero_afiliado?.endsWith("/00")) return false;

      if (!a.fechaNacimiento) return false;

      const edad = calcularEdad(a.fechaNacimiento);
      if (edad >= 80) return false;

      return true;
    });

    let vencidos = 0;
    let alDia = 0;
    let sinFecha = 0;

    datosReporteActual = jubiladosCuota.map(a => {

      let estado = "";
      let diasDesdePago = null;

      if (!a.fecha_ultimo_pago_cuota) {
        estado = "SIN FECHA";
        sinFecha++;
      } else {

        const fechaPago = new Date(a.fecha_ultimo_pago_cuota);
        diasDesdePago = Math.floor(
          (hoy - fechaPago) / (1000 * 60 * 60 * 24)
        );

        if (diasDesdePago > DIAS_VENCIMIENTO) {
          estado = "VENCIDO";
          vencidos++;
        } else {
          estado = "AL DÍA";
          alDia++;
        }
      }

      return {
        "Nombre": a.nombre_completo,
        "DNI": a.dni,
        "N° Afiliado": a.numero_afiliado,
        "Edad": calcularEdad(a.fechaNacimiento),
        "Último Pago": formatearFechaAR(a.fecha_ultimo_pago_cuota),
        "Días desde pago": diasDesdePago ?? "-",
        "Estado": estado
      };
    });

    document.getElementById("resumenReporte").innerHTML = `
      <div class="report-summary">
        Total con cuota habilitada: ${jubiladosCuota.length} |
        Al día: ${alDia} |
        Vencidos: ${vencidos} |
        Sin fecha: ${sinFecha}
      </div>
    `;

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo generar el reporte", "error");
  }
}

/* =====================
   EXPORTACIONES
===================== */
function exportarExcel() {
  const registros = obtenerRegistrosParaExportar();
  if (!registros.length) return Swal.fire("Sin datos", "No hay datos para exportar", "info");

  const ws = XLSX.utils.json_to_sheet(registros);
  const wb = XLSX.utils.book_new();

  const nombreHoja = reporteTitulo.textContent.substring(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);

  const nombreArchivo = reporteTitulo.textContent.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}

function exportarPDF() {
  const registros = obtenerRegistrosParaExportar();
  if (!registros.length) return Swal.fire("Sin datos", "No hay datos para exportar", "info");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape");

  doc.setFontSize(14);
  doc.text(reporteTitulo.textContent, 14, 15);

  const columnas = Object.keys(registros[0]);
  const filas = registros.map(obj => Object.values(obj));

  doc.autoTable({
    head: [columnas],
    body: filas,
    startY: 25,
    styles: { fontSize: 8 }
  });

  const nombreArchivo = reporteTitulo.textContent.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
  doc.save(`${nombreArchivo}.pdf`);
}

function obtenerRegistrosParaExportar() {
  return obtenerDatosFiltrados().map(registro =>
    Object.fromEntries(Object.entries(registro).map(([clave, valor]) => [etiquetaColumna(clave), valor ?? ""]))
  );
}

/* =====================
   VOLVER
===================== */
document.getElementById("btnVolver").addEventListener("click", () => {
  window.location.href = "/pages/padron.html";
});
