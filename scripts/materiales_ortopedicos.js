import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

export async function init(afiliadoId) {

  await cargarHeader();

  let paginaActual = 0;
  const POR_PAGINA = 10;
  let archivosAdjuntos = [];

  const btnNuevo = document.getElementById("btnNuevoMaterialOrtopedico");
  const btnCancelar = document.getElementById("btnCancelarMaterialOrtopedico");
  const form = document.getElementById("formMaterialOrtopedico");
  const lista = document.getElementById("listaMaterialesOrtopedicos");
  const paginacion = document.getElementById("paginacionMaterialesOrtopedicos");
  const adjuntosContainer = document.getElementById("adjuntosMaterialesContainer");
  const btnAgregarAdjunto = document.getElementById("btnAgregarAdjuntoMaterial");
  const tipoSelect = document.getElementById("tipoMaterialOrtopedico");
  const grupoReintegro = document.getElementById("grupoReintegroMaterial");

  /* =====================
     CARGAR TIPOS
  ===================== */

  async function cargarTipos() {

    const { data } = await supabase
      .from("tipo_material_ortopedico")
      .select("id, nombre")
      .order("nombre");

    tipoSelect.innerHTML = `<option value="">Seleccionar...</option>`;

    data?.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nombre;
      tipoSelect.appendChild(opt);
    });
  }

  /* =====================
     ADJUNTOS NUEVO
  ===================== */

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
      const btnEliminar = document.createElement("button");
      btnEliminar.type = "button";
      btnEliminar.textContent = "✖";
      btnEliminar.onclick = () => wrapper.remove();
      wrapper.appendChild(btnEliminar);
    }

    adjuntosContainer.appendChild(wrapper);
  }

  btnAgregarAdjunto.addEventListener("click", () => agregarAdjuntoInput(false));

  /* =====================
     CARGAR REGISTROS
  ===================== */

  async function cargarMateriales() {

    const { data, count } = await supabase
      .from("materiales_ortopedicos")
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
      .eq("tipo_documento", "materiales_ortopedicos")
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
      const opcionesTipo = tipoSelect.innerHTML;

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = r.id;

card.className = "card-material";
card.dataset.id = r.id;
card._adjuntosEliminar = [];

card.innerHTML = `
  <strong class="card-titulo">
    ${tipoSelect.querySelector(`option[value="${r.tipo_material_id}"]`)?.textContent || "Material ortopédico"}
  </strong>

  <!-- SIEMPRE VISIBLE -->
  <div class="card-content">
    <div class="grid-2">
      <div>
        <label>Fecha carga</label>
        <input type="date" name="fecha_carga" readonly value="${fISO(r.fecha_carga)}">
      </div>

      <div>
        <label>Reintegro</label>
        <input type="number" name="reintegro" readonly value="${r.reintegro ?? ""}">
      </div>

      <div>
        <label>Fecha reintegro</label>
        <input type="date" name="fecha_reintegro" readonly value="${fISO(r.fecha_reintegro)}">
      </div>

    </div>
  </div>

  <!-- EXPANDIBLE -->
  <div class="card-extra">

    <div class="full-width">
      <label>Observación</label>
      <textarea name="observacion" readonly>${r.observacion || "Sin observaciones"}</textarea>
    </div>

    ${documentos.length ? `
      <div class="adjuntos-card">
        ${documentos.map(d => `
          <div class="adjunto-item" data-doc-id="${d.id}">
            <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
            <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
          </div>
        `).join("")}
      </div>
    ` : ""}

    <div class="adjuntos-edicion hidden">
      <button type="button" class="btn-agregar-adjunto-card">➕ Agregar adjunto</button>
      <div class="adjuntos-nuevos"></div>
    </div>

  </div>

  <button class="toggle-card">Ver más</button>

  <div class="acciones">
    <button class="editar">✏️ Editar</button>
    <button class="eliminar">🗑️ Eliminar</button>
    <button class="guardar hidden">💾 Guardar</button>
    <button class="cancelar hidden">Cancelar</button>
  </div>
`;

      lista.appendChild(card);

      const btnEditar = card.querySelector(".editar");
      const btnGuardar = card.querySelector(".guardar");
      const btnCancelarCard = card.querySelector(".cancelar");
      const btnEliminar = card.querySelector(".eliminar");

      const inputs = card.querySelectorAll("input, textarea");
      const select = card.querySelector("select");
      const adjuntosEdicion = card.querySelector(".adjuntos-edicion");
      const nuevosAdjuntosContainer = card.querySelector(".nuevos-adjuntos");

      let nuevosAdjuntos = [];

      // TOGGLE
card.querySelector(".toggle-card").addEventListener("click", e => {

  card.classList.toggle("expandida");

  e.target.textContent =
    card.classList.contains("expandida")
      ? "Ver menos"
      : "Ver más";
});

      /* ===== EDITAR ===== */

btnEditar.addEventListener("click", () => {

  if (!card.classList.contains("expandida")) {
    card.classList.add("expandida");
    card.querySelector(".toggle-card").textContent = "Ver menos";
  }

  card.classList.add("modo-edicion");

  card.querySelectorAll("input, textarea").forEach(el => {
    el.removeAttribute("readonly");

    if (el.tagName === "TEXTAREA" && el.value === "Sin observaciones") {
      el.value = "";
    }
  });

  card.querySelectorAll(".btn-eliminar-adjunto")
      .forEach(b => b.classList.remove("hidden"));

  card.querySelector(".adjuntos-edicion")
      ?.classList.remove("hidden");

  btnEditar.classList.add("hidden");
  btnEliminar.classList.add("hidden");
  btnGuardar.classList.remove("hidden");
  btnCancelarCard.classList.remove("hidden");
});
      btnCancelarCard.addEventListener("click", () => cargarMateriales());

      /* ===== ELIMINAR REGISTRO ===== */

btnEliminar.addEventListener("click", async () => {

  const ok = await Swal.fire({
    title: '¿Está seguro?',
    text: "Se eliminará el material ortopédico y sus adjuntos.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!ok.isConfirmed) return;

  const { error } = await supabase
    .from("materiales_ortopedicos")
    .delete()
    .eq("id", r.id);

  if (error) {
    Swal.fire("Error", "No se pudo eliminar el registro.", "error");
    return;
  }

  await Swal.fire(
    'Eliminado',
    'El material ortopédico fue eliminado correctamente.',
    'success'
  );

  cargarMateriales();
});

      /* ===== ELIMINAR DOCUMENTO ===== */
card.querySelectorAll(".btn-eliminar-adjunto").forEach(btn => {
  btn.addEventListener("click", () => {

    const item = btn.closest(".adjunto-item");
    card._adjuntosEliminar.push(item.dataset.docId);
    item.remove();
  });
});

      /* ===== AGREGAR NUEVO ADJUNTO EN EDICIÓN ===== */

card.querySelector(".btn-agregar-adjunto-card")
  ?.addEventListener("click", () => {

    const wrapper = document.createElement("div");
    wrapper.className = "adjunto-item";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.png";

    const btnX = document.createElement("button");
    btnX.type = "button";
    btnX.textContent = "✖";
    btnX.onclick = () => wrapper.remove();

    wrapper.append(input, btnX);
    card.querySelector(".adjuntos-nuevos").appendChild(wrapper);
});

      /* ===== GUARDAR EDICIÓN ===== */

btnGuardar.addEventListener("click", async () => {

  btnGuardar.disabled = true;
  btnGuardar.textContent = "⌛ Guardando...";
  btnGuardar.style.backgroundColor = "#aaa";
  btnGuardar.style.cursor = "not-allowed";

  try {

    const updated = {
      fecha_carga: card.querySelector("[name='fecha_carga']").value,
      reintegro: card.querySelector("[name='reintegro']").value || null,
      fecha_reintegro: card.querySelector("[name='fecha_reintegro']").value || null,
      observacion: card.querySelector("[name='observacion']").value || null
    };

    await supabase
      .from("materiales_ortopedicos")
      .update(updated)
      .eq("id", r.id);

    // eliminar adjuntos marcados
    if (card._adjuntosEliminar.length) {
      await supabase
        .from("fichamedica_documentos")
        .delete()
        .in("id", card._adjuntosEliminar);
    }

    // subir nuevos
    const nuevos = card.querySelectorAll(".adjuntos-nuevos input[type='file']");

    for (const input of nuevos) {
      if (!input.files[0]) continue;

      const archivo = input.files[0];
      const url = await subirArchivoCloudinary(archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "materiales_ortopedicos",
        entidad_relacion_id: r.id,
        nombre_archivo: archivo.name,
        url
      });
    }

    Swal.fire({
      icon: "success",
      title: "Guardado",
      text: "Cambios guardados correctamente",
      confirmButtonText: "OK"
    });
  cargarMateriales();

  } catch (err) {
    Swal.fire("Error", "No se pudo guardar", "error");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "💾 Guardar";
    btnGuardar.style.backgroundColor = "";
    btnGuardar.style.cursor = "";
  }
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
      tipo_material_id: tipoSelect.value || null,
      observacion: form.observacion.value || null,
      reintegro: null,
      fecha_reintegro: null
    };

    const { data } = await supabase
      .from("materiales_ortopedicos")
      .insert(datos)
      .select()
      .single();

    /* SUBIR ADJUNTOS NUEVOS */

    for (const adj of archivosAdjuntos) {
      if (!adj.archivo) continue;

      const url = await subirArchivoCloudinary(adj.archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "materiales_ortopedicos",
        entidad_relacion_id: data.id,
        nombre_archivo: adj.archivo.name,
        url
      });
    }

    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
    cargarMateriales();

    Swal.fire({
      icon: 'success',
      title: 'Guardado',
      text: 'Material ortopedico cargado correctamente',
      confirmButtonText: 'OK'
    });
});

  btnNuevo.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    grupoReintegro?.classList.add("hidden");
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
    btnAnterior.onclick = () => { paginaActual--; cargarMateriales(); };

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;
    btnSiguiente.onclick = () => { paginaActual++; cargarMateriales(); };

    const info = document.createElement("span");
    info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas} `;

    paginacion.append(btnAnterior, info, btnSiguiente);
  }

  resetAdjuntos();
  await cargarTipos();
  cargarMateriales();
}