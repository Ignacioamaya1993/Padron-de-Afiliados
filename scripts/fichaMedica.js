import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

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

  const bienvenidoSpan = document.getElementById("userEmail");
  if (bienvenidoSpan) bienvenidoSpan.textContent = user.email;

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await supabase.auth.signOut();
      window.location.href = "/login.html";
    };
  }
}

/* ===================== Cargar afiliado ===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase.from("afiliados").select("*").eq("id", afiliadoId).single();
  if (error || !data) return console.error(error);
  afiliado = data;
  document.getElementById("nombreAfiliado").textContent = `${afiliado.nombre} ${afiliado.apellido}`;
}

/* ===================== Cargar registros ===================== */
async function cargarRegistros(tabla, containerId, mostrar) {
  const { data } = await supabase.from(tabla).select("*").eq("afiliado_id", afiliadoId);
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = mostrar(item);
    container.appendChild(card);
  });
}

/* ===================== Cargar todo ===================== */
async function cargarTodo() {
  await cargarRegistros("enfermedades_cronicas", "listaEnfermedades",
    e => `<strong>${e.enfermedad}</strong> - ${e.fecha_diagnostico}<br>${e.observaciones || ""}${e.adjunto ? `<br><a href="${e.adjunto}" target="_blank">Ver adjunto</a>` : ""}`
  );
  await cargarRegistros("medicamentos", "listaMedicamentos",
    m => `<strong>${m.medicamento}</strong> - ${m.dosis} - Próxima entrega: ${m.proximo_entrega || "-"}<br>${m.observaciones || ""}${m.adjunto ? `<br><a href="${m.adjunto}" target="_blank">Ver adjunto</a>` : ""}`
  );
  await cargarRegistros("incidencias_salud", "listaIncidencias",
    i => `<strong>${i.titulo}</strong> (${i.tipo}) - ${new Date(i.fecha).toLocaleString()}<br>${i.descripcion || ""}${i.adjunto ? `<br><a href="${i.adjunto}" target="_blank">Ver adjunto</a>` : ""}`
  );
  await cargarRegistros("adicciones", "listaAdicciones",
    a => `<strong>${a.nombre}</strong><br>${a.descripcion || ""}${a.adjunto ? `<br><a href="${a.adjunto}" target="_blank">Ver adjunto</a>` : ""}`
  );
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
document.getElementById("btnVolver").onclick = () => {
  window.location.href = `./afiliado.html?id=${afiliadoId}`;
};

/* ================= Función genérica agregar registro ================= */
function setupAgregarRegistro(btnId, formId, inputs, tabla) {
  const btn = document.getElementById(btnId);
  const form = document.getElementById(formId);
  if (!btn || !form) return;

  const archivoInput = form.querySelector('input[type="file"]');

  btn.onclick = () => form.classList.remove("hidden");

  form.querySelector(".cancelar").onclick = () => {
    form.classList.add("hidden");
    form.reset?.();
  };

  form.querySelector(".guardar").onclick = async () => {
    const valores = {};
    inputs.forEach(id => {
      valores[id] = form.querySelector("#" + id).value;
    });

    let adjuntoUrl = null;
    if (archivoInput && archivoInput.files.length > 0) {
      adjuntoUrl = await subirArchivoCloudinary(archivoInput.files[0]);
    }

    const { error } = await supabase.from(tabla).insert([{
      ...valores,
      afiliado_id: afiliadoId,
      created_by: user.id,
      updated_by: user.id,
      adjunto: adjuntoUrl
    }]);

    if (error) return alert("Error: " + error.message);

    form.classList.add("hidden");
    archivoInput.value = null;
    cargarTodo();
  };
}

/* ================= Setup agregar registros ================= */
setupAgregarRegistro("btnAgregarEnfermedad", "formEnfermedad",
  ["input-enfermedad","input-fecha","input-observaciones"], "enfermedades_cronicas");

setupAgregarRegistro("btnAgregarMedicamento", "formMedicamento",
  ["input-medicamento","input-dosis","input-proximo","input-med-observaciones"], "medicamentos");

setupAgregarRegistro("btnAgregarIncidencia", "formIncidencia",
  ["input-titulo","input-tipo","input-descripcion"], "incidencias_salud");

setupAgregarRegistro("btnAgregarAdiccion", "formAdiccion",
  ["input-adiccion","input-adiccion-descripcion"], "adicciones");

/* ===================== Init ===================== */
async function init() {
  await obtenerUsuario();
  await cargarAfiliado();
  await cargarTodo();
}

init();
