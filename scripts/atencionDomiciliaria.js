import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

export async function init(afiliadoId) {
  if (!afiliadoId) {
    Swal.fire("Error", "Afiliado no encontrado", "error");
    throw new Error("ID afiliado faltante");
  }

  await cargarHeader();

  // =====================
// PARAMETRO DESTACAR DESDE NOTIFICACION
// =====================
const params = new URLSearchParams(window.location.search);
const registroADestacar = params.get("registro")
  ? Number(params.get("registro"))
  : null;

  // =====================
  // ESTADO
  // =====================
  let paginaActual = 0;
  const POR_PAGINA = 10;
  let archivosAdjuntos = [];

  // =====================
  // ELEMENTOS
  // =====================
  const form = document.getElementById("formAtencionDomiciliaria");
  const btnNuevo = document.getElementById("btnNuevaAtencion");
  const btnCancelar = document.getElementById("btnCancelarAtencion");
  const lista = document.getElementById("listaAtencionDomiciliaria");
  const adjuntosContainer = document.getElementById("adjuntosAtencionContainer");
  const btnAgregarAdjunto = document.getElementById("btnAgregarAdjuntoAtencion");
  const campoReintegro = form.querySelector(".campo-reintegro");

  // =====================
  // FUNCION CARGAR TIPOS DE ATENCIÓN
  // =====================
  let tiposAtencion = [];
  async function cargarTiposAtencion() {
    const { data, error } = await supabase
      .from("tipo_atencion_domiciliaria")
      .select("*")
      .order("nombre", { ascending: true });

    if (error) {
      console.error("Error cargando tipos de atención:", error);
      return;
    }

    tiposAtencion = data;

    // Limpiar y popular el select
    const select = form.tipo_atencion_id;
    select.innerHTML = `<option value="">Seleccionar</option>`;
    tiposAtencion.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nombre;
      select.appendChild(opt);
    });
  }

  // =====================
  // ADJUNTOS
  // =====================
  function resetAdjuntos() {
    archivosAdjuntos = [];
    adjuntosContainer.innerHTML = "";
    agregarAdjuntoInput(true);
  }

  function agregarAdjuntoInput(obligatorio = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "adjunto-item";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.png";
    input.addEventListener("change", () => {
      wrapper.archivo = input.files[0] || null;
    });
    wrapper.archivo = null;
    archivosAdjuntos.push(wrapper);
    wrapper.appendChild(input);

    if (!obligatorio) {
      const btnX = document.createElement("button");
      btnX.type = "button";
      btnX.textContent = "✖";
      btnX.className = "btn-eliminar-adjunto";
      btnX.addEventListener("click", () => {
        archivosAdjuntos.splice(archivosAdjuntos.indexOf(wrapper), 1);
        wrapper.remove();
      });
      wrapper.appendChild(btnX);
    }

    adjuntosContainer.appendChild(wrapper);
  }

  btnAgregarAdjunto.addEventListener("click", () => agregarAdjuntoInput(false));

  // =====================
  // CARGAR LISTADO
  // =====================
  async function cargarAtenciones() {
    const desde = paginaActual * POR_PAGINA;
    const hasta = desde + POR_PAGINA - 1;

    const { data: registros, error, count } = await supabase
      .from("atencion_domiciliaria")
      .select("*", { count: "exact" })
      .eq("afiliado_id", afiliadoId)
      .order("fecha_inicio_periodo", { ascending: false })
      .range(desde, hasta);

    if (error) {
      console.error(error);
      return;
    }

    lista.innerHTML = "";
    renderPaginacion(count);
    if (!registros.length) return;

    const ids = registros.map(r => r.id);

    const { data: docs } = await supabase
      .from("fichamedica_documentos")
      .select("*")
      .eq("tipo_documento", "atencionDomiciliaria")
      .in("entidad_relacion_id", ids);

    const docsPorRegistro = {};
    docs.forEach(d => {
      if (!docsPorRegistro[d.entidad_relacion_id]) docsPorRegistro[d.entidad_relacion_id] = [];
      docsPorRegistro[d.entidad_relacion_id].push(d);
    });

    const fISO = d => (d ? d.split("T")[0] : "");

    // =====================
// SI EL REGISTRO ESTA EN OTRA PAGINA
// =====================
if (registroADestacar) {
  const posicion = await obtenerPosicionAtencion(registroADestacar);

  if (posicion !== null) {
    const paginaCorrecta = Math.floor(posicion / POR_PAGINA);

    if (paginaCorrecta !== paginaActual) {
      paginaActual = paginaCorrecta;
      await cargarAtenciones();
      return;
    }
  }
}

    for (const r of registros) {
      const documentos = docsPorRegistro[r.id] || [];

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = r.id;

  const tipoNombre = tiposAtencion.find(t => t.id === r.tipo_atencion_id)?.nombre || "Sin tipo";

card.innerHTML = `
  <strong <div class="card-titulo-atencion">
    ${tipoNombre}
  </div>
  </strong>

  <div class="grid-fechas">
    <div>
      <label>Fecha carga</label>
      <input type="date" name="fecha_carga" readonly value="${fISO(r.fecha_carga)}">
    </div>
    <div>
      <label>Fecha inicio período</label>
      <input type="date" name="fecha_inicio_periodo" readonly value="${fISO(r.fecha_inicio_periodo)}">
    </div>
    <div>
      <label>Fecha fin período</label>
      <input type="date" name="fecha_fin_periodo" readonly value="${fISO(r.fecha_fin_periodo)}">
    </div>
    <div>
      <label>Reintegro</label>
      <input type="number" name="reintegro" value="${r.reintegro ?? ''}" step="0.01" readonly>
    </div>
  </div>

  <button type="button" class="toggle-card">Ver más</button>

  <div class="card-extra">

    <div>
      <label>Fecha reintegro</label>
      <input type="date" name="fecha_reintegro" readonly value="${fISO(r.fecha_reintegro)}">
    </div>

    <div>
      <label>Observación</label>
      <textarea name="observacion" readonly>${r.observacion || "Sin observaciones"}</textarea>
    </div>

    ${documentos.length ? `<div class="adjuntos-card">
      ${documentos.map(d => `
        <div class="adjunto-item" data-doc-id="${d.id}">
          <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
          <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
        </div>`).join("")}
    </div>` : ""}

  </div>

  <div class="acciones">
    <button class="editar">✏️ Editar</button>
    <button class="eliminar">🗑️ Eliminar</button>
    <button class="guardar hidden">💾 Guardar</button>
    <button class="cancelar hidden">Cancelar</button>
  </div>
`;

// =====================
// DESTACAR SI VIENE DE NOTIFICACION
// =====================
if (registroADestacar && r.id === registroADestacar) {

  setTimeout(() => {
    card.classList.add("card-destacada");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
}

      lista.appendChild(card);
    }
  }

  async function obtenerPosicionAtencion(idBuscado) {

  const { data, error } = await supabase
    .from("atencion_domiciliaria")
    .select("id")
    .eq("afiliado_id", afiliadoId)
    .order("fecha_inicio_periodo", { ascending: false });

  if (error || !data) return null;

  return data.findIndex(r => r.id === idBuscado);
}

// =====================
// ACCIONES CARD
// =====================
lista.addEventListener("click", async e => {
  const card = e.target.closest(".card");
  if (!card) return;
  const id = card.dataset.id;
  const fISO = d => (d ? d.split("T")[0] : "");

// =====================
// VER MAS / MENOS
// =====================
if (e.target.classList.contains("toggle-card")) {

  const btnToggle = e.target;
  const extra = card.querySelector(".card-extra");
  const acciones = card.querySelector(".acciones");

  const estaAbierta = card.classList.contains("expandida");

  if (estaAbierta) {
    // 🔹 Cerrar
    card.classList.remove("expandida");
    btnToggle.textContent = "Ver más";

    // 🔹 Volver el botón debajo del grid
    const grid = card.querySelector(".grid-fechas");
    grid.insertAdjacentElement("afterend", btnToggle);

  } else {
    // 🔹 Abrir
    card.classList.add("expandida");
    btnToggle.textContent = "Ver menos";

    // 🔹 Mover botón arriba de acciones
    card.insertBefore(btnToggle, acciones);
  }

  return;
}

// =====================
// EDITAR
// =====================
if (e.target.classList.contains("editar")) {

  const btnToggle = card.querySelector(".toggle-card");
  const acciones = card.querySelector(".acciones");

  // 🔹 Forzar expansión
  if (!card.classList.contains("expandida")) {
    card.classList.add("expandida");
    btnToggle.textContent = "Ver menos";
  }

  // 🔹 Habilitar campos
  card.querySelectorAll("input, textarea").forEach(el => {
    el.removeAttribute("readonly");
  });

  card.querySelectorAll(".btn-eliminar-adjunto")
      .forEach(btn => btn.classList.remove("hidden"));

  card.querySelector(".guardar").classList.remove("hidden");
  card.querySelector(".cancelar").classList.remove("hidden");
  card.querySelector(".editar").classList.add("hidden");
  card.querySelector(".eliminar").classList.add("hidden");

  // =========================
  // ADJUNTOS NUEVOS
  // =========================

  if (!card.querySelector(".adjuntos-nuevos-card")) {
    const contenedor = document.createElement("div");
    contenedor.className = "adjuntos-nuevos-card";
    card.insertBefore(contenedor, acciones);
  }

  if (!card.querySelector(".btn-agregar-adjunto-card")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-agregar-adjunto-card";
    btn.textContent = "➕ Agregar adjunto";
    card.insertBefore(btn, acciones);
  }

  // =========================
  // MOVER TOGGLE AL FINAL
  // =========================

  card.insertBefore(btnToggle, acciones);
}

  // =====================
  // CANCELAR
  // =====================
  if (e.target.classList.contains("cancelar")) {
    cargarAtenciones();
  }

  // =====================
  // GUARDAR
  // =====================
if (e.target.classList.contains("guardar")) {
  const btnGuardar = e.target;

  btnGuardar.disabled = true;
  btnGuardar.textContent = "⌛ Guardando...";
  btnGuardar.style.backgroundColor = "#aaa";
  btnGuardar.style.cursor = "not-allowed";

  try {
    const datosUpdate = {
      fecha_carga: card.querySelector("[name='fecha_carga']").value,
      fecha_inicio_periodo: card.querySelector("[name='fecha_inicio_periodo']").value,
      fecha_fin_periodo: card.querySelector("[name='fecha_fin_periodo']").value,
      reintegro: card.querySelector("[name='reintegro']").value
        ? parseFloat(card.querySelector("[name='reintegro']").value)
        : null,
      fecha_reintegro: card.querySelector("[name='fecha_reintegro']").value || null,
      observacion: card.querySelector("[name='observacion']").value || null
    };

    await supabase.from("atencion_domiciliaria").update(datosUpdate).eq("id", id);

    Swal.fire("Guardado", "Cambios guardados correctamente", "success");
    cargarAtenciones();

  } catch (error) {
    Swal.fire("Error", "No se pudo guardar", "error");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "💾 Guardar";
    btnGuardar.style.backgroundColor = "";
    btnGuardar.style.cursor = "";
  }
}

  // =====================
  // ELIMINAR CARD
  // =====================
// =====================
// ELIMINAR CARD
// =====================
if (e.target.classList.contains("eliminar")) {

  const confirmar = await Swal.fire({
    title: "¿Está seguro?",
    text: "Se eliminará esta atención domiciliaria y todos sus adjuntos.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!confirmar.isConfirmed) return;

  await supabase
    .from("atencion_domiciliaria")
    .delete()
    .eq("id", id);

  await Swal.fire({
    icon: "success",
    title: "Eliminado",
    text: "Atención domiciliaria fue eliminada correctamente",
    confirmButtonText: "OK"
  });

  cargarAtenciones();
}

  // =====================
  // AGREGAR ADJUNTO NUEVO EN EDICIÓN
  // =====================
  if (e.target.classList.contains("btn-agregar-adjunto-card")) {
    const contenedor = card.querySelector(".adjuntos-nuevos-card");

    const wrapper = document.createElement("div");
    wrapper.className = "adjunto-item";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.png";
    wrapper.appendChild(input);

    const btnX = document.createElement("button");
    btnX.type = "button";
    btnX.textContent = "✖";
    btnX.className = "btn-eliminar-adjunto";
    btnX.addEventListener("click", () => wrapper.remove());
    wrapper.appendChild(btnX);

    contenedor.appendChild(wrapper);
  }

  // =====================
  // ELIMINAR ADJUNTO EXISTENTE
  // =====================
  if (e.target.classList.contains("btn-eliminar-adjunto")) {
    const adjuntoDiv = e.target.closest(".adjunto-item");
    const docId = adjuntoDiv.dataset.docId;
    if (docId) {
      // Eliminar de la base si ya existe
      await supabase.from("fichamedica_documentos").delete().eq("id", docId);
    }
    adjuntoDiv.remove();
  }
});

  // =====================
  // PAGINACIÓN
  // =====================
  function renderPaginacion(total) {
    const contenedor = document.getElementById("paginacionAtencionDomiciliaria");
    contenedor.innerHTML = "";

    const totalPaginas = Math.ceil(total / POR_PAGINA);

    const btnAnterior = document.createElement("button");
    btnAnterior.textContent = "⬅ Anterior";
    btnAnterior.disabled = paginaActual === 0;
    btnAnterior.onclick = () => { paginaActual--; cargarAtenciones(); };

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;
    btnSiguiente.onclick = () => { paginaActual++; cargarAtenciones(); };

    const info = document.createElement("span");
    info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas} `;

    contenedor.append(btnAnterior, info, btnSiguiente);
  }

  // =====================
  // FORM NUEVO
  // =====================
  btnNuevo.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    campoReintegro.classList.add("hidden");
    form.classList.toggle("hidden");
  });

  btnCancelar.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    campoReintegro.classList.add("hidden");
    form.classList.add("hidden");
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const btnSubmit = form.querySelector("button[type='submit']");
btnSubmit.disabled = true;
btnSubmit.textContent = "⌛ Guardando...";
btnSubmit.style.backgroundColor = "#aaa";
btnSubmit.style.cursor = "not-allowed";

    const datos = {
      afiliado_id: afiliadoId,
      tipo_atencion_id: form.tipo_atencion_id.value,
      fecha_carga: form.fecha_carga.value,
      fecha_inicio_periodo: form.fecha_inicio_periodo.value,
      fecha_fin_periodo: form.fecha_fin_periodo.value,
      observacion: form.observacion.value || null,
      reintegro: null,
      fecha_reintegro: null
    };

    const { data } = await supabase.from("atencion_domiciliaria").insert(datos).select().single();

    for (const adj of archivosAdjuntos) {
      if (!adj.archivo) continue;
      const url = await subirArchivoCloudinary(adj.archivo);
      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "atencionDomiciliaria",
        entidad_relacion_id: data.id,
        nombre_archivo: adj.archivo.name,
        url
      });
    }

    form.reset();
    resetAdjuntos();
    campoReintegro.classList.add("hidden");
    form.classList.add("hidden");
    cargarAtenciones();
    Swal.fire("Guardado", "Atencion domiciliaria guardado correctamente", "success");

    btnSubmit.disabled = false;
    btnSubmit.textContent = "Guardar";
    btnSubmit.style.backgroundColor = "";
    btnSubmit.style.cursor = "";
      });

  // =====================
  // INIT
  // =====================
  await cargarTiposAtencion();
  resetAdjuntos();
  cargarAtenciones();
}
