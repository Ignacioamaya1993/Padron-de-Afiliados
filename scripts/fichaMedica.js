import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js"; // Cloudinary unsigned
const CLOUDINARY_DELETE_ENDPOINT = "https://vzqduywffrzhcrjtercs.supabase.co/functions/v1/borrarCloudinary";

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
  if (!user) return Swal.fire("Error", "Usuario no definido", "error");

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

  // Recargar
  switch (tabla) {
    case "enfermedades_cronicas": cargarEnfermedades(); break;
    case "medicamentos": cargarMedicamentos(); break;
    case "incidencias_salud": cargarIncidencias(); break;
    case "adicciones": cargarAdicciones(); break;
  }
}

/* ===================== ELIMINAR ARCHIVO CLOUDINARY ===================== */
async function eliminarArchivoCloudinary(public_id) {
  try {
    // Obtenemos la sesión activa
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Usuario no autenticado");

    // Usamos supabase.functions.invoke con Authorization manual
    const resp = await fetch('https://vzqduywffrzhcrjtercs.supabase.co/functions/v1/borrarCloudinary', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}` // ✅ token JWT del usuario
      },
      body: JSON.stringify({ public_id, resource_type: "image" })
    });

    if (!resp.ok) {
      const data = await resp.json();
      throw new Error(data?.error || "Error al eliminar archivo");
    }

    return await resp.json();
  } catch (err) {
    console.error("Error al eliminar archivo Cloudinary:", err);
    return null;
  }
}

/* ===================== ELIMINAR REGISTRO ===================== */
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

  // 1️⃣ Obtener registro para saber si tiene adjunto
  const { data, error } = await supabase.from(tabla).select("adjunto").eq("id", id).single();
  if (error) return Swal.fire("Error", error.message, "error");

  // 2️⃣ Borrar archivo Cloudinary si existe
  if (data?.adjunto) {
    try {
      const url = new URL(data.adjunto);
      const parts = url.pathname.split("/");
      const filename = parts.pop() || parts.pop(); // último segmento
      const public_id = filename.split(".")[0];

      const cloudinaryResp = await eliminarArchivoCloudinary(public_id);
      if (!cloudinaryResp?.success) {
        return Swal.fire("Error", "No se pudo eliminar el archivo de Cloudinary", "error");
      }
    } catch (err) {
      console.error("Error al extraer public_id o eliminar imagen:", err);
      return Swal.fire("Error", "Error al eliminar archivo", "error");
    }
  }

  // 3️⃣ Borrar registro en Supabase
  const { error: delError } = await supabase.from(tabla).delete().eq("id", id);
  if (delError) return Swal.fire("Error", delError.message, "error");

  Swal.fire("Eliminado", "Registro eliminado correctamente", "success");

  // 4️⃣ Recargar tabla
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
    if (field) field.value = data[k] || "";
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
