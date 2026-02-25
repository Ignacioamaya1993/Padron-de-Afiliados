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

  let paginaActual = 0;
  const POR_PAGINA = 10;

  let archivosAdjuntos = [];

  /* =====================
     ELEMENTOS
  ===================== */

  const btnNuevo = document.getElementById("btnNuevaOxigenoterapia");
  const btnCancelar = document.getElementById("btnCancelarOxigenoterapia");

  const form = document.getElementById("formOxigenoterapiaForm");
  const formContainer = document.getElementById("formOxigenoterapia");

  const lista = document.getElementById("listaOxigenoterapia");

  const tipoEquipoSelect = document.getElementById("tipoEquipoOxigenoterapia");

  const adjuntosContainer = document.getElementById("adjuntosOxigenoterapiaContainer");
  const btnAgregarAdjunto = document.getElementById("btnAgregarAdjuntoOxigenoterapia");

  /* =====================
     CARGAR TIPOS EQUIPO
  ===================== */

  async function cargarTiposEquipo() {
    const { data } = await supabase
      .from("tipoequipo_oxigenoterapia")
      .select("*")
      .order("nombre");

    tipoEquipoSelect.innerHTML = `<option value="">Seleccione</option>`;

    data.forEach(t => {
      const option = document.createElement("option");
      option.value = t.id;
      option.textContent = t.nombre;
      tipoEquipoSelect.appendChild(option);
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

      btnEliminar.addEventListener("click", () => {
        archivosAdjuntos.splice(archivosAdjuntos.indexOf(wrapper), 1);
        wrapper.remove();
      });

      wrapper.appendChild(btnEliminar);
    }

    adjuntosContainer.appendChild(wrapper);
  }

  btnAgregarAdjunto.addEventListener("click", () => {
    agregarAdjuntoInput(false);
  });

  /* =====================
     LISTAR
  ===================== */

  async function cargarOxigenoterapia() {

    const desde = paginaActual * POR_PAGINA;
    const hasta = desde + POR_PAGINA - 1;

    const { data, count } = await supabase
      .from("oxigenoterapia")
      .select(`
        *,
        tipoequipo_oxigenoterapia(nombre)
      `, { count: "exact" })
      .eq("afiliado_id", afiliadoId)
      .order("fecha_inicio_tratamiento", { ascending: false })
      .range(desde, hasta);

    lista.innerHTML = "";
    renderPaginacion(count);

    if (!data.length) return;

    const ids = data.map(p => p.id);

    const { data: docs } = await supabase
      .from("fichamedica_documentos")
      .select("*")
      .eq("tipo_documento", "oxigenoterapia")
      .in("entidad_relacion_id", ids);

    const docsPorId = {};
    (docs || []).forEach(d => {
      if (!docsPorId[d.entidad_relacion_id]) {
        docsPorId[d.entidad_relacion_id] = [];
      }
      docsPorId[d.entidad_relacion_id].push(d);
    });

    const fISO = d => (d ? d.split("T")[0] : "");

    for (const p of data) {

      const documentos = docsPorId[p.id] || [];

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = p.id;
      card._adjuntosNuevos = [];
      card._adjuntosEliminar = [];

      card.innerHTML = `
        <strong>${p.tipoequipo_oxigenoterapia?.nombre || ""}</strong>

        <div class="grid-fechas">
          <div>
            <label>Fecha inicio</label>
            <input type="date" name="fecha_inicio_tratamiento" readonly value="${fISO(p.fecha_inicio_tratamiento)}">
          </div>

          <div>
            <label>Fecha fin</label>
            <input type="date" name="fecha_fin_tratamiento" readonly value="${fISO(p.fecha_fin_tratamiento)}">
          </div>
        </div>

        <div class="full-width">
          <label>Reintegro</label>
          <input type="number" step="0.01" name="reintegro" readonly value="${p.reintegro ?? ""}">
        </div>

        <div class="full-width">
          <label>Fecha reintegro</label>
          <input type="date" name="fecha_reintegro" readonly value="${fISO(p.fecha_reintegro)}">
        </div>

        <div class="full-width">
          <label>Observación</label>
          <textarea name="observacion" readonly>${p.observacion || "Sin observaciones"}</textarea>
        </div>

        ${documentos.length ? `
        <div class="adjuntos-card">
          ${documentos.map(d => `
            <div class="adjunto-item" data-doc-id="${d.id}">
              <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
              <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
            </div>`).join("")}
        </div>` : ""}

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

    const id = Number(card.dataset.id);

    /* EDITAR */

    if (e.target.classList.contains("editar")) {

      card.querySelectorAll("input, textarea").forEach(el => {
        el.removeAttribute("readonly");
      });

      card.querySelector(".guardar").classList.remove("hidden");
      card.querySelector(".cancelar").classList.remove("hidden");
      card.querySelector(".editar").classList.add("hidden");
      card.querySelector(".eliminar").classList.add("hidden");

      const contAdjuntos = card.querySelector(".adjuntos-card");

      if (contAdjuntos) {
        contAdjuntos.querySelectorAll(".btn-eliminar-adjunto").forEach(btn => {
          btn.classList.remove("hidden");

          btn.onclick = () => {
            const item = btn.closest(".adjunto-item");
            const docId = item.dataset.docId;
            card._adjuntosEliminar.push(docId);
            item.remove();
          };
        });
      }

      let nuevoAdjuntoWrapper = card.querySelector(".adjuntos-nuevos");

      if (!nuevoAdjuntoWrapper) {
        nuevoAdjuntoWrapper = document.createElement("div");
        nuevoAdjuntoWrapper.className = "adjuntos-nuevos";

        const btnNuevoAdjunto = document.createElement("button");
        btnNuevoAdjunto.type = "button";
        btnNuevoAdjunto.textContent = "➕ Agregar adjunto";

        btnNuevoAdjunto.onclick = () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".pdf,.jpg,.png";
          nuevoAdjuntoWrapper.appendChild(input);
        };

        nuevoAdjuntoWrapper.appendChild(btnNuevoAdjunto);
        card.appendChild(nuevoAdjuntoWrapper);
      }
    }

    /* CANCELAR */

    if (e.target.classList.contains("cancelar")) {
      cargarOxigenoterapia();
    }

    /* ELIMINAR */

    if (e.target.classList.contains("eliminar")) {

      const confirm = await Swal.fire({
        title: "¿Eliminar registro?",
        text: "Se eliminará la oxigenoterapia y sus adjuntos.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar"
      });

      if (!confirm.isConfirmed) return;

      await supabase
        .from("fichamedica_documentos")
        .delete()
        .eq("tipo_documento", "oxigenoterapia")
        .eq("entidad_relacion_id", id);

      await supabase
        .from("oxigenoterapia")
        .delete()
        .eq("id", id);

      Swal.fire("Eliminado", "Registro eliminado correctamente", "success");
      cargarOxigenoterapia();
    }

    /* GUARDAR */

    if (e.target.classList.contains("guardar")) {

      card._adjuntosEliminar = card._adjuntosEliminar || [];

      const datosUpdate = {
        fecha_inicio_tratamiento: card.querySelector("[name='fecha_inicio_tratamiento']").value,
        fecha_fin_tratamiento: card.querySelector("[name='fecha_fin_tratamiento']").value || null,
        observacion: card.querySelector("[name='observacion']").value || null,
        reintegro: card.querySelector("[name='reintegro']").value
          ? parseFloat(card.querySelector("[name='reintegro']").value)
          : null,
        fecha_reintegro: card.querySelector("[name='fecha_reintegro']").value || null
      };

      await supabase
        .from("oxigenoterapia")
        .update(datosUpdate)
        .eq("id", id);

      /* ELIMINAR ADJUNTOS */

      if (card._adjuntosEliminar.length) {
        await supabase
          .from("fichamedica_documentos")
          .delete()
          .in("id", card._adjuntosEliminar);
      }

      /* SUBIR NUEVOS ADJUNTOS */

      const inputs = card.querySelectorAll(".adjuntos-nuevos input[type='file']");

      for (const input of inputs) {
        if (!input.files[0]) continue;

        const archivo = input.files[0];
        const url = await subirArchivoCloudinary(archivo);
        if (!url) continue;

        await supabase
          .from("fichamedica_documentos")
          .insert({
            afiliado_id: afiliadoId,
            entidad_relacion_id: id,
            tipo_documento: "oxigenoterapia",
            nombre_archivo: archivo.name,
            url,
            fecha_subida: new Date().toISOString()
          });
      }

      Swal.fire("Actualizado", "Registro actualizado correctamente", "success");
      cargarOxigenoterapia();
    }
  });

  /* =====================
     PAGINACION
  ===================== */

  function renderPaginacion(total) {

    const contenedor = document.getElementById("paginacionOxigenoterapia");
    contenedor.innerHTML = "";

    const totalPaginas = Math.ceil(total / POR_PAGINA);

    const btnAnterior = document.createElement("button");
    btnAnterior.textContent = "⬅ Anterior";
    btnAnterior.disabled = paginaActual === 0;
    btnAnterior.onclick = () => {
      paginaActual--;
      cargarOxigenoterapia();
    };

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;
    btnSiguiente.onclick = () => {
      paginaActual++;
      cargarOxigenoterapia();
    };

    const info = document.createElement("span");
    info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas} `;

    contenedor.append(btnAnterior, info, btnSiguiente);
  }

  /* =====================
     FORM NUEVO
  ===================== */

  btnNuevo.addEventListener("click", () => {

    if (!formContainer.classList.contains("hidden")) {
      form.reset();
      resetAdjuntos();
      formContainer.classList.add("hidden");
      return;
    }

    form.reset();
    resetAdjuntos();
    formContainer.classList.remove("hidden");
  });

  btnCancelar.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    formContainer.classList.add("hidden");
  });

  form.addEventListener("submit", async e => {

    e.preventDefault();

    const datos = {
      afiliado_id: afiliadoId,
      tipoequipo_id: form.tipoequipo_id.value,
      fecha_inicio_tratamiento: form.fecha_inicio_tratamiento.value,
      fecha_fin_tratamiento: form.fecha_fin_tratamiento.value || null,
      observacion: form.observacion.value || null
    };

    const { data: nuevaOxigeno, error } = await supabase
      .from("oxigenoterapia")
      .insert(datos)
      .select()
      .single();

    if (error) {
      Swal.fire("Error", "No se pudo guardar", "error");
      return;
    }

    const inputs = adjuntosContainer.querySelectorAll("input[type='file']");

    for (const input of inputs) {
      if (!input.files[0]) continue;

      const archivo = input.files[0];
      const url = await subirArchivoCloudinary(archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "oxigenoterapia",
        entidad_relacion_id: nuevaOxigeno.id,
        nombre_archivo: archivo.name,
        url,
        fecha_subida: new Date().toISOString()
      });
    }

    form.reset();
    resetAdjuntos();
    formContainer.classList.add("hidden");

    Swal.fire("Guardado", "Registro guardado correctamente", "success");

    cargarOxigenoterapia();
  });

  /* =====================
     INIT
  ===================== */

  await cargarTiposEquipo();
  resetAdjuntos();
  cargarOxigenoterapia();
}