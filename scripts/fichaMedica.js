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
  if (error) Swal.fire("Error", error.message, "error");
  else window.location.href = "/pages/login.html";
}

/* ===================== CARGAR AFILIADO ===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase.from("afiliados").select("*").eq("id", afiliadoId).single();
  if (error || !data) return console.error(error);
  afiliado = data;
  document.getElementById("nombreAfiliado").textContent = `${afiliado.nombre} ${afiliado.apellido}`;
}

/* ===================== FUNCIONES DE CARGA ===================== */
async function cargarTabla(tabla, containerId) {
  const { data } = await supabase.from(tabla).select("*").eq("afiliado_id", afiliadoId);
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    // Construir el contenido de la card según tabla
    let inner = "";
    switch (tabla) {
      case "enfermedades_cronicas":
        inner = `<strong>${item.enfermedad}</strong> - ${item.fecha_diagnostico || "-"}<br>
                 ${item.observaciones || ""}<br>
                 ${item.adjunto ? `<a href="${item.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
        break;
      case "medicamentos":
        inner = `<strong>${item.medicamento}</strong> - ${item.dosis} - ${item.frecuencia || "-"}<br>
                 Inicio: ${item.fecha_inicio || "-"} | Fin: ${item.fecha_fin || "-"}<br>
                 Última: ${item.ultima_entrega || "-"} | Próxima: ${item.proximo_entrega || "-"}<br>
                 ${item.observaciones || ""}<br>
                 ${item.adjunto ? `<a href="${item.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
        break;
      case "incidencias_salud":
        inner = `<strong>${item.titulo}</strong> (${item.tipo}) - ${item.fecha || "-"}<br>
                 ${item.descripcion || ""}<br>
                 ${item.adjunto ? `<a href="${item.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
        break;
      case "adicciones":
        inner = `<strong>${item.adiccion}</strong> - ${item.frecuencia || "-"}<br>
                 ${item.observaciones || ""}<br>
                 ${item.adjunto ? `<a href="${item.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
        break;
    }

    // Botones de editar y eliminar
    inner += `<div class="card-actions">
                <button class="btn-editar" data-id="${item.id}" data-tabla="${tabla}">✏️ Editar</button>
                <button class="btn-eliminar" data-id="${item.id}" data-tabla="${tabla}">🗑️ Eliminar</button>
              </div>`;

    card.innerHTML = inner;
    container.appendChild(card);
  });

  // Asignar eventos a botones
  container.querySelectorAll(".btn-editar").forEach(btn => {
    btn.onclick = () => editarRegistro(btn.dataset.tabla, btn.dataset.id);
  });

  container.querySelectorAll(".btn-eliminar").forEach(btn => {
    btn.onclick = () => eliminarRegistro(btn.dataset.tabla, btn.dataset.id);
  });
}

// Wrappers para cada tabla
const cargarEnfermedades = () => cargarTabla("enfermedades_cronicas", "listaEnfermedades");
const cargarMedicamentos = () => cargarTabla("medicamentos", "listaMedicamentos");
const cargarIncidencias = () => cargarTabla("incidencias_salud", "listaIncidencias");
const cargarAdicciones = () => cargarTabla("adicciones", "listaAdicciones");

/* ===================== FUNCIONES GUARDAR/EDITAR ===================== */
async function guardarRegistro(tabla, formData, campos = [], id = null) {
  if (!user) return Swal.fire("Error", "Usuario no definido", "error");

  let adjuntoUrl = null;
  const file = formData.get("adjunto");
  if (file && file.size > 0) adjuntoUrl = await subirArchivoCloudinary(file);

  const registro = { afiliado_id: afiliadoId, updated_by: user.id };
  campos.forEach(c => registro[c] = formData.get(c) || null);
  if (adjuntoUrl) registro.adjunto = adjuntoUrl;
  if (!id) registro.created_by = user.id;

  let res;
  if (id) {
    res = await supabase.from(tabla).update(registro).eq("id", id);
  } else {
    res = await supabase.from(tabla).insert([registro]);
  }

  if (res.error) return Swal.fire("Error", res.error.message, "error");

  Swal.fire("Éxito", id ? "Registro actualizado" : "Registro creado", "success");

  // Recargar la lista
  switch (tabla) {
    case "enfermedades_cronicas": cargarEnfermedades(); break;
    case "medicamentos": cargarMedicamentos(); break;
    case "incidencias_salud": cargarIncidencias(); break;
    case "adicciones": cargarAdicciones(); break;
  }
}

/* ===================== FUNCION ELIMINAR ===================== */
async function eliminarRegistro(tabla, id) {
  const resp = await Swal.fire({
    title: "¿Eliminar registro?",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar"
  });

  if (resp.isConfirmed) {
    const { error } = await supabase.from(tabla).delete().eq("id", id);
    if (error) return Swal.fire("Error", error.message, "error");

    Swal.fire("Eliminado", "El registro ha sido eliminado", "success");

    // Recargar lista
    switch (tabla) {
      case "enfermedades_cronicas": cargarEnfermedades(); break;
      case "medicamentos": cargarMedicamentos(); break;
      case "incidencias_salud": cargarIncidencias(); break;
      case "adicciones": cargarAdicciones(); break;
    }
  }
}

/* ===================== FUNCION EDITAR ===================== */
async function editarRegistro(tabla, id) {
  const { data, error } = await supabase.from(tabla).select("*").eq("id", id).single();
  if (error || !data) return Swal.fire("Error", "No se pudo cargar el registro", "error");

  const formId = {
    "enfermedades_cronicas": "formEnfermedad",
    "medicamentos": "formMedicamento",
    "incidencias_salud": "formIncidencia",
    "adicciones": "formAdiccion"
  }[tabla];

  const form = document.getElementById(formId);
  form.classList.remove("hidden");

  // Mostrar botón nuevo oculto
  const btnNuevoId = formId.replace("form", "btnNuevo");
  document.getElementById(btnNuevoId).style.display = "none";

  // Llenar formulario
  Object.keys(data).forEach(k => {
    const field = form.querySelector(`[name="${k}"]`);
    if (field) field.value = data[k] || "";
  });

  // Reconfigurar submit para actualizar
  form.onsubmit = async e => {
    e.preventDefault();
    await guardarRegistro(tabla, new FormData(form), Object.keys(data).filter(k => k !== "id" && k !== "afiliado_id" && k !== "created_by" && k !== "updated_at"), id);
    form.reset();
    form.classList.add("hidden");
    document.getElementById(btnNuevoId).style.display = "inline-block";
    form.onsubmit = null; // resetear submit original
  };
}

/* ===================== NUEVO / CANCELAR ===================== */
function setupNuevoCancelar(nuevoBtnId, cancelarBtnId, formId, tabla, campos) {
  const btnNuevo = document.getElementById(nuevoBtnId);
  const btnCancelar = document.getElementById(cancelarBtnId);
  const form = document.getElementById(formId);

  btnNuevo.onclick = () => {
    form.classList.remove("hidden");
    btnNuevo.style.display = "none";
    form.onsubmit = async e => {
      e.preventDefault();
      await guardarRegistro(tabla, new FormData(form), campos);
      form.reset();
      form.classList.add("hidden");
      btnNuevo.style.display = "inline-block";
    };
  };

  btnCancelar.onclick = () => {
    form.classList.add("hidden");
    btnNuevo.style.display = "inline-block";
    form.reset();
    form.onsubmit = null; // resetear submit original
  };
}

/* ===================== CONFIGURACIÓN NUEVO/CANCELAR ===================== */
setupNuevoCancelar("btnNuevoEnfermedad", "btnCancelarEnfermedad", "formEnfermedad", "enfermedades_cronicas", ["enfermedad","fecha_diagnostico","observaciones"]);
setupNuevoCancelar("btnNuevoMedicamento", "btnCancelarMedicamento", "formMedicamento", "medicamentos", ["medicamento","dosis","frecuencia","fecha_inicio","fecha_fin","ultima_entrega","proximo_entrega","observaciones"]);
setupNuevoCancelar("btnNuevoIncidencia", "btnCancelarIncidencia", "formIncidencia", "incidencias_salud", ["titulo","descripcion","tipo","fecha"]);
setupNuevoCancelar("btnNuevoAdiccion", "btnCancelarAdiccion", "formAdiccion", "adicciones", ["adiccion","frecuencia","observaciones"]);

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
