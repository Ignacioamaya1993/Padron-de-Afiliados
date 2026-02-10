// fichaMedica.js
import { supabase } from "./supabase.js"; // asegúrate de tener tu instancia Supabase

// =====================
// Contenedores
// =====================
const container = document.getElementById("tab-container");
const tabsContainer = document.querySelector(".tabs");
const btnVolver = document.getElementById("btnVolver");
const nombreAfiliadoEl = document.getElementById("nombreAfiliado");

// =====================
// Guardamos módulos cargados
// =====================
const loadedModules = {};

// =====================
// Obtener afiliadoId
// =====================
let afiliadoId = new URLSearchParams(window.location.search).get("id");

if (!afiliadoId) {
  afiliadoId = localStorage.getItem("afiliadoId");
}

if (!afiliadoId) {
  Swal.fire("Error", "Afiliado no encontrado", "error");
  throw new Error("ID afiliado faltante");
}

// Guardar en localStorage
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

// Llamada inicial
cargarNombreAfiliado(afiliadoId);

// =====================
// Cargar módulos dinámicamente
// =====================
async function loadModule(moduleName) {
  try {
    // HTML
    const html = await fetch(`./${moduleName}.html`).then(r => r.text());
    container.innerHTML = html;
  } catch (err) {
    console.error(`Error cargando ${moduleName}.html`, err);
    container.innerHTML = `<p>Error cargando el módulo ${moduleName}</p>`;
    return;
  }

  // JS
  if (!loadedModules[moduleName]) {
    try {
      const module = await import(`../scripts/${moduleName}.js`);

      // Llamar init() pasando afiliadoId
      if (typeof module.init === "function") {
        await module.init(afiliadoId);
      }

      loadedModules[moduleName] = true;
    } catch (err) {
      console.error(`Error cargando ${moduleName}.js`, err);
    }
  }

      // cargar CSS del módulo
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
  if (id) {
    window.location.href = `./afiliado.html?id=${id}`;
  } else {
    window.location.href = "./afiliado.html";
  }
});