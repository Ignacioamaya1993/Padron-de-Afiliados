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
     ADJUNTOS
  ===================== */
  function resetAdjuntos() {
    archivosAdjuntos = [];
    adjuntosContainer.innerHTML = "";
  }

  function agregarAdjuntoInput() {
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
      archivosAdjuntos = archivosAdjuntos.filter(a => a !== wrapper);
      wrapper.remove();
    });

    wrapper.archivo = null;
    archivosAdjuntos.push(wrapper);

    wrapper.appendChild(input);
    wrapper.appendChild(btnEliminar);
    adjuntosContainer.appendChild(wrapper);
  }

  btnAgregarAdjunto.addEventListener("click", agregarAdjuntoInput);

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

    const f = d => (d ? new Date(d).toLocaleDateString("es-AR") : "-");

    for (const med of data) {
      const { data: docs } = await supabase
        .from("fichamedica_documentos")
        .select("*")
        .eq("tipo_documento", "medicamentos")
        .eq("entidad_relacion_id", med.id);

      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <strong>${med.tipo_medicamentos?.nombre || "-"}</strong>

        <div class="med-card-section grid-fechas">
          <div><label>Fecha de carga</label><input readonly value="${f(med.fecha_carga)}"></div>
          <div><label>Fecha de autorización</label><input readonly value="${f(med.fecha_autorizacion)}"></div>
          <div><label>Fecha de entrega</label><input readonly value="${f(med.fecha_entrega)}"></div>
          <div><label>Próxima carga</label><input readonly value="${f(med.proxima_carga)}"></div>
        </div>

        ${
          med.latas_entregadas
            ? `<div class="med-card-section">
                 <label>Latas entregadas</label>
                 <input readonly value="${med.latas_entregadas}">
               </div>`
            : ""
        }

        ${
          med.fecha_inicio || med.fecha_vencimiento
            ? `<div class="med-card-section grid-fechas">
                 <div><label>Inicio</label><input readonly value="${f(med.fecha_inicio)}"></div>
                 <div><label>Vencimiento</label><input readonly value="${f(med.fecha_vencimiento)}"></div>
               </div>`
            : ""
        }

        ${
          med.observaciones
            ? `<div class="med-card-section">
                 <label>Observaciones</label>
                 <textarea readonly>${med.observaciones}</textarea>
               </div>`
            : ""
        }

        ${
          docs.length
            ? `<div class="med-card-section">
                 <label>Adjuntos</label>
                 <div class="adjuntos-lista">
                   ${docs
                     .map(
                       d =>
                         `<a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>`
                     )
                     .join("")}
                 </div>
               </div>`
            : ""
        }

        <div class="acciones">
          <button class="editar" data-id="${med.id}">✏️ Editar</button>
          <button class="eliminar" data-id="${med.id}">🗑️ Eliminar</button>
        </div>
      `;

      lista.appendChild(card);
    }
  }

  /* =====================
     NUEVO / CANCELAR
  ===================== */
  btnNuevo.addEventListener("click", () => {
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

  /* =====================
     EDITAR / ELIMINAR
  ===================== */
  lista.addEventListener("click", async e => {
    if (e.target.classList.contains("editar")) {
      editandoId = e.target.dataset.id;
      form.reset();
      resetAdjuntos();

      const { data: med } = await supabase
        .from("medicamentos")
        .select("*")
        .eq("id", editandoId)
        .single();

      Object.entries(med).forEach(([k, v]) => {
        if (form[k]) form[k].value = v ?? "";
      });

      tipoSelect.value = med.tipo_medicamento_id;
      actualizarCamposPorTipo();

      const { data: docs } = await supabase
        .from("fichamedica_documentos")
        .select("*")
        .eq("tipo_documento", "medicamentos")
        .eq("entidad_relacion_id", editandoId);

      docs.forEach(doc => {
        const div = document.createElement("div");
        div.className = "adjunto-item";
        div.innerHTML = `
          <a href="${doc.url}" target="_blank">📎 ${doc.nombre_archivo}</a>
          <button type="button">✖</button>
        `;

        div.querySelector("button").addEventListener("click", async () => {
          await supabase
            .from("fichamedica_documentos")
            .delete()
            .eq("id", doc.id);
          div.remove();
        });

        adjuntosContainer.appendChild(div);
      });

      form.classList.remove("hidden");
    }

    if (e.target.classList.contains("eliminar")) {
      const id = e.target.dataset.id;

      await supabase
        .from("fichamedica_documentos")
        .delete()
        .eq("tipo_documento", "medicamentos")
        .eq("entidad_relacion_id", id);

      await supabase.from("medicamentos").delete().eq("id", id);
      cargarMedicamentos();
    }
  });

  /* =====================
     GUARDAR
  ===================== */
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

    let medicamentoId = editandoId;

    if (editandoId) {
      await supabase.from("medicamentos").update(datos).eq("id", editandoId);
    } else {
      const { data } = await supabase
        .from("medicamentos")
        .insert(datos)
        .select()
        .single();

      medicamentoId = data.id;
    }

    for (const adj of archivosAdjuntos) {
      if (!adj.archivo) continue;

      const url = await subirArchivoCloudinary(adj.archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "medicamentos",
        entidad_relacion_id: medicamentoId,
        nombre_archivo: adj.archivo.name,
        url
      });
    }

    editandoId = null;
    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
    cargarMedicamentos();
  });

  /* =====================
     INIT
  ===================== */
  await cargarTipos();
  cargarMedicamentos();
}
