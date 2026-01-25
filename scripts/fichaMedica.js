import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js"; // Si usás Cloudinary

const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) throw new Error("ID de afiliado faltante");

let afiliado = null;
let user = null;

/* =====================
   AUTENTICACIÓN
===================== */
async function verificarUsuario() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Si no hay usuario logueado, redirigir al login
    window.location.href = "/pages/login.html";
    return;
  }

  // Mostrar email logueado en header
  const bienvenidoSpan = document.getElementById("userEmail");
  if (bienvenidoSpan) bienvenidoSpan.textContent = user.email;
}

// Cerrar sesión
async function cerrarSesion() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    Swal.fire("Error", error.message, "error");
    return;
  }
  window.location.href = "/pages/login.html";
}

/* ===================== Cargar Afiliado ===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase.from("afiliados").select("*").eq("id", afiliadoId).single();
  if (error || !data) return console.error(error);
  afiliado = data;
  document.getElementById("nombreAfiliado").textContent = `${afiliado.nombre} ${afiliado.apellido}`;
}

/* ===================== Funciones de carga de datos ===================== */
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

async function cargarAdicciones() {
  const { data } = await supabase.from("adicciones").select("*").eq("afiliado_id", afiliadoId);
  const container = document.getElementById("listaAdicciones");
  container.innerHTML = "";
  data.forEach(a => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<strong>${a.adiccion}</strong> - ${a.frecuencia || ""}<br>${a.observaciones || ""}`;
    container.appendChild(card);
  });
}

/* ===================== Tabs ===================== */
document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

/* ===================== Botón Volver ===================== */
document.getElementById("btnVolver").onclick = () => {
  window.location.href = `./afiliado.html?id=${afiliadoId}`;
};

/* ===================== Función genérica para mostrar/ocultar formularios ===================== */
function setupNuevoCancelar(nuevoBtnId, cancelarBtnId, formId, callbackGuardar) {
  const btnNuevo = document.getElementById(nuevoBtnId);
  const btnCancelar = document.getElementById(cancelarBtnId);
  const form = document.getElementById(formId);

  btnNuevo.onclick = () => {
    form.classList.remove("hidden");
    btnNuevo.style.display = "none";
  };

  btnCancelar.onclick = () => {
    form.classList.add("hidden");
    btnNuevo.style.display = "inline-block";
    form.reset?.();
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    await callbackGuardar(new FormData(form));
    form.reset();
    form.classList.add("hidden");
    btnNuevo.style.display = "inline-block";
  });
}

/* ===================== Guardado en Supabase ===================== */
async function guardarEnfermedad(formData) {
  const { error } = await supabase.from("enfermedades_cronicas").insert([{
    afiliado_id: afiliadoId,
    enfermedad: formData.get("enfermedad"),
    fecha_diagnostico: formData.get("fecha_diagnostico"),
    observaciones: formData.get("observaciones"),
    created_by: user.id,
    updated_by: user.id
  }]);
  if (error) return Swal.fire("Error", error.message, "error");
  Swal.fire("Agregado", "Enfermedad registrada", "success");
  cargarEnfermedades();
}

async function guardarMedicamento(formData) {
  const { error } = await supabase.from("medicamentos").insert([{
    afiliado_id: afiliadoId,
    medicamento: formData.get("medicamento"),
    dosis: formData.get("dosis"),
    proximo_entrega: formData.get("proximo_entrega"),
    observaciones: formData.get("observaciones"),
    created_by: user.id,
    updated_by: user.id
  }]);
  if (error) return Swal.fire("Error", error.message, "error");
  Swal.fire("Agregado", "Medicamento registrado", "success");
  cargarMedicamentos();
}

async function guardarIncidencia(formData) {
  let adjuntoUrl = null;
  const file = formData.get("adjunto");
  if (file && file.size > 0) adjuntoUrl = await subirArchivoCloudinary(file);

  const { error } = await supabase.from("incidencias_salud").insert([{
    afiliado_id: afiliadoId,
    titulo: formData.get("titulo"),
    tipo: formData.get("tipo"),
    descripcion: formData.get("descripcion"),
    fecha: new Date().toISOString(),
    adjunto: adjuntoUrl,
    created_by: user.id,
    updated_by: user.id
  }]);
  if (error) return Swal.fire("Error", error.message, "error");
  Swal.fire("Agregado", "Incidencia registrada", "success");
  cargarIncidencias();
}

async function guardarAdiccion(formData) {
  const { error } = await supabase.from("adicciones").insert([{
    afiliado_id: afiliadoId,
    adiccion: formData.get("adiccion"),
    frecuencia: formData.get("frecuencia"),
    observaciones: formData.get("observaciones"),
    created_by: user.id,
    updated_by: user.id
  }]);
  if (error) return Swal.fire("Error", error.message, "error");
  Swal.fire("Agregado", "Adicción registrada", "success");
  cargarAdicciones();
}

/* ===================== Setup botones Nuevo/Cancelar ===================== */
setupNuevoCancelar("btnNuevoEnfermedad", "btnCancelarEnfermedad", "formEnfermedad", guardarEnfermedad);
setupNuevoCancelar("btnNuevoMedicamento", "btnCancelarMedicamento", "formMedicamento", guardarMedicamento);
setupNuevoCancelar("btnNuevoIncidencia", "btnCancelarIncidencia", "formIncidencia", guardarIncidencia);
setupNuevoCancelar("btnNuevoAdiccion", "btnCancelarAdiccion", "formAdiccion", guardarAdiccion);

/* ===================== INIT ===================== */
async function init() {
  await obtenerUsuario();
  await cargarAfiliado();
  await cargarEnfermedades();
  await cargarMedicamentos();
  await cargarIncidencias();
  await cargarAdicciones();
}

document.getElementById("logoutBtn").onclick = cerrarSesion;

verificarUsuario();
init();