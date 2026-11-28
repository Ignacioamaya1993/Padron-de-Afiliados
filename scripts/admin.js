import { supabase } from "./supabase.js";

const ADMIN_EMAIL = "ignacioamaya04@gmail.com";
const catalogs = [
  { key: "planes", label: "Planes", active: true },
  { key: "categorias", label: "Categorías", active: true },
  { key: "parentescos", label: "Parentescos", titular: true },
  { key: "localidades", label: "Localidades" },
  { key: "grupo_sanguineo", label: "Grupos sanguíneos" },
  { key: "tipo_medicamentos", label: "Tipos de medicamentos", note: "Los tipos nuevos se incorporan como opciones generales. Los tipos especiales actuales conservan sus reglas de carga y vencimiento." },
  { key: "tipo_material_ortopedico", label: "Tipos de materiales ortopédicos" },
  { key: "tipo_practicasxreintegro", label: "Tipos de prácticas por reintegro" },
  { key: "tipoequipo_oxigenoterapia", label: "Equipos de oxigenoterapia" },
  { key: "tipo_atencion_domiciliaria", label: "Tipos de atención domiciliaria" },
  { key: "tipo_derivaciones", label: "Tipos de derivación" },
  { key: "tipo_expediente_discapacidad", label: "Tipos de expediente de discapacidad" },
  { key: "tipo_internaciones", label: "Tipos de internación" },
  { key: "lugar_internaciones", label: "Lugares de internación" }
];

const nav = document.getElementById("catalogNav");
const panel = document.getElementById("catalogPanel");
const notice = document.getElementById("adminNotice");
const search = document.getElementById("catalogSearch");
let selected = null;
let rows = [];

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function showNotice(message, kind = "success") {
  notice.textContent = message;
  notice.className = `admin-notice ${kind}`;
  notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { notice.hidden = true; }, 5000);
}

function drawNav(filter = "") {
  nav.replaceChildren();
  catalogs.filter(item => item.label.toLowerCase().includes(filter.toLowerCase())).forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `catalog-nav-button${selected?.key === item.key ? " is-active" : ""}`;
    button.innerHTML = `<span>${escapeText(item.label)}</span><small>›</small>`;
    button.addEventListener("click", () => loadCatalog(item));
    nav.append(button);
  });
}

async function api(action, table, values = {}, id = null) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("La sesión venció. Ingresá nuevamente.");
  const send = token => fetch("/api/padron/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ action, table, values, id })
  });
  let response = await send(session.access_token);
  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
    if (session?.access_token) response = await send(session.access_token);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "No se pudo completar el cambio.");
  return result;
}

function drawCatalog() {
  const item = selected;
  const extraColumn = item.active || item.titular;
  const rowsMarkup = rows.map(row => `
    <tr data-id="${escapeText(row.id)}">
      <td><input type="text" class="row-name" value="${escapeText(row.nombre)}" maxlength="120" aria-label="Nombre"></td>
      ${extraColumn ? `<td><label class="admin-check"><input class="row-extra" type="checkbox" ${row[item.active ? "activo" : "es_titular"] ? "checked" : ""}>${item.active ? "Activo" : "Titular"}</label></td>` : ""}
      <td><div class="catalog-actions"><button class="admin-small-button save-row" type="button">Guardar</button><button class="admin-small-button danger delete-row" type="button">Eliminar</button></div></td>
    </tr>`).join("");
  panel.innerHTML = `
    <div class="catalog-heading"><div><p class="admin-eyebrow">CATÁLOGO</p><h2>${escapeText(item.label)}</h2><p>Los cambios se reflejan en los formularios conectados a este catálogo.</p></div><span class="catalog-count">${rows.length} ${rows.length === 1 ? "registro" : "registros"}</span></div>
    <section class="catalog-create"><h3>Agregar opción</h3><form id="createForm"><input name="nombre" type="text" maxlength="120" placeholder="Nombre de la opción" aria-label="Nombre de la opción" required>${item.active ? `<label class="admin-check"><input name="activo" type="checkbox" checked>Activo</label>` : ""}${item.titular ? `<label class="admin-check"><input name="es_titular" type="checkbox">Titular</label>` : ""}<button class="admin-primary" type="submit">Agregar</button></form></section>
    <div class="catalog-table-wrap"><table class="catalog-table"><thead><tr><th>Nombre</th>${extraColumn ? `<th>${item.active ? "Estado" : "Titular"}</th>` : ""}<th></th></tr></thead><tbody>${rowsMarkup || `<tr><td colspan="3">Todavía no hay opciones.</td></tr>`}</tbody></table></div>
    ${item.note ? `<p class="admin-note">${escapeText(item.note)}</p>` : `<p class="admin-note">Si una opción ya está usada por afiliados o fichas, la base de datos impedirá eliminarla para conservar las relaciones existentes.</p>`}`;

  panel.querySelector("#createForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type=submit]");
    const values = { nombre: form.elements.nombre.value };
    if (item.active) values.activo = form.elements.activo.checked;
    if (item.titular) values.es_titular = form.elements.es_titular.checked;
    submit.disabled = true;
    try { await api("create", item.key, values); await loadCatalog(item); showNotice("Opción agregada."); }
    catch (error) { showNotice(error.message, "error"); submit.disabled = false; }
  });

  panel.querySelectorAll(".save-row").forEach(button => button.addEventListener("click", async () => {
    const row = button.closest("tr");
    const values = { nombre: row.querySelector(".row-name").value };
    if (extraColumn) values[item.active ? "activo" : "es_titular"] = row.querySelector(".row-extra").checked;
    button.disabled = true;
    try { await api("update", item.key, values, row.dataset.id); await loadCatalog(item); showNotice("Cambios guardados."); }
    catch (error) { showNotice(error.message, "error"); button.disabled = false; }
  }));

  panel.querySelectorAll(".delete-row").forEach(button => button.addEventListener("click", async () => {
    const row = button.closest("tr");
    const label = row.querySelector(".row-name").value;
    if (!window.confirm(`¿Eliminar “${label}”?`)) return;
    button.disabled = true;
    try { await api("delete", item.key, {}, row.dataset.id); await loadCatalog(item); showNotice("Opción eliminada."); }
    catch (error) { showNotice(error.message, "error"); button.disabled = false; }
  }));
}

async function loadCatalog(item) {
  selected = item;
  drawNav(search.value);
  panel.innerHTML = `<div class="admin-empty"><span class="admin-empty-mark">…</span><h2>Cargando ${escapeText(item.label.toLowerCase())}</h2></div>`;
  try { rows = await api("list", item.key); drawCatalog(); }
  catch (error) { panel.innerHTML = `<div class="admin-empty"><h2>No se pudo cargar el catálogo</h2><p>${escapeText(error.message)}</p></div>`; }
}

search.addEventListener("input", () => drawNav(search.value));
document.getElementById("adminLogout").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  window.location.href = "/pages/login.html";
});

const { data: { user }, error } = await supabase.auth.getUser();
if (error || user?.email?.toLowerCase() !== ADMIN_EMAIL) {
  window.location.replace(user ? "/pages/padron.html" : "/pages/login.html");
} else {
  document.getElementById("adminEmail").textContent = user.email;
  drawNav();
}
