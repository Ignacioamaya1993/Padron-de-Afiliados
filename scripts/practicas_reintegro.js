import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

export async function init(afiliadoId) {

  await cargarHeader();

  // 🔹 Obtener número de afiliado para carpeta
const { data: afiliado } = await supabase
  .from("afiliados")
  .select("numero_afiliado")
  .eq("id", afiliadoId)
  .single();

const carpetaBase = afiliado?.numero_afiliado
  ? `afiliados/${afiliado.numero_afiliado}/practicas_reintegro`
  : "afiliados/sin_numero/practicas_reintegro";

  let paginaActual = 0;
  const POR_PAGINA = 10;
  let archivosAdjuntos = [];

  const btnNuevo = document.getElementById("btnNuevaPracticaReintegro");
  const btnCancelar = document.getElementById("btnCancelarPracticaReintegro");
  const form = document.getElementById("formPracticaReintegro");
  const lista = document.getElementById("listaPracticasReintegro");
  const paginacion = document.getElementById("paginacionPracticasReintegro");
  const adjuntosContainer = document.getElementById("adjuntosPracticasContainer");
  const btnAgregarAdjunto = document.getElementById("btnAgregarAdjuntoPracticaReintegro");
  const tipoSelect = document.getElementById("tipoPracticaSelect");

  const campoReintegro = form.querySelector(".prx-campo-reintegro");

  /* ===================== CARGAR TIPOS ===================== */

  async function cargarTipos() {
    const { data } = await supabase
      .from("tipo_practicasxreintegro")
      .select("id, nombre")
      .order("nombre");

    tipoSelect.innerHTML = `<option value="">Seleccione...</option>`;
    data?.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nombre;
      tipoSelect.appendChild(opt);
    });
  }

  /* ===================== ADJUNTOS NUEVO ===================== */

  function resetAdjuntos() {
    archivosAdjuntos = [];
    adjuntosContainer.innerHTML = "";
    agregarAdjuntoInput(true);
  }

  function agregarAdjuntoInput(obligatorio = false) {

    const wrapper = document.createElement("div");
    wrapper.className = "prx-adjunto-item";

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
      const btnEliminar = document.createElement("button");
      btnEliminar.type = "button";
      btnEliminar.textContent = "✖";
      btnEliminar.onclick = () => {
        archivosAdjuntos = archivosAdjuntos.filter(a => a !== wrapper);
        wrapper.remove();
      };
      wrapper.appendChild(btnEliminar);
    }

    adjuntosContainer.appendChild(wrapper);
  }

  if (btnAgregarAdjunto) {
    btnAgregarAdjunto.addEventListener("click", () => agregarAdjuntoInput(false));
  }

  /* ===================== CARGAR REGISTROS ===================== */

  async function cargarPracticas() {

    const { data, count } = await supabase
      .from("practicas_reintegro")
      .select(`*, tipo_practicasxreintegro ( nombre )`, { count: "exact" })
      .eq("afiliado_id", afiliadoId)
      .order("fecha_carga", { ascending: false })
      .range(
        paginaActual * POR_PAGINA,
        paginaActual * POR_PAGINA + POR_PAGINA - 1
      );

    lista.innerHTML = "";
    renderPaginacion(count);

    if (!data?.length) return;

    const ids = data.map(r => r.id);

    const { data: docs } = await supabase
      .from("fichamedica_documentos")
      .select("*")
      .eq("tipo_documento", "practicas_reintegro")
      .in("entidad_relacion_id", ids);

    const docsPorRegistro = {};
    docs?.forEach(d => {
      if (!docsPorRegistro[d.entidad_relacion_id])
        docsPorRegistro[d.entidad_relacion_id] = [];
      docsPorRegistro[d.entidad_relacion_id].push(d);
    });

    const fISO = d => d ? d.split("T")[0] : "";

    for (const r of data) {

      const documentos = docsPorRegistro[r.id] || [];
      const tipoNombre = r.tipo_practicasxreintegro?.nombre || "Sin tipo";

      const card = document.createElement("div");
      card.className = "prx-card";
      card.dataset.id = r.id;

card.innerHTML = `

  <div class="prx-header">
    <h4 class="prx-titulo">${tipoNombre}</h4>
  </div>

  <!-- CONTENIDO SIEMPRE VISIBLE -->
  <div class="prx-grid-fechas">

    <div class="prx-field">
      <label>Fecha carga</label>
      <input type="date" name="fecha_carga" readonly value="${fISO(r.fecha_carga)}">
    </div>

    <div class="prx-field">
      <label>Fecha prescripción</label>
      <input type="date" name="fecha_prescripcion" readonly value="${fISO(r.fecha_prescripcion)}">
    </div>

    <div class="prx-field">
      <label>Fecha vencimiento</label>
      <input type="date" name="fecha_vencimiento" readonly value="${fISO(r.fecha_vencimiento)}">
    </div>

    <div class="prx-field">
      <label>Reintegro</label>
      <input type="number" name="reintegro" readonly value="${r.reintegro ?? ''}">
    </div>

  </div>

  <button type="button" class="prx-toggle">Ver más</button>

  <!-- EXPANDIBLE -->
  <div class="prx-extra">

    <div class="prx-grid-fechas">

      <div class="prx-field">
        <label>Fecha reintegro</label>
        <input type="date" name="fecha_reintegro" readonly value="${fISO(r.fecha_reintegro)}">
      </div>

    </div>

      <div class="prx-field prx-full">
        <label>Observación</label>
      <textarea name="observacion" readonly placeholder="Sin observaciones">
      ${r.observacion || ""}
      </textarea>
          </div>

    ${documentos.length ? `
      <div class="prx-adjuntos-card">
        <label>Adjuntos</label>
        ${documentos.map(d => `
          <div class="prx-adjunto-item" data-doc-id="${d.id}">
            <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
            <button type="button" class="prx-btn-eliminar-adjunto hidden">✖</button>
          </div>
        `).join("")}
      </div>
    ` : ""}

  </div>

  <!-- EDICIÓN ADJUNTOS -->
  <div class="prx-adjuntos-edicion hidden">
    <button type="button" class="prx-btn-agregar-adjunto-card">
      ➕ Agregar adjunto
    </button>
    <div class="prx-adjuntos-nuevos"></div>
  </div>

  <div class="prx-acciones">
    <button class="prx-editar">✏️ Editar</button>
    <button class="prx-eliminar">🗑️ Eliminar</button>
    <button class="prx-guardar hidden">💾 Guardar</button>
    <button class="prx-cancelar hidden">Cancelar</button>
  </div>
`;

      lista.appendChild(card);

      const btnToggle = card.querySelector(".prx-toggle");
      const btnEditar = card.querySelector(".prx-editar");
      const btnGuardar = card.querySelector(".prx-guardar");
      const btnCancelarCard = card.querySelector(".prx-cancelar");
      const btnEliminar = card.querySelector(".prx-eliminar");
      const btnAgregarAdjuntoCard = card.querySelector(".prx-btn-agregar-adjunto-card");
      const nuevosAdjuntosContainer = card.querySelector(".prx-adjuntos-nuevos");

      const inputs = card.querySelectorAll("input, textarea");

      /* VER MÁS */
btnToggle.addEventListener("click", () => {

  const expandida = card.classList.toggle("expandida");

  btnToggle.textContent = expandida ? "Ver menos" : "Ver más";

  const acciones = card.querySelector(".prx-acciones");

  if (expandida) {
    // mover botón arriba de acciones
    acciones.parentNode.insertBefore(btnToggle, acciones);
  } else {
    // devolver botón arriba del bloque extra
    const grid = card.querySelector(".prx-grid-fechas");
    grid.after(btnToggle);
  }
});

/* EDITAR */
let nuevosAdjuntos = [];

btnEditar.addEventListener("click", () => {

  // Si no está expandida, expandir
  if (!card.classList.contains("expandida")) {
    card.classList.add("expandida");
  }

  // Siempre que esté expandida, asegurar posición correcta del botón
  btnToggle.textContent = "Ver menos";
  const acciones = card.querySelector(".prx-acciones");
  acciones.parentNode.insertBefore(btnToggle, acciones);

  // Agregar clase modo-edicion al card (para CSS)
  card.classList.add("modo-edicion");

  // Habilitar campos
  inputs.forEach(i => i.removeAttribute("readonly"));

  // Mostrar eliminar adjuntos existentes
  card.querySelectorAll(".prx-btn-eliminar-adjunto")
      .forEach(b => b.classList.remove("hidden"));

  // Mostrar sección agregar adjunto
  card.querySelector(".prx-adjuntos-edicion")
      .classList.remove("hidden");

  // Cambiar botones
  btnEditar.classList.add("hidden");
  btnEliminar.classList.add("hidden");
  btnGuardar.classList.remove("hidden");
  btnCancelarCard.classList.remove("hidden");
});

// CANCELAR: quitar clase modo-edicion
btnCancelarCard.addEventListener("click", () => {
  card.classList.remove("modo-edicion");
  cargarPracticas();
});

      btnCancelarCard.addEventListener("click", () => cargarPracticas());

      /* ELIMINAR CARD */
      btnEliminar.addEventListener("click", async () => {

        const confirm = await Swal.fire({
          title: '¿Está seguro?',
          text: "Se eliminará esta práctica y sus adjuntos.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Sí, eliminar"
        });

        if (!confirm.isConfirmed) return;

        await supabase.from("practicas_reintegro")
          .delete()
          .eq("id", r.id);

        Swal.fire(
          'Eliminado',
          'La practica fue eliminado correctamente.',
          'success'
        );

        cargarPracticas();
      });

      /* AGREGAR NUEVO ADJUNTO */
      btnAgregarAdjuntoCard.addEventListener("click", () => {

        const wrapper = document.createElement("div");
        wrapper.className = "prx-adjunto-item";

        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".pdf,.jpg,.png";

        input.addEventListener("change", () => {
          wrapper.archivo = input.files[0] || null;
        });

        wrapper.archivo = null;
        nuevosAdjuntos.push(wrapper);

        const btnX = document.createElement("button");
        btnX.textContent = "✖";
        btnX.type = "button";
        btnX.onclick = () => wrapper.remove();

        wrapper.append(input, btnX);
        nuevosAdjuntosContainer.appendChild(wrapper);
      });

      card.querySelectorAll(".prx-btn-eliminar-adjunto")
  .forEach(btn => {
    btn.addEventListener("click", async () => {

      const docId = btn.closest(".prx-adjunto-item").dataset.docId;

      await supabase
        .from("fichamedica_documentos")
        .delete()
        .eq("id", docId);

      btn.closest(".prx-adjunto-item").remove();
    });
  });

      /* GUARDAR */
      btnGuardar.addEventListener("click", async () => {

        btnGuardar.disabled = true;
        btnGuardar.textContent = "⌛ Guardando...";

        try {

          const updated = {
            fecha_carga: inputs[0].value,
            fecha_prescripcion: inputs[1].value || null,
            fecha_vencimiento: inputs[2].value || null,
            reintegro: inputs[3].value || null,
            fecha_reintegro: inputs[4].value || null,
            observacion: card.querySelector("textarea").value || null
          };

          await supabase
            .from("practicas_reintegro")
            .update(updated)
            .eq("id", r.id);

          for (const adj of nuevosAdjuntos) {
            if (!adj.archivo) continue;

            const url = await subirArchivoCloudinary(adj.archivo, carpetaBase);

            await supabase.from("fichamedica_documentos").insert({
              afiliado_id: afiliadoId,
              tipo_documento: "practicas_reintegro",
              entidad_relacion_id: r.id,
              nombre_archivo: adj.archivo.name,
              url
            });
          }

    Swal.fire({
      icon: "success",
      title: "Guardado",
      text: "Cambios guardados correctamente",
      confirmButtonText: "OK"
    });
    
    cargarPracticas();

        } finally {
          btnGuardar.disabled = false;
          btnGuardar.textContent = "💾 Guardar";
        }
      });
    }
  }

  /* ===================== NUEVO ===================== */

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const btn = form.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "Guardando...";

    try {

      const inputReintegro = form.querySelector("[name='reintegro']");
      const inputFechaReintegro = form.querySelector("[name='fecha_reintegro']");

      const datos = {
        afiliado_id: afiliadoId,
        fecha_carga: form.fecha_carga.value,
        fecha_prescripcion: form.fecha_prescripcion.value || null,
        fecha_vencimiento: form.fecha_vencimiento.value || null,
        tipo_practica_id: tipoSelect.value || null,
        observacion: form.observacion.value || null,
        reintegro: inputReintegro?.value
          ? parseFloat(inputReintegro.value)
          : null,
        fecha_reintegro: inputFechaReintegro?.value || null
      };

      const { data } = await supabase
        .from("practicas_reintegro")
        .insert(datos)
        .select()
        .single();

      for (const adj of archivosAdjuntos) {
        if (!adj.archivo) continue;

        const url = await subirArchivoCloudinary(adj.archivo, carpetaBase);

        await supabase.from("fichamedica_documentos").insert({
          afiliado_id: afiliadoId,
          tipo_documento: "practicas_reintegro",
          entidad_relacion_id: data.id,
          nombre_archivo: adj.archivo.name,
          url
        });
      }

      await     Swal.fire({
      icon: 'success',
      title: 'Guardado',
      text: 'Practica reintegro cargado correctamente',
      confirmButtonText: 'OK'
    });

      form.reset();
      resetAdjuntos();
      form.classList.add("hidden");
      cargarPracticas();

    } finally {
      btn.disabled = false;
      btn.textContent = "💾 Guardar";
    }
  });

  btnNuevo.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    campoReintegro.classList.remove("hidden");
    form.classList.toggle("hidden");
  });

  btnCancelar.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
  });

  function renderPaginacion(total) {
    paginacion.innerHTML = "";
const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

    const btnAnterior = document.createElement("button");
    btnAnterior.textContent = "⬅ Anterior";
    btnAnterior.disabled = paginaActual === 0;
    btnAnterior.onclick = () => { paginaActual--; cargarPracticas(); };

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;
    btnSiguiente.onclick = () => { paginaActual++; cargarPracticas(); };

    const info = document.createElement("span");
    info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas} `;

    paginacion.append(btnAnterior, info, btnSiguiente);
  }

  resetAdjuntos();
  await cargarTipos();
  cargarPracticas();
}