import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js"; // Si usás Cloudinary

const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) throw new Error("ID de afiliado faltante");

let afiliado = null;
let user = null;

/* ===================== AUTENTICACIÓN ===================== */
async function verificarUsuario() {
  const { data: { user: u } } = await supabase.auth.getUser();
  if (!u) {
    window.location.href = "/pages/login.html";
    return;
  }
  user = u;
  const bienvenidoSpan = document.getElementById("userEmail");
  if (bienvenidoSpan) bienvenidoSpan.textContent = user.email;
}

async function cerrarSesion() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    Swal.fire("Error", error.message, "error");
    return;
  }
  window.location.href = "/pages/login.html";
}

/* ===================== CARGAR AFILIADO ===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase.from("afiliados").select("*").eq("id", afiliadoId).single();
  if (error || !data) return console.error(error);
  afiliado = data;
  document.getElementById("nombreAfiliado").textContent = `${afiliado.nombre} ${afiliado.apellido}`;
}

/* ===================== FUNCIONES DE CARGA ===================== */
async function cargarEnfermedades() {
  const { data } = await supabase.from("enfermedades_cronicas").select("*").eq("afiliado_id", afiliadoId);
  const container = document.getElementById("listaEnfermedades");
  container.innerHTML = "";
  data.forEach(e => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<strong>${e.enfermedad}</strong> - ${e.fecha_diagnostico || "-"}<br>
                      ${e.observaciones || ""}<br>
                      ${e.adjunto ? `<a href="${e.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
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
    card.innerHTML = `<strong>${m.medicamento}</strong> - ${m.dosis} - ${m.frecuencia || "-"}<br>
                      Inicio: ${m.fecha_inicio || "-"} | Fin: ${m.fecha_fin || "-"}<br>
                      Próxima entrega: ${m.proxima_entrega || "-"}<br>
                      ${m.observaciones || ""}<br>
                      ${m.adjunto ? `<a href="${m.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
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
    card.innerHTML = `<strong>${i.titulo}</strong> (${i.tipo}) - ${i.fecha ? new Date(i.fecha).toLocaleString() : "-"}<br>
                      ${i.descripcion || ""}<br>
                      ${i.adjunto ? `<a href="${i.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
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
    card.innerHTML = `<strong>${a.adiccion}</strong> - ${a.frecuencia || ""}<br>
                      ${a.observaciones || ""}<br>
                      ${a.adjunto ? `<a href="${a.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
    container.appendChild(card);
  });
}

/* ===================== TABS ===================== */
document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

/* ===================== BOTÓN VOLVER ===================== */
document.getElementById("btnVolver").onclick = () => {
  window.location.href = `./afiliado.html?id=${afiliadoId}`;
};

/* ===================== FUNCION GENÉRICA NUEVO/CANCELAR ===================== */
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

/* ===================== GUARDADO EN SUPABASE ===================== */
async function guardarRegistro(tabla, formData, campos = []) {
  if (!user) return Swal.fire("Error", "Usuario no definido", "error");

  let adjuntoUrl = null;
  const file = formData.get("adjunto");
  if (file && file.size > 0) adjuntoUrl = await subirArchivoCloudinary(file);

  const registro = { afiliado_id: afiliadoId, created_by: user.id, updated_by: user.id, adjunto: adjuntoUrl };
  campos.forEach(c => {
    registro[c] = formData.get(c) || null;
  });

  const { error } = await supabase.from(tabla).insert([registro]);
  if (error) return Swal.fire("Error", error.message, "error");
  Swal.fire("Agregado", "Registro guardado correctamente", "success");

  // Recargar la lista
  switch(tabla) {
    case "enfermedades_cronicas": cargarEnfermedades(); break;
    case "medicamentos": cargarMedicamentos(); break;
    case "incidencias_salud": cargarIncidencias(); break;
    case "adicciones": cargarAdicciones(); break;
  }
}

/* ===================== CONFIGURACIÓN NUEVO/CANCELAR ===================== */
setupNuevoCancelar("btnNuevoEnfermedad", "btnCancelarEnfermedad", "formEnfermedad", f => 
  guardarRegistro("enfermedades_cronicas", f, ["enfermedad","fecha_diagnostico","observaciones"]));

setupNuevoCancelar("btnNuevoMedicamento", "btnCancelarMedicamento", "formMedicamento", f => 
  guardarRegistro("medicamentos", f, ["medicamento","dosis","frecuencia","fecha_inicio","fecha_fin","ultima_entrega","proximo_entrega","observaciones"]));

setupNuevoCancelar("btnNuevoIncidencia", "btnCancelarIncidencia", "formIncidencia", f => 
  guardarRegistro("incidencias_salud", f, ["titulo","descripcion","tipo","fecha"]));

setupNuevoCancelar("btnNuevoAdiccion", "btnCancelarAdiccion", "formAdiccion", f => 
  guardarRegistro("adicciones", f, ["adiccion","frecuencia","observaciones"]));

/* ===================== INIT ===================== */
async function init() {
  await verificarUsuario();
  await cargarAfiliado();
  await cargarEnfermedades();
  await cargarMedicamentos();
  await cargarIncidencias();
  await cargarAdicciones();
}

document.getElementById("logoutBtn").onclick = cerrarSesion;

init();
