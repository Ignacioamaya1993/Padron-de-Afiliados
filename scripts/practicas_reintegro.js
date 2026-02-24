import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

export async function init(afiliadoId) {

  await cargarHeader();

  let paginaActual = 0;
  const POR_PAGINA = 10;
  let archivosAdjuntos = [];

  const btnNuevo = document.getElementById("btnNuevaPracticaReintegro");
  const btnCancelar = document.getElementById("btnCancelarPracticaReintegro");
  const form = document.getElementById("formPracticaReintegro");
  const lista = document.getElementById("listaPracticasReintegro");
  const paginacion = document.getElementById("paginacionPracticasReintegro");
  const adjuntosContainer = document.getElementById("adjuntosPracticasContainer");
  const btnAgregarAdjunto = document.getElementById("btnAgregarAdjuntoPractica");
  const tipoSelect = document.getElementById("tipoPracticaSelect");

  const campoReintegro = form.querySelector(".prx-campo-reintegro");

  /* =====================
     CARGAR TIPOS
  ===================== */
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

  /* =====================
     ADJUNTOS
  ===================== */
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
      btnEliminar.className = "prx-btn-eliminar-adjunto";
      btnEliminar.onclick = () => wrapper.remove();
      wrapper.appendChild(btnEliminar);
    }

    adjuntosContainer.appendChild(wrapper);
  }

  btnAgregarAdjunto.addEventListener("click", () => agregarAdjuntoInput(false));

  /* =====================
     CARGAR REGISTROS
  ===================== */
  async function cargarPracticas() {

    const { data, count } = await supabase
      .from("practicas_reintegro")
      .select("*", { count: "exact" })
      .eq("afiliado_id", afiliadoId)
      .order("fecha_carga", { ascending: false })
      .range(paginaActual * POR_PAGINA, paginaActual * POR_PAGINA + POR_PAGINA - 1);

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

      const card = document.createElement("div");
      card.className = "prx-card";
      card.dataset.id = r.id;

      const opcionesTipo = tipoSelect.innerHTML;

      card.innerHTML = `
        <div class="prx-grid-fechas">
          <div class="prx-field"><label>Fecha carga</label><input type="date" readonly value="${fISO(r.fecha_carga)}"></div>
          <div class="prx-field"><label>Fecha prescripción</label><input type="date" readonly value="${fISO(r.fecha_prescripcion)}"></div>
          <div class="prx-field"><label>Fecha vencimiento</label><input type="date" readonly value="${fISO(r.fecha_vencimiento)}"></div>
                      <div class="prx-field">
      <label>Tipo</label>
      <select class="prx-tipo-select" disabled>
        ${opcionesTipo}
      </select>
    </div>
        </div>

        <div class="prx-campo-reintegro">
          <div class="prx-field">
            <label>Reintegro</label>
            <input type="number" value="${r.reintegro ?? ''}" readonly>
          </div>
          <div class="prx-field">
            <label>Fecha reintegro</label>
            <input type="date" value="${fISO(r.fecha_reintegro)}" readonly>
          </div>
        </div>

        <div class="prx-field">
          <label>Observación</label>
          <textarea readonly>${r.observacion || ""}</textarea>
        </div>

                      ${documentos.length ? `
      <div class="prx-adjuntos-card">
        ${documentos.map(d => `
          <div class="prx-adjunto-item" data-doc-id="${d.id}">
            <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
            <button class="prx-eliminar-doc hidden">✖</button>
          </div>
        `).join("")}
      </div>

              <div class="prx-adjuntos-edicion hidden">
        <button class="prx-agregar-adjunto-card">➕ Agregar adjunto</button>
        <div class="prx-nuevos-adjuntos"></div>
      </div>

        ` : ""}

        <div class="acciones">
          <button class="prx-editar">✏️ Editar</button>
          <button class="prx-eliminar">🗑️ Eliminar</button>
          <button class="prx-guardar hidden">💾 Guardar</button>
          <button class="prx-cancelar hidden">Cancelar</button>
        </div>
      `;

      lista.appendChild(card);

      const selectTipo = card.querySelector(".prx-tipo-select");
      selectTipo.value = r.tipo_practica_id || "";

const btnEditar = card.querySelector(".prx-editar");
const btnGuardar = card.querySelector(".prx-guardar");
const btnCancelarCard = card.querySelector(".prx-cancelar");
const btnEliminar = card.querySelector(".prx-eliminar");

const inputs = card.querySelectorAll("input, textarea");
const select = card.querySelector("select");
const adjuntosEdicion = card.querySelector(".prx-adjuntos-edicion");
const nuevosAdjuntosContainer = card.querySelector(".prx-nuevos-adjuntos");

let nuevosAdjuntos = [];

btnEditar.addEventListener("click", () => {

  inputs.forEach(i => i.removeAttribute("readonly"));
  select.removeAttribute("disabled");

  card.querySelectorAll(".prx-eliminar-doc")
      .forEach(b => b.classList.remove("hidden"));

  adjuntosEdicion.classList.remove("hidden");

  btnEditar.classList.add("hidden");
  btnEliminar.classList.add("hidden");
  btnGuardar.classList.remove("hidden");
  btnCancelarCard.classList.remove("hidden");

  card.classList.add("modo-edicion");
});

btnCancelarCard.addEventListener("click", () => cargarPracticas());

btnEliminar.addEventListener("click", async () => {

  const ok = await Swal.fire({
    title: '¿Está seguro?',
    text: "Se eliminará esta practica por reintegro y todos sus adjuntos.",
    icon: "warning",
    showCancelButton: true
  });

  if (!ok.isConfirmed) return;

  await supabase.from("practicas_reintegro")
    .delete()
    .eq("id", r.id);

  cargarPracticas();
});

/* =====================
   ELIMINAR DOCUMENTO
===================== */
card.querySelectorAll(".prx-eliminar-doc").forEach(btn => {
  btn.addEventListener("click", async () => {

    const docId = btn.closest(".prx-adjunto-item").dataset.docId;

    await supabase
      .from("fichamedica_documentos")
      .delete()
      .eq("id", docId);

    btn.closest(".prx-adjunto-item").remove();
  });
});

/* =====================
   AGREGAR NUEVO ADJUNTO
===================== */
card.querySelector(".prx-agregar-adjunto-card")
  .addEventListener("click", () => {

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

/* =====================
   GUARDAR
===================== */
btnGuardar.addEventListener("click", async () => {

  const updated = {
    fecha_carga: inputs[0].value,
    fecha_prescripcion: inputs[1].value || null,
    fecha_vencimiento: inputs[2].value || null,
    tipo_practica_id: select.value || null,
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

    const url = await subirArchivoCloudinary(adj.archivo);

    await supabase.from("fichamedica_documentos").insert({
      afiliado_id: afiliadoId,
      tipo_documento: "practicas_reintegro",
      entidad_relacion_id: r.id,
      nombre_archivo: adj.archivo.name,
      url
    });
  }

  Swal.fire("Actualizado", "Registro actualizado correctamente", "success");
  cargarPracticas();
});

    }
  }

  /* =====================
     FORM NUEVO
  ===================== */
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const datos = {
      afiliado_id: afiliadoId,
      fecha_carga: form.fecha_carga.value,
      fecha_prescripcion: form.fecha_prescripcion.value || null,
      fecha_vencimiento: form.fecha_vencimiento.value || null,
      tipo_practica_id: tipoSelect.value || null,
      observacion: form.observacion.value || null,
      reintegro: null,
      fecha_reintegro: null
    };

    const { data } = await supabase
      .from("practicas_reintegro")
      .insert(datos)
      .select()
      .single();

    for (const adj of archivosAdjuntos) {
      if (!adj.archivo) continue;

      const url = await subirArchivoCloudinary(adj.archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "practicas_reintegro",
        entidad_relacion_id: data.id,
        nombre_archivo: adj.archivo.name,
        url
      });
    }

    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
    cargarPracticas();

    Swal.fire("Guardado", "Registro guardado correctamente", "success");
  });

  btnNuevo.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    campoReintegro.classList.add("hidden");
    form.classList.toggle("hidden");
  });

  btnCancelar.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
  });

  function renderPaginacion(total) {
    paginacion.innerHTML = "";
    const totalPaginas = Math.ceil(total / POR_PAGINA);

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
