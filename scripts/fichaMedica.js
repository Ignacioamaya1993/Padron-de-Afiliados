import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";
const CLOUDINARY_DELETE_ENDPOINT = "https://vzqduywffrzhcrjtercs.supabase.co/functions/v1/borrarCloudinary";

const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) throw new Error("ID de afiliado faltante");

let afiliado = null;
let user = null;

/* ===================== UTIL ===================== */
function formatoArgentino(fechaString) {
  if (!fechaString) return "-";
  const fecha = new Date(fechaString);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Enero = 0
  const anio = fecha.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

/* ===================== CARGAR AFILIADO ===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase.from("afiliados").select("*").eq("id", afiliadoId).single();
  if (error || !data) return console.error(error);
  afiliado = data;
  document.getElementById("nombreAfiliado").textContent = `${afiliado.nombre} ${afiliado.apellido}`;
}

/* ===================== CARGAR TABLAS ===================== */
async function cargarTabla(tabla, containerId) {
  const { data } = await supabase.from(tabla).select("*").eq("afiliado_id", afiliadoId);
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    let inner = "";
    switch (tabla) {
      case "enfermedades_cronicas":
        inner = `<strong>${item.enfermedad}</strong> - ${formatoArgentino(item.fecha_diagnostico)}<br>
                 ${item.observaciones || ""}<br>
                 ${item.adjunto ? `<a href="${item.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
        break;
      case "medicamentos":
        inner = `<strong>${item.medicamento}</strong> - ${item.dosis} - ${item.frecuencia || "-"}<br>
                 Inicio: ${formatoArgentino(item.fecha_inicio)} | Fin: ${formatoArgentino(item.fecha_fin)}<br>
                 Última: ${formatoArgentino(item.ultima_entrega)} | Próxima: ${formatoArgentino(item.proximo_entrega)}<br>
                 ${item.observaciones || ""}<br>
                 ${item.adjunto ? `<a href="${item.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
        break;
      case "incidencias_salud":
        inner = `<strong>${item.titulo}</strong> (${item.tipo}) - ${formatoArgentino(item.fecha)}<br>
                 ${item.descripcion || ""}<br>
                 ${item.adjunto ? `<a href="${item.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
        break;
      case "adicciones":
        inner = `<strong>${item.adiccion}</strong> - ${item.frecuencia || "-"}<br>
                 ${item.observaciones || ""}<br>
                 ${item.adjunto ? `<a href="${item.adjunto}" target="_blank">Ver adjunto</a>` : ""}`;
        break;
    }

    // Botones editar y eliminar
    inner += `<div class="card-actions">
                <button class="btn-editar" data-id="${item.id}" data-tabla="${tabla}">✏️ Editar</button>
                <button class="btn-eliminar" data-id="${item.id}" data-tabla="${tabla}" data-adjunto="${item.adjunto || ""}">🗑️ Eliminar</button>
              </div>`;

    card.innerHTML = inner;
    container.appendChild(card);
  });

  // Eventos de editar y eliminar
  container.querySelectorAll(".btn-editar").forEach(btn => {
    btn.onclick = () => editarRegistro(btn.dataset.tabla, btn.dataset.id);
  });
  container.querySelectorAll(".btn-eliminar").forEach(btn => {
    btn.onclick = () => eliminarRegistro(btn.dataset.tabla, btn.dataset.id, btn.dataset.adjunto);
  });
}

// Wrappers
const cargarEnfermedades = () => cargarTabla("enfermedades_cronicas", "listaEnfermedades");
const cargarMedicamentos = () => cargarTabla("medicamentos", "listaMedicamentos");
const cargarIncidencias = () => cargarTabla("incidencias_salud", "listaIncidencias");
const cargarAdicciones = () => cargarTabla("adicciones", "listaAdicciones");

/* ===================== GUARDAR / EDITAR ===================== */
async function guardarRegistro(tabla, formData, campos = [], id = null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "/pages/login.html";
    return;
  }

  let adjuntoUrl = null;
  const file = formData.get("adjunto");
  if (file && file.size > 0) adjuntoUrl = await subirArchivoCloudinary(file);

  const registro = { afiliado_id: afiliadoId, updated_by: user.id };
  campos.forEach(c => registro[c] = formData.get(c) || null);
  if (adjuntoUrl) registro.adjunto = adjuntoUrl;
  if (!id) registro.created_by = user.id;

  let res;
  if (id) res = await supabase.from(tabla).update(registro).eq("id", id);
  else res = await supabase.from(tabla).insert([registro]);

  if (res.error) return Swal.fire("Error", res.error.message, "error");

  Swal.fire("Éxito", id ? "Registro actualizado" : "Registro creado", "success");

  // Recargar tabla
  switch (tabla) {
    case "enfermedades_cronicas": cargarEnfermedades(); break;
    case "medicamentos": cargarMedicamentos(); break;
    case "incidencias_salud": cargarIncidencias(); break;
    case "adicciones": cargarAdicciones(); break;
  }
}

/* ===================== ELIMINAR ===================== */
async function eliminarArchivoCloudinary(public_id) {
  try {
    await fetch(CLOUDINARY_DELETE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id, resource_type: "image" })
    });
  } catch (err) {
    // ignorar cualquier error
  }
}

async function eliminarRegistro(tabla, id) {
  const resp = await Swal.fire({
    title: "¿Eliminar registro?",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar"
  });

  if (!resp.isConfirmed) return;

  // Obtener adjunto (si existe)
  const { data } = await supabase.from(tabla).select("adjunto").eq("id", id).single();

  // Intentar borrar archivo en Cloudinary si hay adjunto (ignorar errores)
  if (data?.adjunto) {
    try {
      const url = new URL(data.adjunto);
      const parts = url.pathname.split("/");
      const filename = parts.pop() || parts.pop(); // último segmento
      const public_id = filename.split(".")[0];
      eliminarArchivoCloudinary(public_id); // no await, solo fire-and-forget
    } catch (err) {
      // ignorar cualquier error
    }
  }

  // 3Borrar registro en Supabase
  const { error: delError } = await supabase.from(tabla).delete().eq("id", id);
  if (delError) return Swal.fire("Error", delError.message, "error");

  // Mensaje de éxito
  Swal.fire("Eliminado", "Registro eliminado correctamente", "success");

  // Recargar tabla correspondiente
  switch (tabla) {
    case "enfermedades_cronicas": cargarEnfermedades(); break;
    case "medicamentos": cargarMedicamentos(); break;
    case "incidencias_salud": cargarIncidencias(); break;
    case "adicciones": cargarAdicciones(); break;
  }
}

/* ===================== EDITAR ===================== */
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
  const btnNuevoId = formId.replace("form", "btnNuevo");
  document.getElementById(btnNuevoId).style.display = "none";

Object.keys(data).forEach(k => {
  const field = form.querySelector(`[name="${k}"]`);
  if (!field) return;

  if (field.type === "file") {
    field.value = ""; // solo vaciar
  } else {
    field.value = data[k] || "";
  }
});

  form.onsubmit = async e => {
    e.preventDefault();
    await guardarRegistro(tabla, new FormData(form), Object.keys(data).filter(k => !["id","afiliado_id","created_by","updated_at"].includes(k)), id);
    form.reset();
    form.classList.add("hidden");
    document.getElementById(btnNuevoId).style.display = "inline-block";
    form.onsubmit = null;
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
    form.onsubmit = null;
  };
}

/* ===================== CONFIGURAR NUEVO/CANCELAR ===================== */
setupNuevoCancelar("btnNuevoEnfermedad", "btnCancelarEnfermedad", "formEnfermedad", "enfermedades_cronicas", ["enfermedad","fecha_diagnostico","observaciones"]);
setupNuevoCancelar("btnNuevoMedicamento", "btnCancelarMedicamento", "formMedicamento", "medicamentos", ["medicamento","dosis","frecuencia","fecha_inicio","fecha_fin","ultima_entrega","proximo_entrega","observaciones"]);
setupNuevoCancelar("btnNuevoIncidencia", "btnCancelarIncidencia", "formIncidencia", "incidencias_salud", ["titulo","descripcion","tipo","fecha"]);
setupNuevoCancelar("btnNuevoAdiccion", "btnCancelarAdiccion", "formAdiccion", "adicciones", ["adiccion","frecuencia","observaciones"]);

/* ===================== TABS ===================== */
document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", () => {
    // 1️Cambiar tab activa
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");

    // Cerrar todos los formularios y mostrar botones "Nuevo"
    const forms = document.querySelectorAll("form[id^='form']");
    forms.forEach(f => {
      f.classList.add("hidden");
      f.reset();
    });
    const btnNuevos = document.querySelectorAll("[id^='btnNuevo']");
    btnNuevos.forEach(b => b.style.display = "inline-block");
  });
});

/* ===================== BOTÓN VOLVER ===================== */
document.getElementById("btnVolver").onclick = () => {
  window.location.href = `./afiliado.html?id=${afiliadoId}`;
};

/* ===================== INIT ===================== */
async function init() {
  await cargarHeader(); 
  await verificarUsuario();
  await cargarAfiliado();
  await cargarEnfermedades();
  await cargarMedicamentos();
  await cargarIncidencias();
  await cargarAdicciones();
}

document.getElementById("logoutBtn").onclick = cerrarSesion;

init();
