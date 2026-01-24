import { authObserver, logout } from "./auth.js";
import { supabase } from "./supabase.js";

/* =====================
   CONFIGURACIÓN
===================== */
let pageSize = 50;
let editandoId = null;
let offset = 0;

let padronCache = [];
let searchText = "";
let orderField = "apellido";
let orderDirection = "asc";

/* =====================
   HELPERS
===================== */
function formatearFecha(fecha) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-AR");
}

function calcularEdad(fecha) {
  if (!fecha) return "-";
  const hoy = new Date();
  const nac = new Date(fecha);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

/* =====================
   AUTH
===================== */
authObserver(user => {
  if (!user) {
    window.location.href = "/pages/login.html";
  } else {
    document.getElementById("status").textContent =
      `Bienvenido ${user.email}`;
    cargarPadron(true);
  }
});

document
  .getElementById("logoutBtn")
  ?.addEventListener("click", logout);

/* =====================
   CARGA DE PADRON
===================== */
async function cargarPadron(reset = true) {
  const tbody = document.getElementById("PadronBody");

  if (reset) {
    tbody.innerHTML = "";
    padronCache = [];
    offset = 0;
  }

  try {
    const { data, error } = await supabase
      .from("padron")
      .select("*")
      .order(orderField, { ascending: orderDirection === "asc" })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    if (!data.length && reset) {
      tbody.innerHTML =
        `<tr><td colspan="7">No hay afiliados</td></tr>`;
      return;
    }

    padronCache.push(...data);
    offset += pageSize;

    renderTabla();

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudieron cargar los afiliados", "error");
  }
}

/* =====================
   RENDER TABLA
===================== */
function renderTabla() {
  const tbody = document.getElementById("PadronBody");
  tbody.innerHTML = "";

  const t = searchText.toLowerCase();

  const filtrados = padronCache.filter(c =>
    c.nombre_completo?.toLowerCase().includes(t) ||
    c.telefono?.includes(t) ||
    c.afiliado?.includes(t) ||
    c.grupo_familiar_id?.toLowerCase().includes(t)
  );

  if (!filtrados.length) {
    tbody.innerHTML =
      `<tr><td colspan="7">Sin resultados</td></tr>`;
    return;
  }

  filtrados.forEach(c => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${c.nombre_completo}</td>
      <td>${formatearFecha(c.fecha_nacimiento)}</td>
      <td>${calcularEdad(c.fecha_nacimiento)}</td>
      <td>${c.grupo_familiar_id || "-"}</td>
      <td>${c.telefono || "-"}</td>
      <td>${c.afiliado || "-"}</td>
      <td>
        <button data-edit="${c.id}">✏️</button>
        <button data-delete="${c.id}">🗑️</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  agregarEventosFila();
}

/* =====================
   EVENTOS FILA
===================== */
function agregarEventosFila() {
  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () =>
      cargarPadronParaEdicion(btn.dataset.edit);
  });

  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = () =>
      eliminarPadron(btn.dataset.delete);
  });
}

/* =====================
   BUSCADOR / FILTROS
===================== */
document
  .getElementById("searchInput")
  ?.addEventListener("input", e => {
    searchText = e.target.value;
    renderTabla();
  });

document
  .getElementById("orderSelect")
  ?.addEventListener("change", e => {
    const [field, dir] = e.target.value.split("_");
    orderField = field;
    orderDirection = dir;
    cargarPadron(true);
  });

document
  .getElementById("pageSizeSelect")
  ?.addEventListener("change", e => {
    pageSize = Number(e.target.value);
    cargarPadron(true);
  });

document
  .getElementById("btnCargarMas")
  ?.addEventListener("click", () => cargarPadron(false));

/* =====================
   ALTA / EDICIÓN
===================== */
async function guardarPadron(data) {

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    Swal.fire("Error", "Sesión inválida", "error");
    return;
  }

  try {
    if (editandoId) {
      const payloadUpdate = {
        nombre: data.nombre,
        apellido: data.apellido,
        nombre_completo: `${data.apellido} ${data.nombre}`,
        telefono: data.telefono || null,
        afiliado: data.afiliado || null,
        grupo_familiar_id: data.grupoFamiliarId || null,
        fecha_nacimiento: data.fechaNacimiento || null,
        updated_at: new Date()
      };

      await supabase
        .from("padron")
        .update(payloadUpdate)
        .eq("id", editandoId);

      editandoId = null;
      Swal.fire("Actualizado", "Afiliado modificado", "success");

    } else {
      const payloadInsert = {
        nombre: data.nombre,
        apellido: data.apellido,
        nombre_completo: `${data.apellido} ${data.nombre}`,
        telefono: data.telefono || null,
        afiliado: data.afiliado || null,
        grupo_familiar_id: data.grupoFamiliarId || null,
        fecha_nacimiento: data.fechaNacimiento || null,
        created_by: user.id
      };

      await supabase
        .from("padron")
        .insert(payloadInsert);

      Swal.fire("Guardado", "Afiliado agregado", "success");
    }

    cargarPadron(true);
    limpiarFormulario();

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo guardar el afiliado", "error");
  }
}

/* =====================
   CARGAR PARA EDICIÓN
===================== */
async function cargarPadronParaEdicion(id) {
  const { data, error } = await supabase
    .from("padron")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return;

  const f = document.getElementById("PadronForm");

  editandoId = id;
  f.nombre.value = data.nombre || "";
  f.apellido.value = data.apellido || "";
  f.telefono.value = data.telefono || "";
  f.afiliado.value = data.afiliado || "";
  f.grupoFamiliarId.value = data.grupo_familiar_id || "";
  f.fechaNacimiento.value = data.fecha_nacimiento || "";
}

/* =====================
   ELIMINAR
===================== */
async function eliminarPadron(id) {
  const r = await Swal.fire({
    title: "¿Eliminar afiliado?",
    text: "Esta acción es permanente",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar"
  });

  if (!r.isConfirmed) return;

  await supabase
    .from("padron")
    .delete()
    .eq("id", id);

  Swal.fire("Eliminado", "Afiliado eliminado", "success");
  cargarPadron(true);
}

/* =====================
   FORM
===================== */
function limpiarFormulario() {
  document.getElementById("PadronForm")?.reset();
}

document
  .getElementById("PadronForm")
  ?.addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;

    await guardarPadron({
      nombre: f.nombre.value.trim(),
      apellido: f.apellido.value.trim(),
      telefono: f.telefono.value.trim(),
      afiliado: f.afiliado.value.trim(),
      grupoFamiliarId: f.grupoFamiliarId.value.trim(),
      fechaNacimiento: f.fechaNacimiento.value || null
    });
  });