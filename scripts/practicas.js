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
  let paginaActual = 0;
  const POR_PAGINA = 10;

  let archivosAdjuntos = [];

  /* =====================
     ELEMENTOS
  ===================== */

  const btnNuevo = document.getElementById("btnNuevaPractica");
  const btnCancelar = document.getElementById("btnCancelarPractica");

  const form = document.getElementById("formPractica");
  const lista = document.getElementById("listaPracticas");

  const tipoSelect = document.getElementById("tipoPractica");
  const campoKinesiologo = document.getElementById("grupoKinesiologo");
  const campoLugar = document.getElementById("grupoLugar");

  const adjuntosContainer = document.getElementById("adjuntosPracticaContainer");
  const btnAgregarAdjunto = document.getElementById("btnAgregarAdjuntoPractica");

  const campoReintegroAlta = document.getElementById("campoReintegroAlta");

  /* =====================
     CAMPOS DINAMICOS
  ===================== */

  function actualizarCamposPorTipo() {
    if (!tipoSelect || !campoKinesiologo || !campoLugar) return;
    const tipo = tipoSelect.value;
    campoKinesiologo.classList.add("hidden");
    campoLugar.classList.add("hidden");

    if (tipo === "kinesiologia") campoKinesiologo.classList.remove("hidden");
    if (tipo === "resonancia" || tipo === "tomografia") campoLugar.classList.remove("hidden");
  }

  tipoSelect.addEventListener("change", actualizarCamposPorTipo);

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
      btnEliminar.className = "btn-eliminar-adjunto";

      btnEliminar.addEventListener("click", () => {
        archivosAdjuntos.splice(archivosAdjuntos.indexOf(wrapper), 1);
        wrapper.remove();
      });

      wrapper.appendChild(btnEliminar);
    }

    adjuntosContainer.appendChild(wrapper);
  }

  btnAgregarAdjunto.addEventListener("click", () => agregarAdjuntoInput(false));

  /* =====================
     LISTAR PRACTICAS
  ===================== */

  async function cargarPracticas() {
    const desde = paginaActual * POR_PAGINA;
    const hasta = desde + POR_PAGINA - 1;

    const { data: practicas, error, count } = await supabase
      .from("practicas")
      .select("*", { count: "exact" })
      .eq("afiliado_id", afiliadoId)
      .order("fecha_carga", { ascending: false })
      .range(desde, hasta);

    if (error) {
      console.error(error);
      return;
    }

    lista.innerHTML = "";

    renderPaginacion(count);

    if (!practicas.length) return;

    const ids = practicas.map(p => p.id);

    const { data: docs } = await supabase
      .from("fichamedica_documentos")
      .select("*")
      .eq("tipo_documento", "practicas")
      .in("entidad_relacion_id", ids);

    const docsPorPractica = {};
    (docs || []).forEach(d => {
      if (!docsPorPractica[d.entidad_relacion_id]) docsPorPractica[d.entidad_relacion_id] = [];
      docsPorPractica[d.entidad_relacion_id].push(d);
    });

    const fISO = d => (d ? d.split("T")[0] : "");

    for (const p of practicas) {
      const documentos = docsPorPractica[p.id] || [];

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = p.id;
      card._adjuntosNuevos = [];
      card._adjuntosEliminar = [];

      let primerSeccion = "";
      if (p.tipo === "kinesiologia") {
        primerSeccion = `
          <div><label>Fecha carga</label>
            <input type="date" name="fecha_carga" readonly value="${fISO(p.fecha_carga)}">
          </div>
          <div><label>Kinesiólogo</label>
            <input name="nombre_kinesiologo" readonly value="${p.nombre_kinesiologo || ""}">
          </div>
          <div><label>Fecha orden</label>
            <input type="date" name="fecha_orden" readonly value="${fISO(p.fecha_orden)}">
          </div>
          <div><label>Fecha recepción</label>
            <input type="date" name="fecha_recepcion_orden" readonly value="${fISO(p.fecha_recepcion_orden)}">
          </div>
        `;
      } else if (p.tipo === "resonancia" || p.tipo === "tomografia") {
        primerSeccion = `
          <div><label>Fecha carga</label>
            <input type="date" name="fecha_carga" readonly value="${fISO(p.fecha_carga)}">
          </div>
          <div><label>Lugar</label>
            <input name="lugar" readonly value="${p.lugar || ""}">
          </div>
          <div><label>Fecha orden</label>
            <input type="date" name="fecha_orden" readonly value="${fISO(p.fecha_orden)}">
          </div>
          <div><label>Fecha recepción</label>
            <input type="date" name="fecha_recepcion_orden" readonly value="${fISO(p.fecha_recepcion_orden)}">
          </div>
        `;
      }

      card.innerHTML = `
        <strong>${p.tipo.toUpperCase()}</strong>

        <div class="card-principal card-grid">
          ${primerSeccion}
        </div>

        <div class="card-extra card-grid">
          <div><label>Autorización</label>
            <select name="autorizacion" disabled>
              <option value="true" ${p.autorizacion ? "selected" : ""}>Sí</option>
              <option value="false" ${!p.autorizacion ? "selected" : ""}>No</option>
            </select>
          </div>
          <div><label>Fecha autorización</label>
            <input type="date" name="fecha_autorizacion" readonly value="${fISO(p.fecha_autorizacion)}">
          </div>
          <div><label>Reintegro</label>
            <input type="number" step="0.01" name="reintegro" readonly value="${p.reintegro ?? ""}">
          </div>
          <div><label>Fecha reintegro</label>
            <input type="date" name="fecha_reintegro" readonly value="${fISO(p.fecha_reintegro)}">
          </div>
          <div class="full-width"><label>Observación</label>
            <textarea name="observacion" readonly>${p.observacion || "Sin observaciones"}</textarea>
          </div>

          ${documentos.length ? `
          <div class="adjuntos-card full-width">
            ${documentos.map(d => `
              <div class="adjunto-item" data-doc-id="${d.id}">
                <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
                <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
              </div>
            `).join("")}
          </div>` : ""}
        </div>

        <button type="button" class="toggle-card">Ver más</button>

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
     ACCIONES CARD (UNIFICADO)
  ===================== */

  if (!window._practicasListenerAgregado) {
    window._practicasListenerAgregado = true;

    lista.addEventListener("click", async e => {
      const card = e.target.closest(".card");
      if (!card) return;
      const id = card.dataset.id;

      // --- VER MÁS / VER MENOS ---
      if (e.target.classList.contains("toggle-card")) {
        const extra = card.querySelector(".card-extra");
        if (!extra) return;
        extra.classList.toggle("mostrar");
        e.target.textContent = extra.classList.contains("mostrar") ? "Ver menos" : "Ver más";
        return;
      }

      // --- EDITAR ---
      if (e.target.classList.contains("editar")) {
        const extra = card.querySelector(".card-extra");
        if (extra) extra.classList.add("mostrar");

        card.querySelectorAll("input, textarea").forEach(el => el.removeAttribute("readonly"));
        card.querySelectorAll("select").forEach(sel => sel.removeAttribute("disabled"));

        card.querySelector(".guardar").classList.remove("hidden");
        card.querySelector(".cancelar").classList.remove("hidden");
        card.querySelector(".editar").classList.add("hidden");
        card.querySelector(".eliminar").classList.add("hidden");

        let adjuntosCard = card.querySelector(".adjuntos-card");
        if (!adjuntosCard) {
          adjuntosCard = document.createElement("div");
          adjuntosCard.className = "adjuntos-card";
          card.insertBefore(adjuntosCard, card.querySelector(".acciones"));
        }

        adjuntosCard.querySelectorAll(".btn-eliminar-adjunto").forEach(btn => btn.classList.remove("hidden"));

        if (!adjuntosCard.querySelector(".btn-agregar-adjunto-card")) {
          const btnAgregar = document.createElement("button");
          btnAgregar.type = "button";
          btnAgregar.textContent = "➕ Agregar adjunto";
          btnAgregar.className = "btn-agregar-adjunto-card";
          adjuntosCard.appendChild(btnAgregar);
        }

        card._adjuntosNuevos = card._adjuntosNuevos || [];
        card._adjuntosEliminar = card._adjuntosEliminar || [];
        return;
      }

      // --- CANCELAR ---
      if (e.target.classList.contains("cancelar")) {
        cargarPracticas();
        return;
      }

      // --- GUARDAR ---
      if (e.target.classList.contains("guardar")) {
        const btnGuardar = e.target;
        const originalText = btnGuardar.textContent;

        btnGuardar.disabled = true;
        btnGuardar.textContent = "⌛ Guardando...";
        btnGuardar.style.backgroundColor = "#aaa";
        btnGuardar.style.cursor = "not-allowed";

        try {
          const datosUpdate = {
            fecha_carga: card.querySelector("[name='fecha_carga']").value,
            fecha_orden: card.querySelector("[name='fecha_orden']").value || null,
            fecha_recepcion_orden: card.querySelector("[name='fecha_recepcion_orden']").value || null,
            fecha_autorizacion: card.querySelector("[name='fecha_autorizacion']").value || null,
            autorizacion: card.querySelector("[name='autorizacion']").value === "true",
            nombre_kinesiologo: card.querySelector("[name='nombre_kinesiologo']")?.value || null,
            lugar: card.querySelector("[name='lugar']")?.value || null,
            observacion: card.querySelector("[name='observacion']").value || null,
            reintegro: card.querySelector("[name='reintegro']").value
              ? parseFloat(card.querySelector("[name='reintegro']").value)
              : null,
            fecha_reintegro: card.querySelector("[name='fecha_reintegro']").value || null,
          };

          console.log("Actualizando práctica ID:", id, datosUpdate);
          await supabase.from("practicas").update(datosUpdate).eq("id", id);

          console.log("Adjuntos nuevos antes de subir:", card._adjuntosNuevos);
          for (const wrapper of card._adjuntosNuevos || []) {
            if (!wrapper.archivo) continue;
            console.log("Subiendo archivo:", wrapper.archivo.name);
            const url = await subirArchivoCloudinary(wrapper.archivo);
            await supabase.from("fichamedica_documentos").insert({
              afiliado_id: afiliadoId,
              tipo_documento: "practicas",
              entidad_relacion_id: id,
              nombre_archivo: wrapper.archivo.name,
              url
            });
          }

          console.log("Adjuntos a eliminar:", card._adjuntosEliminar);
          for (const docId of card._adjuntosEliminar || []) {
            console.log("Eliminando adjunto ID:", docId);
            await supabase.from("fichamedica_documentos").delete().eq("id", docId);
          }

          await Swal.fire({
            icon: "success",
            title: "Guardado",
            text: "Cambios guardados correctamente",
            confirmButtonText: "OK"
          });

          cargarPracticas();

        } catch (err) {
          console.error("Error guardando cambios:", err);
          await Swal.fire({
            icon: "error",
            title: "Error",
            text: "Hubo un problema al guardar los cambios"
          });
        } finally {
          btnGuardar.disabled = false;
          btnGuardar.textContent = originalText;
          btnGuardar.style.backgroundColor = "";
          btnGuardar.style.cursor = "";
        }

        return;
      }

      // --- ELIMINAR PRÁCTICA ---
      if (e.target.classList.contains("eliminar")) {
        const confirmar = await Swal.fire({
          title: "¿Está seguro?",
          text: "Se eliminará esta práctica y todos sus adjuntos.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
        });
        if (!confirmar.isConfirmed) return;

        await supabase.from("practicas").delete().eq("id", id);

        await Swal.fire({
          title: "Eliminado",
          text: "La práctica se eliminó correctamente",
          icon: "success",
          confirmButtonText: "OK"
        });

        cargarPracticas();
        return;
      }

      // --- AGREGAR ADJUNTO NUEVO ---
      if (e.target.classList.contains("btn-agregar-adjunto-card")) {
        const wrapper = document.createElement("div");
        wrapper.className = "adjunto-item-nuevo";

        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".pdf,.jpg,.png";
        input.addEventListener("change", () => wrapper.archivo = input.files[0] || null);
        wrapper.archivo = null;

        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.textContent = "✖";
        btnEliminar.className = "btn-eliminar-adjunto";

        btnEliminar.addEventListener("click", () => {
          card._adjuntosNuevos = card._adjuntosNuevos.filter(a => a !== wrapper);
          wrapper.remove();
        });

        wrapper.appendChild(input);
        wrapper.appendChild(btnEliminar);

        card._adjuntosNuevos = card._adjuntosNuevos || [];
        card._adjuntosNuevos.push(wrapper);

        e.target.before(wrapper);
        return;
      }

      // --- ELIMINAR ADJUNTO EXISTENTE ---
      if (e.target.classList.contains("btn-eliminar-adjunto")) {
        const item = e.target.closest(".adjunto-item, .adjunto-item-nuevo");
        if (!item) return;

        if (item.dataset.docId) {
          card._adjuntosEliminar = card._adjuntosEliminar || [];
          if (!card._adjuntosEliminar.includes(item.dataset.docId)) {
            card._adjuntosEliminar.push(item.dataset.docId);
          }
        }

        if (item.classList.contains("adjunto-item-nuevo")) {
          card._adjuntosNuevos = card._adjuntosNuevos.filter(a => a !== item);
        }

        item.remove();
        return;
      }

    });
  }

  /* =====================
     PAGINACIÓN
  ===================== */
  
  function renderPaginacion(total) {
    const contenedor = document.getElementById("paginacionPracticas");
    contenedor.innerHTML = "";

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

    contenedor.append(btnAnterior, info, btnSiguiente);
  }

  /* =====================
     FORM NUEVO
  ===================== */

  btnNuevo.addEventListener("click", () => {
    if (!form.classList.contains("hidden")) {
        form.reset();
        resetAdjuntos();
        form.classList.add("hidden");
        return;
    }

    form.reset();
    resetAdjuntos();
    form.classList.remove("hidden");
    actualizarCamposPorTipo();
  });

  btnCancelar.addEventListener("click", () => form.classList.add("hidden"));

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const datos = {
      afiliado_id: afiliadoId,
      tipo: tipoSelect.value,
      fecha_carga: form.fecha_carga.value,
      fecha_orden: form.fecha_orden.value || null,
      fecha_recepcion_orden: form.fecha_recepcion_orden.value || null,
      fecha_autorizacion: form.fecha_autorizacion.value || null,
      autorizacion: form.autorizacion.value === "true",
      nombre_kinesiologo: form.nombre_kinesiologo?.value || null,
      lugar: form.lugar?.value || null,
      observacion: form.observacion.value || null,
      reintegro: form.reintegro.value ? parseFloat(form.reintegro.value) : null,
      fecha_reintegro: form.fecha_reintegro.value || null
    };

    try {
      const { data: nueva, error } = await supabase.from("practicas").insert(datos).select();
      if (error) throw error;

      for (const wrapper of archivosAdjuntos) {
        if (!wrapper.archivo) continue;
        const url = await subirArchivoCloudinary(wrapper.archivo);
        await supabase.from("fichamedica_documentos").insert({
          afiliado_id: afiliadoId,
          tipo_documento: "practicas",
          entidad_relacion_id: nueva[0].id,
          nombre_archivo: wrapper.archivo.name,
          url
        });
      }

      await Swal.fire({ icon: "success", title: "Creado", text: "Práctica creada correctamente" });

      form.classList.add("hidden");
      cargarPracticas();
    } catch (err) {
      console.error(err);
      await Swal.fire({ icon: "error", title: "Error", text: "No se pudo crear la práctica" });
    }
  });

  /* =====================
     CARGAR INICIAL
  ===================== */

  cargarPracticas();
}