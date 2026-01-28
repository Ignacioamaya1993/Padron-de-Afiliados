import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

/* =====================
   PARAMS
===================== */
const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) {
  Swal.fire("Error", "Afiliado no encontrado", "error");
  throw new Error("ID faltante");
}

let afiliado = null;
let modoEdicion = false;

/* =====================
   HELPERS
===================== */
function calcularEdad(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  const fn = new Date(fecha);
  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
  return edad;
}

function pasoEdadLimite(fechaNacimiento, edadLimite) {
  if (!fechaNacimiento) return true;

  const fn = new Date(fechaNacimiento);
  const fechaLimite = new Date(
    fn.getFullYear() + edadLimite,
    fn.getMonth(),
    fn.getDate()
  );

  return new Date() >= fechaLimite;
}

function calcularGrupoFamiliar(numeroAfiliado) {
  if (!numeroAfiliado) return "";
  const guionIndex = numeroAfiliado.indexOf("-");
  const slashIndex = numeroAfiliado.indexOf("/", guionIndex);
  if (guionIndex === -1 || slashIndex === -1) return numeroAfiliado;
  return numeroAfiliado.substring(guionIndex + 1, slashIndex);
}

function mostrarEstado(activo) {
  const estadoSpan = document.getElementById("estadoAfiliado");
  if (!estadoSpan) return;
  if (activo) {
    estadoSpan.textContent = "Activo";
    estadoSpan.style.color = "";
    estadoSpan.style.fontWeight = "normal";
  } else {
    estadoSpan.textContent = "Dado de baja";
    estadoSpan.style.color = "#dc2626";
    estadoSpan.style.fontWeight = "700";
  }
}

/* =====================
   CARGAR AFILIADO
===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase
    .from("afiliados")
    .select("*")
    .eq("id", afiliadoId)
    .single();

  if (error || !data) {
    Swal.fire("Error", "No se pudo cargar el afiliado", "error");
    return;
  }

  afiliado = data;
  afiliado.grupo_familiar_codigo = calcularGrupoFamiliar(afiliado.numero_afiliado);

  renderFicha();
  cargarGrupoFamiliar();
}

/* =====================
   RENDER FICHA
===================== */
function renderFicha() {
  modoEdicion = false;
  restaurarCampos();

  document.getElementById("nombreCompleto").textContent =
    `${afiliado.nombre} ${afiliado.apellido}`;

  function formatearFecha(fecha) {
    if (!fecha) return "-";
    const [yyyy, mm, dd] = fecha.split("-");
    return `${dd}/${mm}/${yyyy}`;
  }

  document.getElementById("fechaNacimiento").textContent =
    formatearFecha(afiliado.fecha_nacimiento);

  const edad = calcularEdad(afiliado.fecha_nacimiento);
  document.getElementById("edad").textContent =
    edad !== null ? `${edad} años` : "-";

  document.getElementById("telefono").textContent = afiliado.telefono || "-";
  document.getElementById("numeroAfiliado").textContent = afiliado.numero_afiliado || "-";
  document.getElementById("grupoFamiliar").textContent = afiliado.grupo_familiar_codigo || "-";
  document.getElementById("dni").textContent = afiliado.dni || "-";
  document.getElementById("parentesco").textContent = afiliado.parentesco || "-";
  document.getElementById("sexo").textContent = afiliado.sexo || "-";
  document.getElementById("plan").textContent = afiliado.plan || "-";
  document.getElementById("categoria").textContent = afiliado.categoria || "-";
  document.getElementById("localidad").textContent = afiliado.localidad || "-";
  document.getElementById("discapacidad").textContent = afiliado.discapacidad ? "Sí" : "No";

  const nivelField = document.getElementById("nivelDiscapacidadField");
  if (afiliado.discapacidad) {
    nivelField.style.display = "block";
    document.getElementById("nivelDiscapacidad").textContent = afiliado.nivel_discapacidad || "-";
  } else {
    nivelField.style.display = "none";
  }

  const estudiosField = document.getElementById("estudiosField");
  const cumplio21 = pasoEdadLimite(afiliado.fecha_nacimiento, 21); // CAMBIO
  const cumplio26 = pasoEdadLimite(afiliado.fecha_nacimiento, 26);

  if (afiliado.parentesco === "Hijos" && cumplio21 && !cumplio26) { // CAMBIO
    estudiosField.style.display = "block";
    document.getElementById("estudios").textContent = afiliado.estudios || "-";
  } else {
    estudiosField.style.display = "none";
  }

  mostrarEstado(afiliado.activo);
  toggleBotones(false);
  document.getElementById("btnEditar").style.display = afiliado.activo ? "inline-block" : "none";
  document.getElementById("btnBaja").style.display = afiliado.activo ? "inline-block" : "none";
  document.getElementById("btnReactivar").style.display = afiliado.activo ? "none" : "inline-block";

    /* =====================
      ADJUNTO ESTUDIOS - VISTA
    ===================== */
    const adjuntoField = document.getElementById("adjuntoEstudiosField");
    const adjuntoContenido = document.getElementById("adjuntoContenido");

  const mostrarAdjunto =
    afiliado.parentesco === "Hijos" &&
    pasoEdadLimite(afiliado.fecha_nacimiento, 21) &&
    !pasoEdadLimite(afiliado.fecha_nacimiento, 26);

    if (mostrarAdjunto) {
      adjuntoField.style.display = "block";

      if (afiliado.adjunto_alumno) {
        adjuntoContenido.innerHTML = `
          <a href="${afiliado.adjunto_alumno}" target="_blank">
            📎 Ver adjunto
          </a>
        `;
      } else {
        adjuntoContenido.textContent = "No hay adjunto cargado";
      }
    } else {
      adjuntoField.style.display = "none";
    }
}

/* =====================
   ACTUALIZAR EDAD / ESTUDIOS
===================== */
function actualizarEdadYEstudios() {

  if (!modoEdicion) return;

  const fechaInput = document.getElementById("fechaNacimiento");
  const parentescoSelect = document.getElementById("parentesco");
  const estudiosField = document.getElementById("estudiosField");

  const edad = fechaInput.value ? calcularEdad(fechaInput.value) : null;
  document.getElementById("edad").textContent =
    edad !== null ? `${edad} años` : "-";

  const cumplio21 = fechaInput.value
    ? pasoEdadLimite(fechaInput.value, 21)
    : false; // CAMBIO

  const cumplio26 = fechaInput.value
    ? pasoEdadLimite(fechaInput.value, 26)
    : true;

  if (parentescoSelect.value === "Hijos" && cumplio21 && !cumplio26) { // CAMBIO
    estudiosField.style.display = "block";
    convertirEstudiosASelect();
  } else {
    estudiosField.style.display = "none";
  }
}

function actualizarAdjuntoEdicion() {
  if (!modoEdicion) return;

  const adjuntoField = document.getElementById("adjuntoEstudiosField");
  const adjuntoContenido = document.getElementById("adjuntoContenido");

  const parentesco = document.getElementById("parentesco")?.value;
  const fechaNac = document.getElementById("fechaNacimiento")?.value;

  if (
    parentesco === "Hijos" &&
    fechaNac &&
    pasoEdadLimite(fechaNac, 21) &&
    !pasoEdadLimite(fechaNac, 26)
  ) {
    adjuntoField.style.display = "block";

    adjuntoContenido.innerHTML = `
      ${afiliado.adjunto_alumno
        ? `<a href="${afiliado.adjunto_alumno}" target="_blank">
            📎 Adjunto actual
          </a><br>`
        : ""
      }
      <input type="file" id="adjuntoAlumno" accept=".pdf,.jpg,.png" />
    `;
  } else {
    adjuntoField.style.display = "none";
    adjuntoContenido.innerHTML = "";
  }
}

/* =====================
   MODO EDICIÓN
===================== */
function entrarModoEdicion() {
  if (!afiliado.activo) return;
  modoEdicion = true;

  reemplazarPorInput("telefono", afiliado.telefono);
  reemplazarPorInput("fechaNacimiento", afiliado.fecha_nacimiento, "date");
  reemplazarPorInput("numeroAfiliado", afiliado.numero_afiliado);
  reemplazarPorInput("dni", afiliado.dni);

  reemplazarPorSelect("parentesco", ["Titular","Conyuge","Concubino/a","Hijos","Menor B/ guarda"], afiliado.parentesco);
  reemplazarPorSelect("sexo", ["F","M"], afiliado.sexo);
  reemplazarPorSelect("plan", ["Adherentes","Aport. Sol","Monotrib.","Pasiv Tram","Plan B-ESP","Plan joven","PMO"], afiliado.plan);
  reemplazarPorSelect("categoria", ["Adherentes","Jubilado ANSES","Jubilado conyuge AF. vivo","Jubilado tramite","Monotributista","Obligatorios","Opcion c/ convenio","Opcion s/ convenio","Pensionado ANSES reparto"], afiliado.categoria);
  reemplazarPorSelect("localidad", ["Espigas","Hinojo","Olavarria","Sierra Chica","Sierras Bayas"], afiliado.localidad);

  // Checkbox discapacidad
  reemplazarPorCheckbox("discapacidad", afiliado.discapacidad);

  // Mostrar nivel de discapacidad solo si checked
  const nivelField = document.getElementById("nivelDiscapacidadField");
  const dispCheckbox = document.getElementById("discapacidad");
  if (afiliado.discapacidad) {
    nivelField.style.display = "block";
    reemplazarPorSelect("nivelDiscapacidad", ["Permanente","Temporal"], afiliado.nivel_discapacidad);
  } else {
    nivelField.style.display = "none";
  }

  // Listener para mostrar/ocultar nivel de discapacidad dinámicamente
  dispCheckbox.addEventListener("change", () => {
    if (dispCheckbox.checked) {
      nivelField.style.display = "block";
      convertirNivelDiscapacidadASelect();
    } else {
      nivelField.style.display = "none";
    }
  });

  const fechaInput = document.getElementById("fechaNacimiento");
  const parentescoSelect = document.getElementById("parentesco");

  fechaInput.addEventListener("input", actualizarEdadYEstudios);
  parentescoSelect.addEventListener("change", actualizarEdadYEstudios);
  fechaInput.addEventListener("input", actualizarAdjuntoEdicion);
  parentescoSelect.addEventListener("change", actualizarAdjuntoEdicion);


  actualizarEdadYEstudios();
  toggleBotones(true);

    /* =====================
     ADJUNTO ESTUDIOS - EDICIÓN
  ===================== */
  const adjuntoField = document.getElementById("adjuntoEstudiosField");
  const adjuntoContenido = document.getElementById("adjuntoContenido");

  const fechaNac = document.getElementById("fechaNacimiento").value;

  if (
    document.getElementById("parentesco").value === "Hijos" &&
    pasoEdadLimite(fechaNac, 21) &&
    !pasoEdadLimite(fechaNac, 26)
  ) {

    adjuntoField.style.display = "block";

    adjuntoContenido.innerHTML = `
      ${afiliado.adjunto_alumno
        ? `<a href="${afiliado.adjunto_alumno}" target="_blank">
            📎 Adjunto actual
          </a><br>`
        : ""
      }
      <input type="file" id="adjuntoAlumno" accept=".pdf,.jpg,.png" />
    `;
  } else {
    adjuntoField.style.display = "none";
  }

  actualizarAdjuntoEdicion();
}

function convertirNivelDiscapacidadASelect() {
  const span = document.getElementById("nivelDiscapacidad");
  if (!span || span.tagName === "SELECT") return;
  const select = document.createElement("select");
  select.id = "nivelDiscapacidad";
  ["Permanente","Temporal"].forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (afiliado.nivel_discapacidad === op) o.selected = true;
    select.appendChild(o);
  });
  span.replaceWith(select);
}

/* =====================
   FUNCIONES COMUNES EDICIÓN
===================== */
function reemplazarPorInput(id, valor, tipo = "text") {
  const span = document.getElementById(id);
  if (!span) return;
  const input = document.createElement("input");
  input.type = tipo;
  input.id = id;
  input.value = valor || "";
  span.replaceWith(input);
}

function reemplazarPorSelect(id, opciones, valorActual) {
  const span = document.getElementById(id);
  if (!span) return;
  const select = document.createElement("select");
  select.id = id;
  opciones.forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (valorActual === op) o.selected = true;
    select.appendChild(o);
  });
  span.replaceWith(select);
}

function reemplazarPorCheckbox(id, valorActual) {
  const span = document.getElementById(id);
  if (!span) return;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = !!valorActual;
  span.replaceWith(input);
}

function convertirEstudiosASelect() {
  const actual = document.getElementById("estudios");
  if (!actual) return;
  if (actual.tagName === "SELECT") return;

  const select = document.createElement("select");
  select.id = "estudios";
  ["Posgrado", "Tercerio", "Universitario"].forEach(op => {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = op;
    if (afiliado.estudios === op) o.selected = true;
    select.appendChild(o);
  });

  actual.replaceWith(select);
}

function restaurarCampos() {
  ["telefono", "fechaNacimiento", "numeroAfiliado", "dni"].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === "INPUT") {
      const span = document.createElement("span");
      span.id = id;
      span.textContent = afiliado[id] || "-";
      el.replaceWith(span);
    }
  });

  ["parentesco","sexo","plan","categoria","localidad","discapacidad","nivelDiscapacidad"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT" || el.tagName === "INPUT") {
      const span = document.createElement("span");
      span.id = id;
      if(id === "discapacidad") span.textContent = afiliado.discapacidad ? "Sí" : "No";
      else if(id === "nivelDiscapacidad") span.textContent = afiliado.nivel_discapacidad || "-";
      else span.textContent = afiliado[id] || "-";
      el.replaceWith(span);
    }
  });

  const est = document.getElementById("estudios");
  if (est && est.tagName === "SELECT") {
    const span = document.createElement("span");
    span.id = "estudios";
    span.textContent = afiliado.estudios || "-";
    est.replaceWith(span);
  }
}

function toggleBotones(editando) {
  document.getElementById("btnEditar").style.display = editando ? "none" : "inline-block";
  document.getElementById("btnGuardar").style.display = editando ? "inline-block" : "none";
  document.getElementById("btnCancelar").style.display = editando ? "inline-block" : "none";
}

/* =====================
   GUARDAR CAMBIOS
===================== */
async function guardarCambios() {
  const telefono = document.getElementById("telefono").value || null;
  const fecha_nacimiento = document.getElementById("fechaNacimiento").value || null;
  const numero_afiliado = document.getElementById("numeroAfiliado").value;
  const dni = document.getElementById("dni").value;
  const parentesco = document.getElementById("parentesco")?.value || null;
  const sexo = document.getElementById("sexo")?.value || null;
  const plan = document.getElementById("plan")?.value || null;
  const categoria = document.getElementById("categoria")?.value || null;
  const localidad = document.getElementById("localidad")?.value || null;
  const discapacidad = document.getElementById("discapacidad")?.checked || false;
  const nivel_discapacidad = (discapacidad && document.getElementById("nivelDiscapacidad")?.value) || null;

  if (parentesco === "Hijos" && fecha_nacimiento) {
  const cumplio21 = pasoEdadLimite(fecha_nacimiento, 21);
  const cumplio26 = pasoEdadLimite(fecha_nacimiento, 26);

  const estudiosEl = document.getElementById("estudios");
  const estudios = estudiosEl?.value || null;

  if (!estudios && cumplio21) {
    Swal.fire(
      "No permitido",
      "Los hijos pueden afiliarse hasta el día que cumplen 21 años",
      "error"
    );
    return;
  }

  if (estudios && cumplio26) {
    Swal.fire(
      "No permitido",
      "Los hijos que estudian pueden afiliarse hasta el día que cumplen 26 años",
      "error"
    );
    return;
  }
}

  /* =====================
     ADJUNTO ESTUDIOS
  ===================== */
  let adjuntoAlumnoUrl = afiliado.adjunto_alumno;

  const fechaNac = fecha_nacimiento;
  const correspondeAdjunto =
    parentesco === "Hijos" &&
    fechaNac &&
    pasoEdadLimite(fechaNac, 21) &&
    !pasoEdadLimite(fechaNac, 26);

  // Si ya NO corresponde, lo limpiamos
  if (!correspondeAdjunto) {
    adjuntoAlumnoUrl = null;
  }

  // Si corresponde y subió uno nuevo, lo reemplazamos
  const adjuntoInput = document.getElementById("adjuntoAlumno");
  if (correspondeAdjunto && adjuntoInput && adjuntoInput.files.length > 0) {
    const file = adjuntoInput.files[0];
    adjuntoAlumnoUrl = await subirArchivoCloudinary(file);
  }


  const payload = {
    telefono,
    fecha_nacimiento,
    numero_afiliado,
    dni,
    parentesco,
    sexo,
    plan,
    categoria,
    localidad,
    discapacidad,
    nivel_discapacidad,
    grupo_familiar_codigo: calcularGrupoFamiliar(numero_afiliado),
    adjunto_alumno: adjuntoAlumnoUrl
  };

  const estudiosEl = document.getElementById("estudios");
  if (estudiosEl && estudiosEl.tagName === "SELECT") payload.estudios = estudiosEl.value;

  const { error } = await supabase.from("afiliados").update(payload).eq("id", afiliado.id);

  if (error) {
    Swal.fire("Error", error.message, "error");
    return;
  }

  Swal.fire("Guardado", "Cambios guardados", "success");
  cargarAfiliado();
}

/* =====================
   CANCELAR EDICIÓN
===================== */
function cancelarEdicion() {
  modoEdicion = false;
  cargarAfiliado();
}

/* =====================
   BAJA / REACTIVAR / ELIMINAR
===================== */
async function darDeBaja() {
  const res = await Swal.fire({
    title: "¿Dar de baja afiliado?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Dar de baja"
  });
  if (!res.isConfirmed) return;

  await supabase.from("afiliados").update({ activo: false }).eq("id", afiliado.id);
  cargarAfiliado();
}

async function reactivar() {
  const res = await Swal.fire({
    title: "¿Reactivar afiliado?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Reactivar"
  });
  if (!res.isConfirmed) return;

  await supabase.from("afiliados").update({ activo: true }).eq("id", afiliado.id);
  cargarAfiliado();
}

async function eliminarDefinitivo() {
  const res = await Swal.fire({
    title: "ELIMINAR DEFINITIVAMENTE",
    text: "Esta acción no se puede deshacer",
    icon: "error",
    showCancelButton: true,
    confirmButtonText: "Eliminar"
  });
  if (!res.isConfirmed) return;

  await supabase.from("afiliados").delete().eq("id", afiliado.id);
  window.location.href = "/pages/padron.html";
}

/* =====================
   GRUPO FAMILIAR
===================== */
async function cargarGrupoFamiliar() {
  if (!afiliado.grupo_familiar_codigo) return;

  const { data } = await supabase
    .from("afiliados")
    .select("id, nombre, apellido, dni, numero_afiliado, parentesco, activo")
    .eq("grupo_familiar_codigo", afiliado.grupo_familiar_codigo)
    .order("parentesco");

  const tbody = document.querySelector("#tablaGrupoFamiliar tbody");
  tbody.innerHTML = "";

  if (!data || data.length === 0) return;

  data.forEach(a => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    if (a.id === afiliado.id) {
      tr.style.background = "#e0f2fe";
      tr.style.fontWeight = "600";
    }

    tr.innerHTML = `
      <td>${a.nombre} ${a.apellido}</td>
      <td>${a.dni}</td>
      <td>${a.numero_afiliado}</td>
      <td>${a.parentesco}</td>
      <td>${a.activo ? "Activo" : "Dado de baja"}</td>
    `;

    tr.onclick = () => {
      window.location.href = `/pages/afiliado.html?id=${a.id}`;
    };

    tbody.appendChild(tr);
  });
}

/* =====================
   EVENTOS
===================== */
document.getElementById("btnEditar").onclick = entrarModoEdicion;
document.getElementById("btnGuardar").onclick = guardarCambios;
document.getElementById("btnCancelar").onclick = cancelarEdicion;
document.getElementById("btnBaja").onclick = darDeBaja;
document.getElementById("btnEliminar").onclick = eliminarDefinitivo;
document.getElementById("btnReactivar").onclick = reactivar;

/* =====================
   BOTÓN VOLVER AL BUSCADOR
===================== */
document.getElementById("btnVolver").onclick = () => {
  window.location.href = "/pages/padron.html";
};

/* =====================
   CERRAR MODO EDICIÓN CON ESCAPE
===================== */
document.addEventListener("keydown", (e) => {
  if (modoEdicion && e.key === "Escape") cancelarEdicion();
});

/* ================= Botón Ficha Médica ================= */
document.getElementById("btnFichaMedica").onclick = () => {
  window.location.href = `/pages/fichaMedica.html?id=${afiliadoId}`;
};
  
await cargarHeader(); 

/* =====================
   INIT
===================== */
cargarAfiliado();