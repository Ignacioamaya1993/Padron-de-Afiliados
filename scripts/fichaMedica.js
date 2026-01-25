import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js"; // tu JS de Cloudinary

const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) throw new Error("ID de afiliado faltante");

let afiliado = null;
let user = null;

/* ===================== Obtener usuario logueado ===================== */
async function obtenerUsuario() {
  const { data: { user: u } } = await supabase.auth.getUser();
  if (!u) throw new Error("Usuario no logueado");
  user = u;
}

/* ===================== Cargar afiliado ===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase.from("afiliados").select("*").eq("id", afiliadoId).single();
  if (error || !data) return console.error(error);
  afiliado = data;
  document.getElementById("nombreAfiliado").textContent = `${afiliado.nombre} ${afiliado.apellido}`;
}

/* ===================== Cargar enfermedades ===================== */
async function cargarEnfermedades() {
  const { data } = await supabase.from("enfermedades_cronicas").select("*").eq("afiliado_id", afiliadoId);
  const container = document.getElementById("listaEnfermedades");
  container.innerHTML = "";
  data.forEach(e => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<strong>${e.enfermedad}</strong> - ${e.fecha_diagnostico}<br>${e.observaciones || ""}`;
    container.appendChild(card);
  });
}

/* ===================== Cargar medicamentos ===================== */
async function cargarMedicamentos() {
  const { data } = await supabase.from("medicamentos").select("*").eq("afiliado_id", afiliadoId);
  const container = document.getElementById("listaMedicamentos");
  container.innerHTML = "";
  data.forEach(m => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<strong>${m.medicamento}</strong> - ${m.dosis} - Próxima entrega: ${m.proximo_entrega || "-"}<br>${m.observaciones || ""}`;
    container.appendChild(card);
  });
}

/* ===================== Cargar incidencias ===================== */
async function cargarIncidencias() {
  const { data } = await supabase.from("incidencias_salud").select("*").eq("afiliado_id", afiliadoId);
  const container = document.getElementById("listaIncidencias");
  container.innerHTML = "";
  data.forEach(i => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<strong>${i.titulo}</strong> (${i.tipo}) - ${new Date(i.fecha).toLocaleString()}<br>${i.descripcion || ""}<br>${i.adjunto ? `<a href="${i.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
    container.appendChild(card);
  });
}

/* ================= Tabs ================= */
document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

/* ================= Botón volver ================= */
document.getElementById("btnVolver").onclick = () => window.history.back();

/* ================= Botones agregar ================= */
document.getElementById("btnAgregarEnfermedad").onclick = async () => {
  const { value: formValues } = await Swal.fire({
    title: "Agregar enfermedad",
    html: `
      <input id="swal-enfermedad" class="swal2-input" placeholder="Nombre enfermedad">
      <input id="swal-fecha" type="date" class="swal2-input">
      <textarea id="swal-observaciones" class="swal2-textarea" placeholder="Observaciones"></textarea>
    `,
    focusConfirm: false,
    preConfirm: () => ({
      enfermedad: document.getElementById("swal-enfermedad").value,
      fecha_diagnostico: document.getElementById("swal-fecha").value,
      observaciones: document.getElementById("swal-observaciones").value
    })
  });

  if (!formValues) return;
  const { error } = await supabase.from("enfermedades_cronicas").insert([{
    ...formValues,
    afiliado_id: afiliadoId,
    created_by: user.id,
    updated_by: user.id
  }]);
  if (error) return Swal.fire("Error", error.message, "error");
  Swal.fire("Agregado", "Enfermedad registrada", "success");
  cargarEnfermedades();
};

document.getElementById("btnAgregarMedicamento").onclick = async () => {
  const { value: formValues } = await Swal.fire({
    title: "Agregar medicamento",
    html: `
      <input id="swal-medicamento" class="swal2-input" placeholder="Nombre medicamento">
      <input id="swal-dosis" class="swal2-input" placeholder="Dosis">
      <input id="swal-proxima" type="date" class="swal2-input" placeholder="Próxima entrega">
      <textarea id="swal-observaciones" class="swal2-textarea" placeholder="Observaciones"></textarea>
    `,
    focusConfirm: false,
    preConfirm: () => ({
      medicamento: document.getElementById("swal-medicamento").value,
      dosis: document.getElementById("swal-dosis").value,
      proximo_entrega: document.getElementById("swal-proxima").value,
      observaciones: document.getElementById("swal-observaciones").value
    })
  });

  if (!formValues) return;
  const { error } = await supabase.from("medicamentos").insert([{
    ...formValues,
    afiliado_id: afiliadoId,
    created_by: user.id,
    updated_by: user.id
  }]);
  if (error) return Swal.fire("Error", error.message, "error");
  Swal.fire("Agregado", "Medicamento registrado", "success");
  cargarMedicamentos();
};

document.getElementById("btnAgregarIncidencia").onclick = async () => {
  const archivoInput = document.createElement("input");
  archivoInput.type = "file";

  const { value: formValues } = await Swal.fire({
    title: "Nueva incidencia",
    html: `
      <input id="swal-titulo" class="swal2-input" placeholder="Título">
      <input id="swal-tipo" class="swal2-input" placeholder="Tipo (p.ej. enfermedad, accidente)">
      <textarea id="swal-descripcion" class="swal2-textarea" placeholder="Descripción"></textarea>
      <button id="swal-btn-archivo" class="swal2-confirm">Adjuntar archivo</button>
    `,
    showCancelButton: true,
    focusConfirm: false,
    didOpen: () => {
      document.getElementById("swal-btn-archivo").onclick = () => archivoInput.click();
    },
    preConfirm: async () => {
      let adjuntoUrl = null;
      if (archivoInput.files.length > 0) {
        adjuntoUrl = await subirArchivoCloudinary(archivoInput.files[0]);
      }
      return {
        titulo: document.getElementById("swal-titulo").value,
        tipo: document.getElementById("swal-tipo").value,
        descripcion: document.getElementById("swal-descripcion").value,
        fecha: new Date().toISOString(),
        adjunto: adjuntoUrl
      };
    }
  });

  if (!formValues) return;
  const { error } = await supabase.from("incidencias_salud").insert([{
    ...formValues,
    afiliado_id: afiliadoId,
    created_by: user.id,
    updated_by: user.id
  }]);
  if (error) return Swal.fire("Error", error.message, "error");
  Swal.fire("Agregado", "Incidencia registrada", "success");
  cargarIncidencias();
};

/* ===================== Init ===================== */
async function init() {
  await obtenerUsuario();
  await cargarAfiliado();
  await cargarEnfermedades();
  await cargarMedicamentos();
  await cargarIncidencias();
}

init();
