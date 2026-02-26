import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

export async function init(afiliadoId) {

  if (!afiliadoId) {
    Swal.fire("Error", "Afiliado no encontrado", "error");
    throw new Error("ID afiliado faltante");
  }

  await cargarHeader();

  /* =======================
     ESTADO
  ======================= */

  let paginaActual = 0;
  const POR_PAGINA = 10;

  /* =======================
     ELEMENTOS
  ======================= */

  const btnNuevo = document.getElementById("btnNuevoExpedienteDiscapacidad");
  const btnCancelar = document.getElementById("btnCancelarExpedienteDiscapacidad");

  const form = document.getElementById("formExpedienteDiscapacidadForm");
  const formContainer = document.getElementById("formExpedienteDiscapacidad");

  const lista = document.getElementById("listaExpedienteDiscapacidad");
  const paginacion = document.getElementById("paginacionExpedienteDiscapacidad");

  const tipoSelect = document.getElementById("tipoExpedienteDiscapacidad");

  const adjuntosContainer = document.getElementById("adjuntosExpedienteDiscapacidadContainer");
  const btnAgregarAdjunto = document.getElementById("btnAgregarAdjuntoExpedienteDiscapacidad");

  /* =======================
     CARGAR TIPOS
  ======================= */

  async function cargarTipos() {

    const { data } = await supabase
      .from("tipo_expediente_discapacidad")
      .select("*")
      .order("nombre");

    tipoSelect.innerHTML = `<option value="">Seleccione</option>`;

    data.forEach(t => {
      const option = document.createElement("option");
      option.value = t.id;
      option.textContent = t.nombre;
      tipoSelect.appendChild(option);
    });
  }

  /* =======================
     ADJUNTOS ALTA
  ======================= */

  function resetAdjuntos() {
    adjuntosContainer.innerHTML = "";
    agregarAdjuntoInput(true);
  }

  function agregarAdjuntoInput(obligatorio = false) {

    const wrapper = document.createElement("div");
    wrapper.className = "adjunto-item";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.png";

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

  btnAgregarAdjunto.addEventListener("click", () => {
    agregarAdjuntoInput(false);
  });

  /* =======================
     LISTAR
  ======================= */

  async function cargarExpedientes() {

    const desde = paginaActual * POR_PAGINA;
    const hasta = desde + POR_PAGINA - 1;

    const { data, count } = await supabase
      .from("expediente_discapacidad")
      .select(`
        *,
        tipo_expediente_discapacidad(nombre)
      `, { count: "exact" })
      .eq("afiliado_id", afiliadoId)
      .order("fecha_inicio", { ascending: false })
      .range(desde, hasta);

    lista.innerHTML = "";
    renderPaginacion(count);

    if (!data?.length) return;

    const ids = data.map(d => d.id);

    const { data: docs } = await supabase
      .from("fichamedica_documentos")
      .select("*")
      .eq("tipo_documento", "expediente_discapacidad")
      .in("entidad_relacion_id", ids);

    const docsPorId = {};
    (docs || []).forEach(d => {
      if (!docsPorId[d.entidad_relacion_id]) {
        docsPorId[d.entidad_relacion_id] = [];
      }
      docsPorId[d.entidad_relacion_id].push(d);
    });

    const fISO = d => d ? d.split("T")[0] : "";

    for (const exp of data) {

      const documentos = docsPorId[exp.id] || [];

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = exp.id;
      card._adjuntosEliminar = [];

      card.innerHTML = `
        <strong>${exp.tipo_expediente_discapacidad?.nombre || ""}</strong>

        <div class="grid-fechas">
          <div>
            <label>Fecha inicio</label>
            <input type="date" name="fecha_inicio" readonly value="${fISO(exp.fecha_inicio)}">
          </div>

          <div>
            <label>Fecha finalización</label>
            <input type="date" name="fecha_finalizacion" readonly value="${fISO(exp.fecha_finalizacion)}">
          </div>
        </div>

        <div class="full-width">
          <label>Reintegro</label>
          <input type="number" step="0.01" name="reintegro" readonly value="${exp.reintegro ?? ""}">
        </div>

        <div class="full-width">
          <label>Fecha reintegro</label>
          <input type="date" name="fecha_reintegro" readonly value="${fISO(exp.fecha_reintegro)}">
        </div>

        <div class="full-width">
          <label>Observación</label>
          <textarea name="observacion" readonly>${exp.observacion || "Sin observaciones"}</textarea>
        </div>

        ${documentos.length ? `
        <div class="adjuntos-card">
          ${documentos.map(d => `
            <div class="adjunto-item" data-doc-id="${d.id}">
              <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
              <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
            </div>
          `).join("")}
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

  /* =======================
     ACCIONES CARD
  ======================= */

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
            card._adjuntosEliminar.push(item.dataset.docId);
            item.remove();
          };
        });
      }

      let nuevoAdjuntoWrapper = card.querySelector(".adjuntos-nuevos");

      if (!nuevoAdjuntoWrapper) {
        nuevoAdjuntoWrapper = document.createElement("div");
        nuevoAdjuntoWrapper.className = "adjuntos-nuevos";

        const btnNuevo = document.createElement("button");
        btnNuevo.type = "button";
        btnNuevo.textContent = "➕ Agregar adjunto";

        btnNuevo.onclick = () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".pdf,.jpg,.png";
          nuevoAdjuntoWrapper.appendChild(input);
        };

        nuevoAdjuntoWrapper.appendChild(btnNuevo);
        card.appendChild(nuevoAdjuntoWrapper);
      }
    }

    /* CANCELAR */

    if (e.target.classList.contains("cancelar")) {
      cargarExpedientes();
    }

    /* ELIMINAR */

    if (e.target.classList.contains("eliminar")) {

      const confirm = await Swal.fire({
          title: '¿Está seguro?',
          text: "Se eliminará el expediente de discapacidad y sus adjuntos.",
          icon: "warning",
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'     
      });

      if (!confirm.isConfirmed) return;

      await supabase.from("fichamedica_documentos")
        .delete()
        .eq("tipo_documento", "expediente_discapacidad")
        .eq("entidad_relacion_id", id);

      await supabase.from("expediente_discapacidad")
        .delete()
        .eq("id", id);

      Swal.fire("Eliminado", "", "success");
      cargarExpedientes();
    }

    /* GUARDAR */

    if (e.target.classList.contains("guardar")) {

      const datosUpdate = {
        fecha_inicio: card.querySelector("[name='fecha_inicio']").value,
        fecha_finalizacion: card.querySelector("[name='fecha_finalizacion']").value || null,
        observacion: card.querySelector("[name='observacion']").value || null,
        reintegro: card.querySelector("[name='reintegro']").value || null,
        fecha_reintegro: card.querySelector("[name='fecha_reintegro']").value || null
      };

      await supabase
        .from("expediente_discapacidad")
        .update(datosUpdate)
        .eq("id", id);

      if (card._adjuntosEliminar.length) {
        await supabase
          .from("fichamedica_documentos")
          .delete()
          .in("id", card._adjuntosEliminar);
      }

      const inputs = card.querySelectorAll(".adjuntos-nuevos input[type='file']");

      for (const input of inputs) {
        if (!input.files[0]) continue;

        const archivo = input.files[0];
        const url = await subirArchivoCloudinary(archivo);
        if (!url) continue;

        await supabase.from("fichamedica_documentos").insert({
          afiliado_id: afiliadoId,
          entidad_relacion_id: id,
          tipo_documento: "expediente_discapacidad",
          nombre_archivo: archivo.name,
          url,
          fecha_subida: new Date().toISOString()
        });
      }

      Swal.fire("Guardado", "", "success");
      cargarExpedientes();
    }

  });

  /* =======================
     PAGINACION
  ======================= */

  function renderPaginacion(total) {

    paginacion.innerHTML = "";
    const totalPaginas = Math.ceil(total / POR_PAGINA);

    const btnAnt = document.createElement("button");
    btnAnt.textContent = "⬅";
    btnAnt.disabled = paginaActual === 0;
    btnAnt.onclick = () => { paginaActual--; cargarExpedientes(); };

    const btnSig = document.createElement("button");
    btnSig.textContent = "➡";
    btnSig.disabled = paginaActual >= totalPaginas - 1;
    btnSig.onclick = () => { paginaActual++; cargarExpedientes(); };

    const info = document.createElement("span");
    info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas} `;

    paginacion.append(btnAnt, info, btnSig);
  }

  /* =======================
     FORM NUEVO
  ======================= */

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
      tipo_expediente_id: form.tipo_expediente_id.value,
      fecha_inicio: form.fecha_inicio.value,
      fecha_finalizacion: form.fecha_finalizacion.value || null,
      observacion: form.observacion.value || null
    };

    const { data: nuevo, error } = await supabase
      .from("expediente_discapacidad")
      .insert(datos)
      .select()
      .single();

    if (error) {
      Swal.fire("Error", "", "error");
      return;
    }

    const inputs = adjuntosContainer.querySelectorAll("input[type='file']");

    for (const input of inputs) {
      if (!input.files[0]) continue;

      const archivo = input.files[0];
      const url = await subirArchivoCloudinary(archivo);
      if (!url) continue;

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        entidad_relacion_id: nuevo.id,
        tipo_documento: "expediente_discapacidad",
        nombre_archivo: archivo.name,
        url,
        fecha_subida: new Date().toISOString()
      });
    }

    form.reset();
    resetAdjuntos();
    formContainer.classList.add("hidden");

    Swal.fire("Guardado", "", "success");
    cargarExpedientes();
  });

  /* =======================
     INIT
  ======================= */

  await cargarTipos();
  resetAdjuntos();
  cargarExpedientes();
}