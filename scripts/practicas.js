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

  // Ocultar ambos primero
  campoKinesiologo.classList.add("hidden");
  campoLugar.classList.add("hidden");

  // Mostrar según tipo
  if (tipo === "kinesiologia") {
    campoKinesiologo.classList.remove("hidden");
  }

  if (tipo === "resonancia" || tipo === "tomografia") {
    campoLugar.classList.remove("hidden");
  }
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

  btnAgregarAdjunto.addEventListener("click", () => {
    agregarAdjuntoInput(false);
  });

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
    docs.forEach(d => {
      if (!docsPorPractica[d.entidad_relacion_id]) {
        docsPorPractica[d.entidad_relacion_id] = [];
      }
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

      card.innerHTML = `
        <strong>${p.tipo.toUpperCase()}</strong>

        <div class="grid-fechas">
          <div><label>Fecha carga</label><input type="date" name="fecha_carga" readonly value="${fISO(p.fecha_carga)}"></div>
          <div><label>Fecha orden</label><input type="date" name="fecha_orden" readonly value="${fISO(p.fecha_orden)}"></div>
          <div><label>Fecha recepción</label><input type="date" name="fecha_recepcion_orden" readonly value="${fISO(p.fecha_recepcion_orden)}"></div>

        <div>
        <label>Autorización</label>
        <select name="autorizacion" disabled>
            <option value="true" ${p.autorizacion ? "selected" : ""}>Sí</option>
            <option value="false" ${!p.autorizacion ? "selected" : ""}>No</option>
        </select>        
        </div>

          <div><label>Fecha autorización</label><input type="date" name="fecha_autorizacion" readonly value="${fISO(p.fecha_autorizacion)}"></div>

        </div>

        ${p.nombre_kinesiologo ? `
        <div>
          <label>Kinesiólogo</label>
          <input name="nombre_kinesiologo" readonly value="${p.nombre_kinesiologo}">
        </div>` : ""}

        ${p.lugar ? `
        <div>
          <label>Lugar</label>
        <select name="lugar" disabled>
        <option value="">Seleccione</option>
        <option value="Maria Auxiliadora" ${p.lugar === "Maria Auxiliadora" ? "selected" : ""}>Maria Auxiliadora</option>
        <option value="CEMEDA" ${p.lugar === "CEMEDA" ? "selected" : ""}>CEMEDA</option>
        </select>
        </div>` : ""}

        ${p.prestador ? `
        <div>
          <label>Prestador</label>
          <input readonly value="${p.prestador}">
        </div>` : ""}

        <div><label>Reintegro</label><input type="number" step="0.01" name="reintegro" readonly value="${p.reintegro ?? ""}"></div>

    <div class="full-width fecha-reintegro">
      <label>Fecha reintegro</label>
      <input type="date" name="fecha_reintegro" readonly value="${fISO(p.fecha_reintegro)}">
    </div>

        <div class="med-card-section">
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

  const id = card.dataset.id;

  /* ========= EDITAR ========= */

  if (e.target.classList.contains("editar")) {

/* ===== ADJUNTOS EN EDICIÓN ===== */

let adjuntosCard = card.querySelector(".adjuntos-card");

// Si no existe, crearlo
if (!adjuntosCard) {
  adjuntosCard = document.createElement("div");
  adjuntosCard.className = "adjuntos-card";
  card.insertBefore(adjuntosCard, card.querySelector(".acciones"));
}

// Mostrar botones eliminar para existentes
adjuntosCard.querySelectorAll(".adjunto-item").forEach(item => {
  const btn = item.querySelector(".btn-eliminar-adjunto");
  if (!btn) return;
  btn.classList.remove("hidden");

  btn.addEventListener("click", () => {
    const docId = item.dataset.docId;
    if (docId) card._adjuntosEliminar.push(docId);
    item.remove();
  });
});

// Agregar botón "Agregar adjunto" si no existe
if (!adjuntosCard.querySelector(".btn-agregar-adjunto-card")) {
  const btnAgregar = document.createElement("button");
  btnAgregar.type = "button";
  btnAgregar.textContent = "➕ Agregar adjunto";
  btnAgregar.className = "btn-agregar-adjunto-card";

  btnAgregar.addEventListener("click", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "adjunto-item";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.png";

    input.addEventListener("change", () => {
      wrapper.archivo = input.files[0] || null;
    });

    wrapper.archivo = null;
    card._adjuntosNuevos.push(wrapper);

    wrapper.appendChild(input);

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.textContent = "✖";
    btnEliminar.className = "btn-eliminar-adjunto";

    btnEliminar.addEventListener("click", () => {
      card._adjuntosNuevos = card._adjuntosNuevos.filter(a => a !== wrapper);
      wrapper.remove();
    });

    wrapper.appendChild(btnEliminar);
    adjuntosCard.appendChild(wrapper);
  });

  adjuntosCard.appendChild(btnAgregar);
}

    card.querySelectorAll("input, textarea").forEach(el => {
    if (el.name !== "prestador") {
        el.removeAttribute("readonly");
    }
    });

    card.querySelectorAll("select").forEach(sel => {
    sel.removeAttribute("disabled");
    });

    card.querySelector(".guardar").classList.remove("hidden");
    card.querySelector(".cancelar").classList.remove("hidden");

    card.querySelector(".editar").classList.add("hidden");
    card.querySelector(".eliminar").classList.add("hidden");
  }

  /* ========= CANCELAR ========= */

  if (e.target.classList.contains("cancelar")) {
    cargarPracticas();
  }

  /* ========= GUARDAR ========= */

  if (e.target.classList.contains("guardar")) {

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

    await supabase
      .from("practicas")
      .update(datosUpdate)
      .eq("id", id);

      /* ===== PROCESAR ADJUNTOS NUEVOS ===== */

for (const adj of card._adjuntosNuevos) {
  if (!adj.archivo) continue;

  const url = await subirArchivoCloudinary(adj.archivo);

  await supabase.from("fichamedica_documentos").insert({
    afiliado_id: afiliadoId,
    tipo_documento: "practicas",
    entidad_relacion_id: id,
    nombre_archivo: adj.archivo.name,
    url
  });
}

/* ===== ELIMINAR ADJUNTOS MARCADOS ===== */

for (const docId of card._adjuntosEliminar) {
  await supabase
    .from("fichamedica_documentos")
    .delete()
    .eq("id", docId);
}

    Swal.fire("Guardado", "Cambios guardados correctamente", "success");
    cargarPracticas();
  }

  /* ========= ELIMINAR ========= */

  if (e.target.classList.contains("eliminar")) {

    const confirmar = await Swal.fire({
      title: "¿Está seguro?",
      text: "Se eliminará esta practica y todos sus adjuntos.",
      icon: "warning",
      showCancelButton: true
    });

    if (!confirmar.isConfirmed) return;

    await supabase
      .from("practicas")
      .delete()
      .eq("id", id);

    cargarPracticas();
  }

});

  function renderPaginacion(total) {

    const contenedor = document.getElementById("paginacionPracticas");
    contenedor.innerHTML = "";

    const totalPaginas = Math.ceil(total / POR_PAGINA);

    const btnAnterior = document.createElement("button");
    btnAnterior.textContent = "⬅ Anterior";
    btnAnterior.disabled = paginaActual === 0;

    btnAnterior.onclick = () => {
      paginaActual--;
      cargarPracticas();
    };

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;

    btnSiguiente.onclick = () => {
      paginaActual++;
      cargarPracticas();
    };

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
    actualizarCamposPorTipo();
    campoReintegroAlta.classList.add("hidden");
    form.classList.remove("hidden");
    });

  btnCancelar.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const tipo = form.tipo.value;

    let prestador = null;

    if (tipo === "resonancia") {
      prestador = "Resonancias del Centro";
    }

    if (tipo === "tomografia") {
      prestador = "Imagenes Azul";
    }

    const datos = {
      afiliado_id: afiliadoId,
      tipo,
      fecha_carga: form.fecha_carga.value,
      fecha_orden: form.fecha_orden.value || null,
      fecha_recepcion_orden: form.fecha_recepcion_orden.value || null,
      autorizacion: form.autorizacion.value === "true",
      fecha_autorizacion: form.fecha_autorizacion.value || null,
      observacion: form.observacion.value || null,
      nombre_kinesiologo: form.nombre_kinesiologo?.value || null,
      lugar: form.lugar?.value || null,
      prestador,
      reintegro: form.reintegro?.value
      ? parseFloat(form.reintegro.value)
      : null,
    };

    const { data } = await supabase
      .from("practicas")
      .insert(datos)
      .select()
      .single();

    for (const adj of archivosAdjuntos) {
      if (!adj.archivo) continue;

      const url = await subirArchivoCloudinary(adj.archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "practicas",
        entidad_relacion_id: data.id,
        nombre_archivo: adj.archivo.name,
        url
      });
    }

    form.reset();
    resetAdjuntos();
    form.classList.add("hidden");
    cargarPracticas();

    Swal.fire("Guardado", "Práctica guardada correctamente", "success");
  });

  /* =====================
     INIT
  ===================== */

  resetAdjuntos();
  cargarPracticas();
}