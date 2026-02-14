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

let datosReporteActual = [];
let tipoReporteActual = null;

/* =====================
   EVENTOS
===================== */

reporteCards.forEach(card => {
  card.addEventListener("click", async () => {
    const tipo = card.dataset.reporte;

    const estaAbierto = reporteResultado.classList.contains("expanded");

    // Si está abierto el mismo → cerrar con animación
    if (tipoReporteActual === tipo && estaAbierto) {
      reporteResultado.classList.remove("expanded");
      reporteResultado.classList.add("collapsed");
      tipoReporteActual = null;
      return;
    }

    tipoReporteActual = tipo;

    if (tipo === "afiliados") await cargarAfiliados();
    if (tipo === "hijos-estudiantes") await cargarHijosSinCertificado();
    if (tipo === "discapacidad-sin-cud") await cargarDiscapacidadSinCud();
    if (tipo === "datos-faltantes") await cargarDatosFaltantes();
        if (tipo === "reintegros") await cargarReporteReintegros();

    // Abrir con animación
    reporteResultado.classList.remove("collapsed");
    reporteResultado.classList.add("expanded");
  });
});

exportExcelBtn?.addEventListener("click", exportarExcel);
exportPdfBtn?.addEventListener("click", exportarPDF);

/* =====================
   UTILIDADES
===================== */

function formatearFechaAR(fecha) {
  if (!fecha) return "";

  // Si viene como timestamp ISO
  if (fecha.includes("T")) {
    return fecha.split("T")[0].split("-").reverse().join("/");
  }

  // Si viene como date simple (YYYY-MM-DD)
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

function obtenerRangoFechas() {
  const hoy = new Date();

  const fechaMax = new Date(
    hoy.getFullYear() - 21,
    hoy.getMonth(),
    hoy.getDate()
  );

  const fechaMin = new Date(
    hoy.getFullYear() - 26,
    hoy.getMonth(),
    hoy.getDate() + 1
  );

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
      nombre_completo: a.nombre_completo,
      dni: a.dni,
      numero_afiliado: a.numero_afiliado,
      fechaNacimiento: a.fechaNacimiento
        ? new Date(a.fechaNacimiento).toLocaleDateString("es-AR")
        : "",
      edad: calcularEdad(a.fechaNacimiento),
      mail: a.mail || "",
      telefono: a.telefono || "",
      cbu_cvu: a.cbu_cvu || "",
      grupo_sanguineo: a.grupo_sanguineo?.nombre || "",
      plan: a.plan?.nombre || "",
      parentesco: a.parentesco?.nombre || "",
      localidad: a.localidad?.nombre || "",
      categoria: a.categoria?.nombre || ""
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
        parentesco:parentesco_id (nombre)
      `)
      .eq("parentesco_id", PARENTESCO_HIJO_ID)
      .gte("fechaNacimiento", fechaMin)
      .lte("fechaNacimiento", fechaMax);

    if (error) throw error;

    const filtrados = data.filter(a => {
      const tieneEstudios = a.estudios;
      const noTieneCertificado = !a.adjuntoEstudios;
      return tieneEstudios && noTieneCertificado;
    });

    datosReporteActual = filtrados.map(a => ({
      nombre_completo: a.nombre_completo,
      dni: a.dni,
      numero_afiliado: a.numero_afiliado,
      parentesco: a.parentesco?.nombre || "Hijo",
      fechaNacimiento: new Date(a.fechaNacimiento).toLocaleDateString("es-AR"),
      edad: calcularEdad(a.fechaNacimiento),
      estudios: "Sí",
      certificado: "NO PRESENTADO"
    }));

    reporteTitulo.textContent = "Hijos (21-26) sin certificado";
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
      .eq("discapacidad", true);

    if (error) throw error;

    const { data: cudDocs } = await supabase
      .from("cud_documentos")
      .select("afiliado_id, archivo_url");

    const mapa = {};
    cudDocs.forEach(doc => {
      if (!mapa[doc.afiliado_id]) mapa[doc.afiliado_id] = [];
      mapa[doc.afiliado_id].push(doc.archivo_url);
    });

    const sinCud = afiliados.filter(a => {
      const docs = mapa[a.id];
      if (!docs) return true;
      return !docs.some(url => url && url !== "");
    });

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
      `);

    if (error) throw error;

    let sinMail = 0, sinTel = 0, sinCbu = 0, sinGrupo = 0;

    const filtrados = data.filter(a => {
      const m = !a.mail;
      const t = !a.telefono;
      const c = !a.cbu_cvu;
      const g = !a.grupo_sanguineo;

      if (m) sinMail++;
      if (t) sinTel++;
      if (c) sinCbu++;
      if (g) sinGrupo++;

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
      <div style="margin-bottom:15px; font-weight:bold;">
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
            <label>DNI Afiliado</label><br>
            <input type="number" id="dniAfiliado" placeholder="Ingrese DNI">
          </div>
          <div>
            <label>Nombre</label><br>
            <input type="text" id="nombreAfiliado" disabled>
          </div>
          <div>
            <label>Desde</label><br>
            <input type="date" id="fechaDesde">
          </div>
          <div>
            <label>Hasta</label><br>
            <input type="date" id="fechaHasta">
          </div>
          <div>
            <button id="btnGenerarReintegro" class="btn-nuevo">
              Generar
            </button>
          </div>
        </div>
        <hr style="margin:20px 0;">
      </div>
    `;

    const dniInput = document.getElementById("dniAfiliado");
    const nombreInput = document.getElementById("nombreAfiliado");
    const btnGenerar = document.getElementById("btnGenerarReintegro");

    let afiliadoActual = null;
    datosReporteActual = [];

    // 🔹 Listener del input (SOLO UNA VEZ)
    dniInput.addEventListener("input", async () => {
      const dni = dniInput.value.trim();
      afiliadoActual = null;
      nombreInput.value = "";

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

    // 🔹 Listener del botón (SOLO UNA VEZ)
    btnGenerar.addEventListener("click", async () => {
      if (!afiliadoActual) return Swal.fire("Error", "Debe ingresar un afiliado válido", "error");

      const desde = document.getElementById("fechaDesde").value;
      const hasta = document.getElementById("fechaHasta").value;

      if (!desde || !hasta) return Swal.fire("Error", "Debe seleccionar rango de fechas", "error");

      const desdeISO = `${desde}T00:00:00`;
      const hastaISO = `${hasta}T23:59:59`;

  // ================= MEDICAMENTOS =================
  const { data: medicamentos, error: errorMed } = await supabase
    .from("medicamentos")
    .select(`
      reintegro,
      fecha_reintegro,
      fecha_carga,
      observaciones,
      afiliados(nombre_completo)
    `)
    .eq("afiliado_id", afiliadoActual.id)
    .not("reintegro", "is", null)
    .gte("fecha_reintegro", desdeISO)
    .lte("fecha_reintegro", hastaISO);

  if (errorMed) console.error("Error medicamentos:", errorMed);

// ================= DERIVACIONES =================
const { data: derivaciones, error: errorDer } = await supabase
  .from("derivaciones")
  .select(`
    reintegro,
    fecha_reintegro,
    fecha_inicio,
    afiliados(nombre_completo)
  `)
  .eq("afiliado_id", afiliadoActual.id)
  .not("reintegro", "is", null)
  .gte("fecha_reintegro", desdeISO)
  .lte("fecha_reintegro", hastaISO);

if (errorDer) console.error("Error derivaciones:", errorDer);

console.log("Derivaciones:", derivaciones); // 👈 ACÁ

  let totalMedicamentos = 0;
  let totalDerivaciones = 0;
  const listaFinal = [];

  medicamentos?.forEach(m => {
    const monto = Number(m.reintegro) || 0;
    totalMedicamentos += monto;

    listaFinal.push({
      seccion: "Medicamentos",
      afiliado: m.afiliados?.nombre_completo || "",
      fecha_reintegro: formatearFechaAR(m.fecha_reintegro),
      fecha_identificatoria: formatearFechaAR(m.fecha_carga),
      detalle: m.observaciones || "",
      monto
    });
  });

  derivaciones?.forEach(d => {
    const monto = Number(d.reintegro) || 0;
    totalDerivaciones += monto;

    listaFinal.push({
      seccion: "Derivaciones",
      afiliado: d.afiliados?.nombre_completo || "",
      fecha_reintegro: formatearFechaAR(d.fecha_reintegro),
      fecha_identificatoria: formatearFechaAR(d.fecha_inicio),
      monto
    });
  });

  const totalGeneral = totalMedicamentos + totalDerivaciones;

  datosReporteActual = listaFinal;

  document.getElementById("resumenReporte").innerHTML += `
    <div style="font-weight:bold; margin-bottom:15px;">
      Afiliado: ${afiliadoActual.nombre_completo}<br>
      Periodo: ${formatearFechaAR(desde)} al ${formatearFechaAR(hasta)}<br><br>
      Total Medicamentos: $${totalMedicamentos.toLocaleString("es-AR")}<br>
      Total Derivaciones: $${totalDerivaciones.toLocaleString("es-AR")}<br><br>
      <span style="font-size:18px;">
        TOTAL GENERAL: $${totalGeneral.toLocaleString("es-AR")}
      </span>
    </div>
  `;
});

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo generar el reporte", "error");
  }
}

/* =====================
   EXPORTACIONES
===================== */

function exportarExcel() {
  if (!datosReporteActual.length)
    return Swal.fire("Sin datos", "No hay datos para exportar", "info");

  const ws = XLSX.utils.json_to_sheet(datosReporteActual);
  const wb = XLSX.utils.book_new();

  const nombreHoja = reporteTitulo.textContent.substring(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);

  const nombreArchivo = reporteTitulo.textContent
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_");

  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}

function exportarPDF() {
  if (!datosReporteActual.length)
    return Swal.fire("Sin datos", "No hay datos para exportar", "info");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape");

  doc.setFontSize(14);
  doc.text(reporteTitulo.textContent, 14, 15);

  const columnas = Object.keys(datosReporteActual[0]);
  const filas = datosReporteActual.map(obj => Object.values(obj));

  doc.autoTable({
    head: [columnas],
    body: filas,
    startY: 25,
    styles: { fontSize: 8 }
  });

  const nombreArchivo = reporteTitulo.textContent
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_");

  doc.save(`${nombreArchivo}.pdf`);
}

/* =====================
   VOLVER
===================== */

document.getElementById("btnVolver").addEventListener("click", () => {
  window.location.href = "/pages/padron.html";
});