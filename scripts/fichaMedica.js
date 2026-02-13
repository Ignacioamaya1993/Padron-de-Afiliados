// fichaMedica.js
import { supabase } from "./supabase.js";

// =====================
// Contenedores
// =====================
const container = document.getElementById("tab-container");
const tabsContainer = document.querySelector(".tabs");
const btnVolver = document.getElementById("btnVolver");
const nombreAfiliadoEl = document.getElementById("nombreAfiliado");

// =====================
// Contenedores persistentes por módulo
// =====================
const moduleContainers = {};

// =====================
// Obtener afiliadoId
// =====================
let afiliadoId = new URLSearchParams(window.location.search).get("id");
if (!afiliadoId) afiliadoId = localStorage.getItem("afiliadoId");
if (!afiliadoId) {
  Swal.fire("Error", "Afiliado no encontrado", "error");
  throw new Error("ID afiliado faltante");
}
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
// Cargar módulo
// =====================
async function loadModule(moduleName) {
  // Ocultar todos los contenedores
  Object.values(moduleContainers).forEach(c => c.style.display = "none");

  // Si ya existe el contenedor, solo mostrarlo
  if (moduleContainers[moduleName]) {
    moduleContainers[moduleName].style.display = "block";
    return;
  }

  // Crear contenedor nuevo
  let div = document.createElement("div");
  div.style.display = "block";
  container.appendChild(div);
  moduleContainers[moduleName] = div;

  // Cargar HTML
  try {
    const html = await fetch(`./${moduleName}.html`).then(r => r.text());
    div.innerHTML = html;
  } catch (err) {
    console.error(`Error cargando ${moduleName}.html`, err);
    div.innerHTML = `<p>Error cargando el módulo ${moduleName}</p>`;
    return;
  }

  // Cargar JS del módulo
  try {
    const module = await import(`../scripts/${moduleName}.js`);
    if (typeof module.init === "function") await module.init(afiliadoId);
  } catch (err) {
    console.error(`Error cargando ${moduleName}.js`, err);
  }

  // Cargar CSS del módulo si no está
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
// Delegación de pestañas
// =====================
tabsContainer.addEventListener("click", (e) => {
  if (e.target.matches(".tab-button")) {
    const moduleName = e.target.dataset.module;
    loadModule(moduleName);

    // marcar activa
    document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
    e.target.classList.add("active");
  }
});

// =====================
// Cargar módulo por defecto
// =====================
if (tabsContainer.querySelector(".tab-button")) {
  const defaultModule = tabsContainer.querySelector(".tab-button").dataset.module;
  loadModule(defaultModule);
  tabsContainer.querySelector(".tab-button").classList.add("active");
}

// =====================
// Botón Volver
// =====================
btnVolver.addEventListener("click", () => {
  const id = localStorage.getItem("afiliadoId");
  window.location.href = id ? `./afiliado.html?id=${id}` : "./afiliado.html";
});
