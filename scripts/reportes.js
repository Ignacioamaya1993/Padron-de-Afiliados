import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";

/* =====================
   INIT
===================== */
cargarHeader();

/* =====================
   ELEMENTOS
===================== */
const reporteCard = document.querySelector(".reporte-card");
const reporteResultado = document.getElementById("reporteResultado");
const reporteTitulo = document.getElementById("reporteTitulo");
const exportExcelBtn = document.getElementById("exportExcel");
const exportPdfBtn = document.getElementById("exportPdf");

/* =====================
   EVENTOS
===================== */

// Mostrar / ocultar reporte
reporteCard?.addEventListener("click", () => {
  const estaVisible = !reporteResultado.classList.contains("hidden");

  if (estaVisible) {
    // Replegar
    reporteResultado.classList.add("hidden");
  } else {
    // Mostrar
    reporteTitulo.textContent = "Listado de Afiliados";
    reporteResultado.classList.remove("hidden");
  }
});

// Exportar Excel
exportExcelBtn?.addEventListener("click", exportarAfiliadosExcel);
exportPdfBtn?.addEventListener("click", exportarAfiliadosPDF);

/* =====================
   EXPORTAR AFILIADOS A EXCEL
===================== */
async function exportarAfiliadosExcel() {
  try {
    const { data: afiliados, error } = await supabase
      .from("afiliados")
      .select("*")
      .order("apellido", { ascending: true });

    if (error) throw error;

    if (!afiliados || afiliados.length === 0) {
      Swal.fire("Sin datos", "No hay afiliados para exportar", "info");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(afiliados);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Afiliados");

    XLSX.writeFile(workbook, "afiliados.xlsx");

  } catch (err) {
    console.error("Error exportando afiliados:", err);
    Swal.fire("Error", "No se pudo exportar el archivo", "error");
  }
}

async function exportarAfiliadosPDF() {
  try {
    const { data: afiliados, error } = await supabase
      .from("afiliados")
      .select("*")
      .order("apellido", { ascending: true });

    if (error) throw error;

    if (!afiliados || afiliados.length === 0) {
      Swal.fire("Sin datos", "No hay afiliados para exportar", "info");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("landscape");

    // Título
    doc.setFontSize(16);
    doc.text("Listado de Afiliados", 14, 15);

    // Columnas que queremos mostrar
    const columnas = [
      "N° Afiliado",
      "Apellido",
      "Nombre",
      "DNI",
      "Telefono",
      "Grupo Familiar Real",
      "CBU/CVU",
      "Fecha de Nacimiento"
    ];

    // Filas
    const filas = afiliados.map(a => [
      a.numero_afiliado,
      a.apellido,
      a.nombre,
      a.dni,
      a.telefono,
      a.grupo_familiar_real,
      a.cbu_cvu,
      a.fechaNacimiento
    ? new Date(a.fechaNacimiento).toLocaleDateString("es-AR")
    : ""
    ]);

    // Tabla
    doc.autoTable({
      head: [columnas],
      body: filas,
      startY: 25,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 150, 243] }
    });

    // Descargar
    doc.save("afiliados.pdf");

  } catch (err) {
    console.error("Error exportando PDF:", err);
    Swal.fire("Error", "No se pudo exportar el PDF", "error");
  }
}

//Boton volver al padrón
document.getElementById("btnVolver").addEventListener("click", () => {
  window.location.href = "/pages/padron.html";
});