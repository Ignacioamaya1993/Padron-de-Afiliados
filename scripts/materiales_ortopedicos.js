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

      card.innerHTML = `
        <div class="grid-2">
          <div>
            <label>Fecha carga</label>
            <input type="date" readonly value="${fISO(r.fecha_carga)}">
          </div>

          <div>
            <label>Tipo</label>
            <select class="tipo-select" disabled>
              ${opcionesTipo}
            </select>
          </div>

          <div>
            <label>Reintegro</label>
            <input type="number" value="${r.reintegro ?? ''}" readonly>
          </div>

          <div>
            <label>Fecha reintegro</label>
            <input type="date" value="${fISO(r.fecha_reintegro)}" readonly>
          </div>
        </div>

        <div class="full-width">
          <label>Observación</label>
          <textarea readonly>${r.observacion || ""}</textarea>
        </div>

        ${documentos.length ? `
        <div class="adjuntos-card">
          ${documentos.map(d => `
            <div class="adjunto-item" data-doc-id="${d.id}">
              <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
              <button class="eliminar-doc hidden">✖</button>
            </div>
          `).join("")}
        </div>

        <div class="adjuntos-edicion hidden">
          <button class="agregar-adjunto-card">➕ Agregar adjunto</button>
          <div class="nuevos-adjuntos"></div>
        </div>
        ` : ""}

        <div class="acciones">
          <button class="editar">✏️ Editar</button>
          <button class="eliminar">🗑️ Eliminar</button>
          <button class="guardar hidden">💾 Guardar</button>
          <button class="cancelar hidden">Cancelar</button>
        </div>
      `;

      lista.appendChild(card);

      card.querySelector(".tipo-select").value = r.tipo_material_id || "";

      const btnEditar = card.querySelector(".editar");
      const btnGuardar = card.querySelector(".guardar");
      const btnCancelarCard = card.querySelector(".cancelar");
      const btnEliminar = card.querySelector(".eliminar");

      const inputs = card.querySelectorAll("input, textarea");
      const select = card.querySelector("select");
      const adjuntosEdicion = card.querySelector(".adjuntos-edicion");
      const nuevosAdjuntosContainer = card.querySelector(".nuevos-adjuntos");

      let nuevosAdjuntos = [];

      /* ===== EDITAR ===== */

      btnEditar.addEventListener("click", () => {

        inputs.forEach(i => i.removeAttribute("readonly"));
        select.removeAttribute("disabled");

        card.querySelectorAll(".eliminar-doc")
            .forEach(b => b.classList.remove("hidden"));

        adjuntosEdicion?.classList.remove("hidden");

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

        await supabase.from("materiales_ortopedicos")
          .delete()
          .eq("id", r.id);

        cargarMateriales();
      });

      /* ===== ELIMINAR DOCUMENTO ===== */

      card.querySelectorAll(".eliminar-doc").forEach(btn => {
        btn.addEventListener("click", async () => {

          const docId = btn.closest(".adjunto-item").dataset.docId;

          await supabase
            .from("fichamedica_documentos")
            .delete()
            .eq("id", docId);

          btn.closest(".adjunto-item").remove();
        });
      });

      /* ===== AGREGAR NUEVO ADJUNTO EN EDICIÓN ===== */

      adjuntosEdicion?.querySelector(".agregar-adjunto-card")
        ?.addEventListener("click", () => {

          const wrapper = document.createElement("div");
          wrapper.className = "adjunto-item";

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

      /* ===== GUARDAR EDICIÓN ===== */

      btnGuardar.addEventListener("click", async () => {

        const updated = {
          fecha_carga: inputs[0].value,
          tipo_material_id: select.value || null,
          reintegro: inputs[2].value || null,
          fecha_reintegro: inputs[3].value || null,
          observacion: card.querySelector("textarea").value || null
        };

        await supabase
          .from("materiales_ortopedicos")
          .update(updated)
          .eq("id", r.id);

        /* SUBIR NUEVOS ADJUNTOS */

        for (const adj of nuevosAdjuntos) {
          if (!adj.archivo) continue;

          const url = await subirArchivoCloudinary(adj.archivo);

          await supabase.from("fichamedica_documentos").insert({
            afiliado_id: afiliadoId,
            tipo_documento: "materiales_ortopedicos",
            entidad_relacion_id: r.id,
            nombre_archivo: adj.archivo.name,
            url
          });
        }

        Swal.fire("Actualizado", "Registro actualizado correctamente", "success");
        cargarMateriales();
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

    Swal.fire("Guardado", "Registro guardado correctamente", "success");
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
    const totalPaginas = Math.ceil(total / POR_PAGINA);

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