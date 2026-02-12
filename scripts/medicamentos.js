import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

export async function init(afiliadoId) {
  if (!afiliadoId) {
    Swal.fire("Error", "Afiliado no encontrado", "error");
    throw new Error("ID afiliado faltante");
  }

  await cargarHeader();

  /* =====================
     ESTADO
  ===================== */
  let editandoId = null;
  let archivosAdjuntos = [];

  /* =====================
     ELEMENTOS
  ===================== */
  const btnNuevo = document.getElementById("btnNuevoMedicamento");
  const btnCancelar = document.getElementById("btnCancelarMedicamento");
  const btnAgregarAdjunto = document.getElementById("btnAgregarAdjunto");

  const form = document.getElementById("formMedicamento");
  const lista = document.getElementById("listaMedicamentos");

  const tipoSelect = document.getElementById("tipoMedicamento");
  const datosMedicamento = document.getElementById("datosMedicamento");
  const campoLatas = document.getElementById("campoLatas");
  const campoInicio = document.getElementById("campoInicio");
  const campoVencimiento = document.getElementById("campoVencimiento");
  const adjuntosContainer = document.getElementById("adjuntosContainer");

  /* =====================
     TIPOS MEDICAMENTOS
  ===================== */
  async function cargarTipos() {
    const { data, error } = await supabase
      .from("tipo_medicamentos")
      .select("id, nombre")
      .order("nombre");

    if (error) return console.error(error);

    tipoSelect.innerHTML = `<option value="">Seleccione tipo</option>`;
    data.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nombre;
      tipoSelect.appendChild(opt);
    });
  }

  function actualizarCamposPorTipo() {
    const tipoId = Number(tipoSelect.value);
    datosMedicamento.classList.toggle("hidden", !tipoId);
    campoLatas.classList.add("hidden");
    campoInicio.classList.add("hidden");
    campoVencimiento.classList.add("hidden");
    if (tipoId === 4) campoLatas.classList.remove("hidden");
    if ([6, 7].includes(tipoId)) {
      campoInicio.classList.remove("hidden");
      campoVencimiento.classList.remove("hidden");
    }
  }

  tipoSelect.addEventListener("change", actualizarCamposPorTipo);

  /* =====================
     ADJUNTOS FORM NUEVO
  ===================== */
  function resetAdjuntos() {
    archivosAdjuntos = [];
    adjuntosContainer.innerHTML = "";
  }

  function agregarAdjuntoInput(container = adjuntosContainer, arr = archivosAdjuntos) {
    const wrapper = document.createElement("div");
    wrapper.className = "adjunto-item";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.png";

    input.addEventListener("change", () => {
      wrapper.archivo = input.files[0] || null;
    });

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.textContent = "✖";
    btnEliminar.className = "btn-eliminar-adjunto";

    btnEliminar.addEventListener("click", () => {
      arr.splice(arr.indexOf(wrapper), 1);
      wrapper.remove();
    });

    wrapper.archivo = null;
    arr.push(wrapper);

    wrapper.appendChild(input);
    wrapper.appendChild(btnEliminar);
    container.appendChild(wrapper);
  }

  btnAgregarAdjunto.addEventListener("click", () => agregarAdjuntoInput());

  /* =====================
     LISTAR MEDICAMENTOS
  ===================== */
  async function cargarMedicamentos() {
    const { data, error } = await supabase
      .from("medicamentos")
      .select(`*, tipo_medicamentos(nombre)`)
      .eq("afiliado_id", afiliadoId)
      .order("fecha_carga", { ascending: false });

    if (error) return console.error(error);

    lista.innerHTML = "";
    if (!data.length) return;

    const fISO = d => (d ? d.split("T")[0] : "");

    for (const med of data) {
      const { data: docs } = await supabase
        .from("fichamedica_documentos")
        .select("*")
        .eq("tipo_documento", "medicamentos")
        .eq("entidad_relacion_id", med.id);

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = med.id;
      card._adjuntosNuevos = [];
      card._adjuntosEliminar = [];

      card.innerHTML = `
        <strong>${med.tipo_medicamentos?.nombre || "-"}</strong>

        <div class="med-card-section grid-fechas">
          <div><label>Fecha de carga</label><input type="date" name="fecha_carga" readonly value="${fISO(med.fecha_carga)}"></div>
          <div><label>Fecha de autorización</label><input type="date" name="fecha_autorizacion" readonly value="${fISO(med.fecha_autorizacion)}"></div>
          <div><label>Fecha de entrega</label><input type="date" name="fecha_entrega" readonly value="${fISO(med.fecha_entrega)}"></div>
          <div><label>Próxima carga</label><input type="date" name="proxima_carga" readonly value="${fISO(med.proxima_carga)}"></div>
        </div>

        ${med.latas_entregadas ? `
        <div class="med-card-section grid-fechas">
          <div><label>Latas entregadas</label><input name="latas_entregadas" readonly value="${med.latas_entregadas}"></div>
        </div>` : ""}

        ${[6,7].includes(med.tipo_medicamento_id) ? `
        <div class="med-card-section grid-fechas">
          <div><label>Inicio</label><input type="date" name="fecha_inicio" readonly value="${fISO(med.fecha_inicio)}"></div>
          <div><label>Vencimiento</label><input type="date" name="fecha_vencimiento" readonly value="${fISO(med.fecha_vencimiento)}"></div>
        </div>` : ""}

      <div class="med-card-section">
        <label>Observaciones</label>
        <textarea name="observaciones" readonly>${med.observaciones || "Sin observaciones"}</textarea>
      </div>

        ${docs.length ? `
        <div class="med-card-section adjuntos-card">
          <label>Adjuntos</label>
          <div class="adjuntos-lista">
            ${docs.map(d => `
              <div class="adjunto-item" data-doc-id="${d.id}">
                <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
                <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
              </div>`).join("")}
          </div>
        </div>` : ""}

        <div class="med-card-section hidden adjuntos-edicion">
          <button type="button" class="btn-agregar-adjunto-card">➕ Agregar adjunto</button>
          <div class="adjuntos-nuevos"></div>
        </div>

        <div class="acciones">
          <button class="editar">✏️ Editar</button>
          <button class="eliminar">🗑️ Eliminar</button>
          <button class="guardar hidden">💾 Guardar</button>
          <button class="cancelar hidden">Cancelar</button>
        </div>
      `;

      lista.appendChild(card);
    }
  }

  /* =====================
     ACCIONES CARD
  ===================== */
  lista.addEventListener("click", async e => {
    const card = e.target.closest(".card");
    if (!card) return;

    const id = card.dataset.id;

    // Bloqueo edición múltiple
    if (e.target.classList.contains("editar") && editandoId && editandoId !== id) {
      Swal.fire("Atención", "Solo se puede editar una card a la vez", "warning");
      return;
    }

    // EDITAR
    if (e.target.classList.contains("editar")) {
      card.classList.add("editando");
      editandoId = id;

      card.querySelectorAll("input, textarea").forEach(el => {
        if (el.hasAttribute("readonly")) el.removeAttribute("readonly");
        // Si el textarea dice "Sin observaciones", lo vaciamos para poder editar
        if(el.tagName === "TEXTAREA" && el.value === "Sin observaciones") el.value = "";
      });

      card.querySelectorAll(".btn-eliminar-adjunto").forEach(b => b.classList.remove("hidden"));
      card.querySelector(".adjuntos-edicion").classList.remove("hidden");

      card.querySelector(".btn-agregar-adjunto-card")
        .addEventListener("click", () => {
          agregarAdjuntoInput(card.querySelector(".adjuntos-nuevos"), card._adjuntosNuevos);
        });

      card.querySelector(".editar").classList.add("hidden");
      card.querySelector(".eliminar").classList.add("hidden");
      card.querySelector(".guardar").classList.remove("hidden");
      card.querySelector(".cancelar").classList.remove("hidden");
    }

    // ELIMINAR ADJUNTO EXISTENTE
    if (e.target.classList.contains("btn-eliminar-adjunto")) {
      const item = e.target.closest(".adjunto-item");
      card._adjuntosEliminar.push(item.dataset.docId);
      item.remove();
    }

    // CANCELAR
    if (e.target.classList.contains("cancelar")) {
      editandoId = null;
      cargarMedicamentos();
    }

    // GUARDAR
    if (e.target.classList.contains("guardar")) {
      const datos = {};
      card.querySelectorAll("input[name], textarea[name]").forEach(el => {
        datos[el.name] = el.value || null;
      });

      await supabase.from("medicamentos").update(datos).eq("id", id);

      for (const docId of card._adjuntosEliminar) {
        await supabase.from("fichamedica_documentos").delete().eq("id", docId);
      }

      for (const adj of card._adjuntosNuevos) {
        if (!adj.archivo) continue;
        const url = await subirArchivoCloudinary(adj.archivo);

        await supabase.from("fichamedica_documentos").insert({
          afiliado_id: afiliadoId,
          tipo_documento: "medicamentos",
          entidad_relacion_id: id,
          nombre_archivo: adj.archivo.name,
          url
        });
      }

      editandoId = null;
      cargarMedicamentos();

      Swal.fire({
        icon: 'success',
        title: 'Guardado',
        text: 'Cambios guardados correctamente',
        confirmButtonText: 'OK'
      });
    }

    // ELIMINAR MEDICAMENTO
    if (e.target.classList.contains("eliminar")) {
      const result = await Swal.fire({
        title: '¿Está seguro?',
        text: "Se eliminará este medicamento y todos sus adjuntos.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      });

      if (result.isConfirmed) {
        await supabase.from("fichamedica_documentos")
          .delete()
          .eq("tipo_documento", "medicamentos")
          .eq("entidad_relacion_id", id);

        await supabase.from("medicamentos").delete().eq("id", id);
        cargarMedicamentos();

        Swal.fire(
          'Eliminado',
          'El medicamento fue eliminado correctamente.',
          'success'
        );
      }
    }

  });

  /* =====================
     FORM NUEVO
  ===================== */
  btnNuevo.addEventListener("click", () => {
    if (!form.classList.contains("hidden")) {
      editandoId = null;
      form.reset();
      resetAdjuntos();
      form.classList.add("hidden");
      return;
    }

    editandoId = null;
    form.reset();
    resetAdjuntos();
    agregarAdjuntoInput();
    actualizarCamposPorTipo();
    form.classList.remove("hidden");
  });

  btnCancelar.addEventListener("click", () => {
    editandoId = null;
    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const datos = {
      afiliado_id: afiliadoId,
      tipo_medicamento_id: form.tipo_medicamento_id.value,
      fecha_carga: form.fecha_carga.value,
      fecha_autorizacion: form.fecha_autorizacion.value || null,
      fecha_entrega: form.fecha_entrega.value || null,
      proxima_carga: form.proxima_carga.value || null,
      latas_entregadas: form.latas_entregadas.value || null,
      fecha_inicio: form.fecha_inicio.value || null,
      fecha_vencimiento: form.fecha_vencimiento.value || null,
      observaciones: form.observaciones.value || null
    };

    const { data } = await supabase.from("medicamentos").insert(datos).select().single();

    for (const adj of archivosAdjuntos) {
      if (!adj.archivo) continue;
      const url = await subirArchivoCloudinary(adj.archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "medicamentos",
        entidad_relacion_id: data.id,
        nombre_archivo: adj.archivo.name,
        url
      });
    }

    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
    cargarMedicamentos();

    Swal.fire({
      icon: 'success',
      title: 'Guardado',
      text: 'Cambios guardados correctamente',
      confirmButtonText: 'OK'
    });
  });

  /* =====================
     INIT
  ===================== */
  await cargarTipos();
  cargarMedicamentos();
}
