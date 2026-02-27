// fichaMedica.js
import { supabase } from "./supabase.js";

const container = document.getElementById("tab-container");
const tabsContainer = document.querySelector(".tabs");
const btnVolver = document.getElementById("btnVolver");
const nombreAfiliadoEl = document.getElementById("nombreAfiliado");

const moduleContainers = {};

// =====================
// Obtener afiliadoId y módulo desde URL
// =====================
const urlParams = new URLSearchParams(window.location.search);
let afiliadoId = urlParams.get("id");
const moduloInicial = urlParams.get("modulo"); // módulo a abrir desde notificación

// Si no viene por URL, fallback a localStorage
if (!afiliadoId) afiliadoId = localStorage.getItem("afiliadoId");
if (!afiliadoId) {
  Swal.fire("Error", "Afiliado no encontrado", "error");
  throw new Error("ID afiliado faltante");
}

// Guardar en localStorage el afiliado actual
localStorage.setItem("afiliadoId", afiliadoId);

// =====================
// Cargar nombre del afiliado
// =====================
async function cargarNombreAfiliado(id) {
  try {
    const { data, error } = await supabase
      .from("afiliados")
      .select("nombre, apellido")
      .eq("id", id)
      .single();
    if (error || !data) {
      console.error("Error cargando afiliado:", error);
      nombreAfiliadoEl.textContent = "Afiliado";
      return;
    }
    nombreAfiliadoEl.textContent = `${data.nombre} ${data.apellido}`;
  } catch (err) {
    console.error("Error cargando afiliado:", err);
    nombreAfiliadoEl.textContent = "Afiliado";
  }
}
cargarNombreAfiliado(afiliadoId);

// =====================
// Función loadModule (igual que antes)
// =====================
async function loadModule(moduleName) {
  Object.values(moduleContainers).forEach(c => c.style.display = "none");
  localStorage.setItem("ultimaPestana", moduleName);

  if (moduleContainers[moduleName]) {
    moduleContainers[moduleName].style.display = "block";
    return;
  }

  const div = document.createElement("div");
  div.style.display = "block";
  container.appendChild(div);
  moduleContainers[moduleName] = div;

  try {
    const html = await fetch(`./${moduleName}.html`).then(r => r.text());
    div.innerHTML = html;
  } catch (err) {
    console.error(`Error cargando ${moduleName}.html`, err);
    div.innerHTML = `<p>Error cargando el módulo ${moduleName}</p>`;
    return;
  }

  try {
    const module = await import(`../scripts/${moduleName}.js`);
    if (typeof module.init === "function") await module.init(afiliadoId);
  } catch (err) {
    console.error(`Error cargando ${moduleName}.js`, err);
  }

  const cssLinkId = `css-${moduleName}`;
  if (!document.getElementById(cssLinkId)) {
    const link = document.createElement("link");
    link.id = cssLinkId;
    link.rel = "stylesheet";
    link.href = `../styles/${moduleName}.css`;
    document.head.appendChild(link);
  }
}

// =====================
// Delegación pestañas
// =====================
tabsContainer.addEventListener("click", (e) => {
  if (e.target.matches(".tab-button")) {
    const moduleName = e.target.dataset.module;
    loadModule(moduleName);

    document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
    e.target.classList.add("active");
  }
});

// =====================
// Inicializar pestaña por defecto o desde URL
// =====================
(function initTabs() {
  let defaultModule = moduloInicial || localStorage.getItem("ultimaPestana") || tabsContainer.querySelector(".tab-button").dataset.module;

  loadModule(defaultModule);

  document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
  const btn = Array.from(document.querySelectorAll(".tab-button")).find(b => b.dataset.module === defaultModule);
  if (btn) btn.classList.add("active");
})();

// =====================
// Botón Volver
// =====================
btnVolver.addEventListener("click", () => {
  const id = localStorage.getItem("afiliadoId");
  window.location.href = id ? `./afiliado.html?id=${id}` : "./afiliado.html";
});