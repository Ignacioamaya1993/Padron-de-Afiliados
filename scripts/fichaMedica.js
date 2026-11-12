// fichaMedica.js
import { supabase } from "./supabase.js";
import { cargarHeader } from "./header.js";

// El encabezado pertenece a la página, no a la pestaña cargada bajo demanda.
void cargarHeader();

const container = document.getElementById("tab-container");
const tabsContainer = document.querySelector(".tabs");
const btnVolver = document.getElementById("btnVolver");
const nombreAfiliadoEl = document.getElementById("nombreAfiliado");

const moduleContainers = {};
const formInitialValues = new WeakMap();

function readFormFieldValue(field) {
  if (field.type === "file") {
    return Array.from(field.files || [], file => `${file.name}:${file.size}:${file.lastModified}`);
  }

  if (field.type === "checkbox" || field.type === "radio") {
    return field.checked;
  }

  if (field instanceof HTMLSelectElement && field.multiple) {
    return Array.from(field.selectedOptions, option => option.value);
  }

  return field.value;
}

function captureFormInitialValues(moduleRoot) {
  moduleRoot.querySelectorAll("form").forEach(form => {
    if (formInitialValues.has(form)) return;

    const initialValues = new Map();
    form.querySelectorAll("input, select, textarea").forEach(field => {
      if (field.type !== "hidden") {
        initialValues.set(field, readFormFieldValue(field));
      }
    });
    formInitialValues.set(form, initialValues);
  });
}

function fieldHasValue(field) {
  if (field.type === "file") return field.files?.length > 0;
  if (field.type === "checkbox" || field.type === "radio") return field.checked;
  if (field instanceof HTMLSelectElement && field.multiple) {
    return Array.from(field.selectedOptions).some(option => option.value.trim() !== "");
  }
  return field.value.trim() !== "";
}

function formHasDraft(form) {
  const initialValues = formInitialValues.get(form);
  if (!initialValues) return false;

  return Array.from(form.querySelectorAll("input, select, textarea")).some(field => {
    if (field.type === "hidden") return false;
    if (!field.isConnected || field.disabled) return false;

    if (!initialValues.has(field)) return fieldHasValue(field);

    const initialValue = initialValues.get(field);
    return JSON.stringify(readFormFieldValue(field)) !== JSON.stringify(initialValue);
  });
}

function closeEmptyForms(moduleRoot) {
  moduleRoot.querySelectorAll("form").forEach(form => {
    const wrapper = form.parentElement?.closest('[id^="form"]');
    const closeTarget = wrapper || form;

    if (closeTarget.classList.contains("hidden") || closeTarget.classList.contains("oculto")) return;
    if (getComputedStyle(closeTarget).display === "none" || getComputedStyle(form).display === "none") return;
    if (formHasDraft(form)) return;

    const cancelButton = form.querySelector(
      'button[id^="btnCancelar"], button.btn-cancelar, button.prx-btn-cancelar'
    );
    cancelButton?.click();
  });
}

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
  Object.entries(moduleContainers).forEach(([loadedModule, moduleRoot]) => {
    if (loadedModule !== moduleName && moduleRoot.style.display !== "none") {
      closeEmptyForms(moduleRoot);
    }
    moduleRoot.style.display = "none";
  });
  localStorage.setItem("ultimaPestana", moduleName);

  if (moduleContainers[moduleName]) {
    moduleContainers[moduleName].style.display = "flex";
    moduleContainers[moduleName].dispatchEvent(new Event("module:shown"));
    return;
  }

  const div = document.createElement("div");
  div.classList.add("module-container", `module-container--${moduleName}`);
  div.style.display = "flex";
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
    captureFormInitialValues(div);
  } catch (err) {
    console.error(`Error cargando ${moduleName}.js`, err);
  }

  // Cada módulo conserva su hoja propia solo cuando aporta estilos específicos.
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
