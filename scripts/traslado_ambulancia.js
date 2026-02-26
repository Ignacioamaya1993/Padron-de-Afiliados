import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

export async function init(afiliadoId) {

  if (!afiliadoId) {
    Swal.fire("Error", "Afiliado no encontrado", "error");
    throw new Error("ID afiliado faltante");
  }

  await cargarHeader();

  /* ===================== */
  /* ESTADO */
  /* ===================== */
  let editandoId = null;
  const POR_PAGINA = 12;
  let paginaActual = 0;
  let archivosAdjuntos = [];

  /* ===================== */
  /* ELEMENTOS */
  /* ===================== */
  const btnNuevo = document.getElementById("btnNuevoTrasladoAmbulancia");
  const btnCancelar = document.getElementById("btnCancelarTrasladoAmbulancia");
  const form = document.getElementById("formTrasladoAmbulancia");
  const contenedor = document.getElementById("contenedorTrasladoAmbulancia");
  const paginacion = document.getElementById("paginacionTrasladoAmbulancia");
  const btnAgregarAdjuntoForm = document.getElementById("btnAgregarAdjuntoTraslado");
  const adjuntosFormLista = document.getElementById("adjuntosTrasladoLista");

  /* ===================== */
  /* ADJUNTOS FORM (ALTA) */
  /* ===================== */
  function resetAdjuntos() {
    archivosAdjuntos = [];
    adjuntosFormLista.innerHTML = "";
    crearInputAdjunto(true);
  }

  function crearInputAdjunto(obligatorio = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "adjunto-item-nuevo";

    const input = document.createElement("input");
    input.type = "file";

    wrapper.archivo = null;
    input.addEventListener("change", () => {
      wrapper.archivo = input.files[0] || null;
    });

    wrapper.appendChild(input);

    if (!obligatorio) {
      const btnEliminar = document.createElement("button");
      btnEliminar.type = "button";
      btnEliminar.textContent = "✖";
      btnEliminar.onclick = () => wrapper.remove();
      wrapper.appendChild(btnEliminar);
    }

    archivosAdjuntos.push(wrapper);
    adjuntosFormLista.appendChild(wrapper);
  }

  btnAgregarAdjuntoForm.addEventListener("click", () => crearInputAdjunto(false));

  /* ===================== */
  /* CARGAR REGISTROS */
  /* ===================== */
  async function cargarTraslados() {

    const { data, count, error } = await supabase
      .from("traslado_ambulancia")
      .select("*", { count: "exact" })
      .eq("afiliado_id", afiliadoId)
      .order("fecha_carga", { ascending: false })
      .range(paginaActual * POR_PAGINA, paginaActual * POR_PAGINA + POR_PAGINA - 1);

    if (error) return console.error(error);

    contenedor.innerHTML = "";

    if (!data || !data.length) {
      renderPaginacion(0);
      return;
    }

    const fISO = d => d ? d.split("T")[0] : "";

    for (const traslado of data) {

      const { data: docs } = await supabase
        .from("fichamedica_documentos")
        .select("*")
        .eq("tipo_documento", "traslado_ambulancia")
        .eq("entidad_relacion_id", traslado.id);

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = traslado.id;

      card.innerHTML = `
        <strong>Traslado Ambulancia</strong>

        <div class="med-card-section grid-fechas">
          <div>
            <label>Fecha Carga</label>
            <input type="date" name="fecha_carga" readonly value="${fISO(traslado.fecha_carga)}">
          </div>

          <div>
            <label>Lugar</label>
            <input name="lugar_traslado" readonly value="${traslado.lugar_traslado || ""}">
          </div>

          <div>
            <label>Reintegro</label>
            <input type="number" step="0.01" name="reintegro" readonly value="${traslado.reintegro ?? ""}">
          </div>

          <div>
            <label>Fecha Reintegro</label>
            <input type="date" name="fecha_reintegro" readonly value="${fISO(traslado.fecha_reintegro)}">
          </div>
        </div>

        <div class="med-card-section">
          <label>Observación</label>
          <textarea name="observacion" readonly>${traslado.observacion || ""}</textarea>
        </div>

        <div class="med-card-section adjuntos-existentes">
          <label>Adjuntos</label>
          ${docs?.length ? docs.map(d => `
            <div class="adjunto-existente" data-doc-id="${d.id}">
              <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
              <button type="button" class="eliminar-adjunto hidden">✖</button>
            </div>
          `).join("") : "<div>Sin adjuntos</div>"}
        </div>

        <div class="med-card-section adjuntos-edicion hidden">
          <label>Agregar nuevos adjuntos</label>
          <div class="lista-nuevos-adjuntos"></div>
          <button type="button" class="agregar-adjunto-card">➕ Agregar adjunto</button>
        </div>

        <div class="acciones">
          <button class="editar">✏️ Editar</button>
          <button class="eliminar">🗑️ Eliminar</button>
          <button class="guardar hidden">💾 Guardar</button>
          <button class="cancelar hidden">Cancelar</button>
        </div>
      `;

      contenedor.appendChild(card);

      /* ===================== */
      /* EVENTOS CARD */
      /* ===================== */
      const btnEditar = card.querySelector(".editar");
      const btnGuardar = card.querySelector(".guardar");
      const btnCancelarCard = card.querySelector(".cancelar");
      const btnEliminar = card.querySelector(".eliminar");
      const inputs = card.querySelectorAll("input, textarea");
      const adjuntosEdicion = card.querySelector(".adjuntos-edicion");
      const nuevosAdjuntosContainer = card.querySelector(".lista-nuevos-adjuntos");
      let nuevosAdjuntos = [];

      btnEditar.addEventListener("click", () => {
        if (editandoId && editandoId !== traslado.id) {
          Swal.fire("Atención", "Ya hay un registro en edición", "warning");
          return;
        }
        editandoId = traslado.id;

        card.classList.add("editando");
        inputs.forEach(i => i.removeAttribute("readonly"));
        card.querySelectorAll(".eliminar-adjunto").forEach(b => b.classList.remove("hidden"));
        adjuntosEdicion.classList.remove("hidden");
        btnEditar.classList.add("hidden");
        btnEliminar.classList.add("hidden");
        btnGuardar.classList.remove("hidden");
        btnCancelarCard.classList.remove("hidden");
      });

      btnCancelarCard.addEventListener("click", () => {
        editandoId = null;
        cargarTraslados();
      });

      btnEliminar.addEventListener("click", async () => {
        const confirm = await Swal.fire({
          title: "¿Eliminar registro?",
          text: "Se eliminará el traslado y sus adjuntos.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
        });

        if (!confirm.isConfirmed) return;

        await supabase
          .from("fichamedica_documentos")
          .delete()
          .eq("tipo_documento", "traslado_ambulancia")
          .eq("entidad_relacion_id", traslado.id);

        await supabase
          .from("traslado_ambulancia")
          .delete()
          .eq("id", traslado.id);

        cargarTraslados();
        Swal.fire("Eliminado", "Registro eliminado correctamente", "success");
      });

      /* Agregar input de adjunto en edición */
      card.querySelector(".agregar-adjunto-card").addEventListener("click", () => {
        const wrapper = document.createElement("div");
        wrapper.className = "adjunto-item-nuevo";

        const input = document.createElement("input");
        input.type = "file";
        input.addEventListener("change", () => wrapper.archivo = input.files[0] || null);
        wrapper.archivo = null;

        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.textContent = "✖";
        btnEliminar.onclick = () => wrapper.remove();

        wrapper.append(input, btnEliminar);
        nuevosAdjuntosContainer.appendChild(wrapper);
        nuevosAdjuntos.push(wrapper);
      });

      card.querySelectorAll(".eliminar-adjunto").forEach(btn => {
        btn.addEventListener("click", async () => {
          const docId = btn.closest(".adjunto-existente").dataset.docId;
          await supabase
            .from("fichamedica_documentos")
            .delete()
            .eq("id", docId);
          btn.closest(".adjunto-existente").remove();
        });
      });

      /* Guardar cambios */
      btnGuardar.addEventListener("click", async () => {
        const updated = {
          fecha_carga: card.querySelector("[name='fecha_carga']").value,
          lugar_traslado: card.querySelector("[name='lugar_traslado']").value,
          observacion: card.querySelector("[name='observacion']").value || null,
          reintegro: card.querySelector("[name='reintegro']").value || null,
          fecha_reintegro: card.querySelector("[name='fecha_reintegro']").value || null
        };

        const { error } = await supabase
          .from("traslado_ambulancia")
          .update(updated)
          .eq("id", traslado.id);

        if (error) {
          console.error(error);
          Swal.fire("Error", "No se pudo actualizar", "error");
          return;
        }

        /* Subir nuevos adjuntos */
for (const adj of nuevosAdjuntos) {
  if (!adj.archivo) continue;

  console.log("Subiendo archivo nuevo a Cloudinary:", adj.archivo.name);
  const resultado = await subirArchivoCloudinary(adj.archivo);
  console.log("Resultado Cloudinary:", resultado);

  const url = resultado; // <-- usar directamente
  if (!url) {
    console.warn("No se obtuvo URL del archivo:", adj.archivo.name);
    continue;
  }

  console.log("Insertando documento en Supabase con URL:", url);
  const { data: docData, error: errorAdj } = await supabase
    .from("fichamedica_documentos")
    .insert({
      afiliado_id: afiliadoId,
      tipo_documento: "traslado_ambulancia",
      entidad_relacion_id: traslado.id,
      nombre_archivo: adj.archivo.name,
      url,
      fecha_subida: new Date().toISOString()
    })
    .select()
    .single();

  if (errorAdj) {
    console.error("Error al insertar documento:", errorAdj);
  } else {
    console.log("Documento insertado correctamente:", docData);
  }
}

        editandoId = null;
        cargarTraslados();
        Swal.fire("Actualizado", "Registro actualizado correctamente", "success");
      });

    }

    renderPaginacion(count);
  }

  /* ===================== */
  /* PAGINACIÓN */
  /* ===================== */
  function renderPaginacion(total) {
    paginacion.innerHTML = "";
    const totalPaginas = Math.ceil(total / POR_PAGINA);

    const btnAnterior = document.createElement("button");
    btnAnterior.textContent = "⬅ Anterior";
    btnAnterior.disabled = paginaActual === 0;
    btnAnterior.onclick = () => { paginaActual--; cargarTraslados(); };

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;
    btnSiguiente.onclick = () => { paginaActual++; cargarTraslados(); };

    const info = document.createElement("span");
    info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas || 1} `;

    paginacion.append(btnAnterior, info, btnSiguiente);
  }

  /* ===================== */
  /* NUEVO (ALTA) */
  /* ===================== */
  btnNuevo.addEventListener("click", () => {
    form.classList.toggle("oculto");
    form.reset();
    resetAdjuntos();
  });

  btnCancelar.addEventListener("click", () => {
    form.classList.add("oculto");
    form.reset();
    resetAdjuntos();
  });

form.addEventListener("submit", async e => {
  e.preventDefault();

  const datos = {
    afiliado_id: afiliadoId,
    fecha_carga: document.getElementById("fechaCarga").value,
    lugar_traslado: document.getElementById("lugarTraslado").value,
    observacion: document.getElementById("observacionTraslado").value || null,
    reintegro: null,
    fecha_reintegro: null
  };

  console.log("Datos a insertar en traslado_ambulancia:", datos);

  const { data, error } = await supabase
    .from("traslado_ambulancia")
    .insert(datos)
    .select()
    .single();

  if (error) {
    console.error("Error al insertar traslado_ambulancia:", error);
    Swal.fire("Error", "No se pudo guardar el traslado", "error");
    return;
  }

  console.log("Traslado guardado con ID:", data.id);

for (const adj of archivosAdjuntos) {
  if (!adj.archivo) continue;

  console.log("Subiendo archivo a Cloudinary:", adj.archivo.name);
  const resultado = await subirArchivoCloudinary(adj.archivo);
  console.log("Resultado Cloudinary:", resultado);

  const url = resultado; // <-- usar directamente
  if (!url) {
    console.warn("No se obtuvo URL del archivo:", adj.archivo.name);
    continue;
  }

  console.log("Insertando documento en Supabase con URL:", url);
  const { data: docData, error: errorAdj } = await supabase
    .from("fichamedica_documentos")
    .insert({
      afiliado_id: afiliadoId,
      tipo_documento: "traslado_ambulancia",
      entidad_relacion_id: data.id,
      nombre_archivo: adj.archivo.name,
      url,
      fecha_subida: new Date().toISOString()
    })
    .select()
    .single();

  if (errorAdj) {
    console.error("Error al insertar documento:", errorAdj);
  } else {
    console.log("Documento insertado correctamente:", docData);
  }
}

  form.reset();
  resetAdjuntos();
  form.classList.add("oculto");
  paginaActual = 0;
  cargarTraslados();
  Swal.fire("Guardado", "Traslado registrado correctamente", "success");
});

  /* ===================== */
  /* INIT */
  /* ===================== */
  resetAdjuntos();
  cargarTraslados();
}