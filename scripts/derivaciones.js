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
  const POR_PAGINA = 12;
  let paginaActual = 0;

  /* =====================
     ELEMENTOS
  ===================== */
  const btnNuevo = document.getElementById("btnNuevaDerivacion");
  const btnCancelar = document.getElementById("btnCancelarDerivacion");
  const form = document.getElementById("formDerivacion");
  const contenedor = document.getElementById("contenedorDerivaciones");
  const paginacion = document.getElementById("paginacionDerivaciones");
  const tipoSelect = document.getElementById("tipoDerivacion");
  const btnAgregarAdjuntoForm = document.getElementById("btnAgregarAdjuntoForm");
  const adjuntosFormLista = document.getElementById("adjuntosFormLista");

  /* =====================
     TIPOS DERIVACIONES
  ===================== */
  async function cargarTipos() {
    const { data, error } = await supabase
      .from("tipo_derivaciones")
      .select("id, nombre")
      .order("nombre");

    if (error) return console.error(error);

    tipoSelect.innerHTML = `<option value="">Seleccione...</option>`;
    data.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nombre;
      tipoSelect.appendChild(opt);
    });
  }

  /* =====================
     RESET ADJUNTOS
  ===================== */
  function resetAdjuntos() {
    archivosAdjuntos = [];
    if (adjuntosFormLista) {
      adjuntosFormLista.innerHTML = "";
      crearInputAdjunto(true);
    }
  }

    function crearInputAdjunto(esObligatorio = false) {
      const wrapper = document.createElement("div");
      wrapper.className = "adjunto-item-nuevo";

      const input = document.createElement("input");
      input.type = "file";

      wrapper.appendChild(input);

      // Solo agregar botón eliminar si NO es el obligatorio
      if (!esObligatorio) {
        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.textContent = "✖";
        btnEliminar.classList.add("btn-eliminar-adjunto");

        btnEliminar.addEventListener("click", () => {
          wrapper.remove();
        });

        wrapper.appendChild(btnEliminar);
      }

      adjuntosFormLista.appendChild(wrapper);
    }

  /* =====================
     CARGAR DERIVACIONES
  ===================== */
  async function cargarDerivaciones() {
    const { data, count, error } = await supabase
      .from("derivaciones")
      .select("*", { count: "exact" })
      .eq("afiliado_id", afiliadoId)
      .order("fecha_inicio", { ascending: false })
      .range(paginaActual * POR_PAGINA, paginaActual * POR_PAGINA + POR_PAGINA - 1);

    if (error) return console.error(error);

    contenedor.innerHTML = "";

    if (!data || !data.length) {
      renderPaginacion(0);
      return;
    }

    const fISO = d => d ? d.split("T")[0] : "";

    for (const deriv of data) {
      // Traer documentos desde fichamedica_documentos
      let docs = [];
      try {
        const { data: docsData, error: docsError } = await supabase
          .from("fichamedica_documentos")
          .select("*")
          .eq("tipo_documento", "derivaciones")
          .eq("entidad_relacion_id", deriv.id);

        if (docsError) console.error("Error cargando documentos:", docsError);
        docs = docsData || [];
      } catch (err) {
        console.error("Error inesperado al cargar documentos:", err);
        docs = [];
      }

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = deriv.id;
      card._adjuntosNuevos = [];
      card._adjuntosEliminar = [];

      // Calcular días de demora
      let diasDemora = null;
      if (deriv.fecha_inicio && deriv.fecha_autorizacion) {
        diasDemora = (new Date(deriv.fecha_inicio) - new Date(deriv.fecha_autorizacion)) / (1000*60*60*24);
      }

card.innerHTML = `
  <strong>
    ${deriv.tipo_derivacion_id 
      ? tipoSelect.querySelector('option[value="'+deriv.tipo_derivacion_id+'"]')?.textContent 
      : "-"}
  </strong>

  <!-- CONTENIDO SIEMPRE VISIBLE -->
  <div class="card-content">
    <div class="med-card-section grid-fechas">
      <div><label>Fecha Inicio</label>
        <input type="date" name="fecha_inicio" readonly value="${fISO(deriv.fecha_inicio)}">
      </div>

      <div><label>Fecha Fin</label>
        <input type="date" name="fecha_fin" readonly value="${fISO(deriv.fecha_fin)}">
      </div>

      <div><label>Lugar</label>
        <input name="lugar" readonly value="${deriv.lugar || ""}">
      </div>

      <div><label>Estado</label>
        <input name="estado" readonly value="${deriv.estado || ""}">
      </div>
    </div>
  </div>

  <!-- CONTENIDO EXPANDIBLE -->
  <div class="card-extra">

    <div class="med-card-section grid-fechas">
      <div><label>Fecha Turno</label>
        <input type="date" name="fecha_turno" readonly value="${fISO(deriv.fecha_turno)}">
      </div>

      <div><label>Fecha Orden Médico</label>
        <input type="date" name="fecha_orden_medico" readonly value="${fISO(deriv.fecha_orden_medico)}">
      </div>

      <div><label>Fecha que trajo orden</label>
        <input type="date" name="fecha_orden_recibida" readonly value="${fISO(deriv.fecha_orden_recibida)}">
      </div>

      <div><label>Fecha Autorización</label>
        <input type="date" name="fecha_autorizacion" readonly value="${fISO(deriv.fecha_autorizacion)}">
      </div>

      <div><label>Autorizado por</label>
        <input name="autorizado_por" readonly value="${deriv.autorizado_por || ""}">
      </div>

      <div><label>Días Demora</label>
        <input name="dias_demora" readonly value="${diasDemora !== null ? diasDemora : ""}">
      </div>

      <div><label>Nro Carga</label>
        <input name="nro_carga" readonly value="${deriv.nro_carga || ""}">
      </div>

      <div>
        <label>Reintegro</label>
        <input type="number" step="0.01" name="reintegro" readonly value="${deriv.reintegro ?? ""}">
      </div>

      <div>
        <label>Fecha Reintegro</label>
        <input type="date" name="fecha_reintegro" readonly value="${fISO(deriv.fecha_reintegro)}">
      </div>
    </div>

    <div class="med-card-section">
      <label>Observaciones</label>
      <textarea name="observaciones" readonly>
        ${deriv.observaciones || "Sin observaciones"}
      </textarea>
    </div>

    ${docs.length ? `
      <div class="med-card-section adjuntos-card">
        <label>Adjuntos</label>
        <div class="adjuntos-lista">
          ${docs.map(d => `
            <div class="adjunto-item" data-doc-id="${d.id}">
              <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
              <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}

  </div>

  <button class="toggle-card">Ver más</button>

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

      contenedor.appendChild(card);
    }

    renderPaginacion(count);
  }

  /* =====================
     PAGINACIÓN
  ===================== */
  function renderPaginacion(total) {
    paginacion.innerHTML = "";
    const totalPaginas = Math.ceil(total / POR_PAGINA);

    const btnAnterior = document.createElement("button");
    btnAnterior.textContent = "⬅ Anterior";
    btnAnterior.disabled = paginaActual === 0;
    btnAnterior.addEventListener("click", () => {
      paginaActual--;
      cargarDerivaciones();
    });

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;
    btnSiguiente.addEventListener("click", () => {
      paginaActual++;
      cargarDerivaciones();
    });

    const info = document.createElement("span");
    info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas} `;

    paginacion.appendChild(btnAnterior);
    paginacion.appendChild(info);
    paginacion.appendChild(btnSiguiente);
  }

  /* =====================
     ACCIONES CARD
  ===================== */
  contenedor.addEventListener("click", async e => {
    const card = e.target.closest(".card");
    if (!card) return;

    const id = card.dataset.id;

    // Bloqueo edición múltiple
    if (e.target.classList.contains("editar") && editandoId && editandoId !== id) {
      Swal.fire("Atención", "Solo se puede editar una card a la vez", "warning");
      return;
    }

    // TOGGLE VER MÁS
if (e.target.classList.contains("toggle-card")) {
  const card = e.target.closest(".card");
  card.classList.toggle("expandida");

  e.target.textContent = card.classList.contains("expandida")
    ? "Ver menos"
    : "Ver más";

  return;
}

    // EDITAR
if (e.target.classList.contains("editar")) {

  // Forzar expansión si está colapsada
  if (!card.classList.contains("expandida")) {
    card.classList.add("expandida");

    const btnToggle = card.querySelector(".toggle-card");
    if (btnToggle) {
      btnToggle.textContent = "Ver menos";
    }
  }

  card.classList.add("editando");
  editandoId = id;

      card.querySelectorAll("input, textarea").forEach(el => {
        if (el.hasAttribute("readonly")) el.removeAttribute("readonly");
        if (el.tagName === "TEXTAREA" && el.value === "Sin observaciones") el.value = "";
      });

      card.querySelectorAll(".btn-eliminar-adjunto").forEach(b => b.classList.remove("hidden"));
      card.querySelector(".adjuntos-edicion").classList.remove("hidden");
      const adjuntosEdicion = card.querySelector(".adjuntos-edicion");
      if (adjuntosEdicion) {
        adjuntosEdicion.classList.remove("hidden");

        const btnAgregar = adjuntosEdicion.querySelector(".btn-agregar-adjunto-card");
        btnAgregar.addEventListener("click", () => {
          const wrapper = document.createElement("div");
          wrapper.classList.add("adjunto-item-nuevo"); // para estilos

          const input = document.createElement("input");
          input.type = "file";
          wrapper.appendChild(input);

          // Botón eliminar
          const btnEliminar = document.createElement("button");
          btnEliminar.type = "button";
          btnEliminar.textContent = "✖";
          btnEliminar.classList.add("btn-eliminar-adjunto");

          btnEliminar.addEventListener("click", () => {
            wrapper.remove(); // lo quita del DOM
            card._adjuntosNuevos = card._adjuntosNuevos.filter(w => w !== wrapper); // y del array
          });

          wrapper.appendChild(btnEliminar);

          adjuntosEdicion.querySelector(".adjuntos-nuevos").appendChild(wrapper);
          card._adjuntosNuevos.push(wrapper);
        });
      }

      card.querySelector(".editar").classList.add("hidden");
      card.querySelector(".eliminar").classList.add("hidden");
      card.querySelector(".guardar").classList.remove("hidden");
      card.querySelector(".cancelar").classList.remove("hidden");
    }

    // CANCELAR
    if (e.target.classList.contains("cancelar")) {
      editandoId = null;
      cargarDerivaciones();
    }

    // ELIMINAR
    if (e.target.classList.contains("eliminar")) {
      const result = await Swal.fire({
        title: '¿Está seguro?',
        text: "Se eliminará esta derivación y todos sus adjuntos.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      });

      if (result.isConfirmed) {
        // Eliminar documentos de fichamedica_documentos
        await supabase.from("fichamedica_documentos")
          .delete()
          .eq("tipo_documento", "derivaciones")
          .eq("entidad_relacion_id", id);

        await supabase.from("derivaciones").delete().eq("id", id);
        cargarDerivaciones();

        Swal.fire('Eliminado', 'La derivación fue eliminada correctamente', 'success');
      }
    }

    // ELIMINAR ADJUNTO EXISTENTE (marcar para borrar)
if (e.target.classList.contains("btn-eliminar-adjunto")) {
  const item = e.target.closest(".adjunto-item");
  const docId = item.dataset.docId;

  if (docId) {
    // Guardamos para eliminar al guardar
    card._adjuntosEliminar.push(docId);
  }

  // Lo quitamos visualmente
  item.remove();
}

    // GUARDAR
// GUARDAR
if (e.target.classList.contains("guardar")) {

  const btnGuardar = e.target;

  btnGuardar.disabled = true;
  btnGuardar.textContent = "⌛ Guardando...";
  btnGuardar.style.backgroundColor = "#aaa";
  btnGuardar.style.cursor = "not-allowed";

  try {

    const datos = {};

    card.querySelectorAll("input[name], textarea[name]").forEach(el => {

      if (el.name === "dias_demora") return;

      if (el.name === "reintegro") {
        datos.reintegro = el.value ? parseFloat(el.value) : null;
      } else {
        datos[el.name] = el.value || null;
      }

    });

    const { error } = await supabase
      .from("derivaciones")
      .update(datos)
      .eq("id", id);

    if (error) throw error;

    // 🔹 Eliminar adjuntos marcados
    for (const docId of card._adjuntosEliminar) {
      await supabase
        .from("fichamedica_documentos")
        .delete()
        .eq("id", docId);
    }

    // 🔹 Subir nuevos adjuntos
    for (const adj of card._adjuntosNuevos) {
      const input = adj.querySelector("input");
      if (!input || !input.files[0]) continue;

      const url = await subirArchivoCloudinary(input.files[0]);

      await supabase
        .from("fichamedica_documentos")
        .insert({
          afiliado_id: afiliadoId,
          tipo_documento: "derivaciones",
          entidad_relacion_id: id,
          nombre_archivo: input.files[0].name,
          url,
          fecha_subida: new Date().toISOString()
        });
    }

    editandoId = null;
    cargarDerivaciones();

    Swal.fire({
      icon: "success",
      title: "Guardado",
      text: "Cambios guardados correctamente",
      confirmButtonText: "OK"
    });

  } catch (error) {

    console.error("Error al guardar:", error);
    Swal.fire("Error", error.message || "No se pudo guardar", "error");

  } finally {

    btnGuardar.disabled = false;
    btnGuardar.textContent = "💾 Guardar";
    btnGuardar.style.backgroundColor = "";
    btnGuardar.style.cursor = "";

  }
}
});

  /* =====================
     FORM NUEVO
  ===================== */
  btnNuevo.addEventListener("click", () => {
    if (!form.classList.contains("oculto")) {
      editandoId = null;
      form.reset();
      resetAdjuntos();
      form.classList.add("oculto");
      return;
    }

    editandoId = null;
    form.reset();
    resetAdjuntos();
    form.classList.remove("oculto");
  });

    btnCancelar.addEventListener("click", () => {
      editandoId = null;
      form.reset();
      resetAdjuntos();
      form.classList.add("oculto");
    });

btnAgregarAdjuntoForm.addEventListener("click", () => crearInputAdjunto(false));

/* =====================
   SUBMIT FORM
===================== */
form.addEventListener("submit", async e => {
  e.preventDefault();

  const btnSubmit = form.querySelector("button[type='submit']");

  btnSubmit.disabled = true;
  btnSubmit.textContent = "⌛ Guardando...";
  btnSubmit.style.backgroundColor = "#aaa";
  btnSubmit.style.cursor = "not-allowed";

  try {

    const datos = {
      afiliado_id: afiliadoId,
      tipo_derivacion_id: tipoSelect.value,
      fecha_inicio: document.getElementById("fechaInicio").value || null,
      fecha_fin: document.getElementById("fechaFin").value || null,
      lugar: document.getElementById("lugar").value || null,
      fecha_turno: document.getElementById("fechaTurno").value || null,
      fecha_orden_medico: document.getElementById("fechaOrdenMedico").value || null,
      fecha_orden_recibida: document.getElementById("fechaTrajoOrden").value || null,
      fecha_autorizacion: document.getElementById("fechaAutorizacion").value || null,
      autorizado_por: document.getElementById("autorizadoPor").value || null,
      nro_carga: document.getElementById("nroCarga").value || null,
      estado: document.getElementById("estado").value || null,
      observaciones: document.getElementById("observaciones").value || null,
      reintegro: document.querySelector("input[name='reintegro']").value
        ? parseFloat(document.querySelector("input[name='reintegro']").value)
        : null,
      fecha_reintegro: document.querySelector("input[name='fecha_reintegro']").value || null,
    };

    const { data, error } = await supabase
      .from("derivaciones")
      .insert(datos)
      .select()
      .single();

    if (error) throw error;

    // 🔹 Subir adjuntos
    const inputs = adjuntosFormLista.querySelectorAll("input[type='file']");

    for (const input of inputs) {
      if (!input.files[0]) continue;

      const archivo = input.files[0];
      const url = await subirArchivoCloudinary(archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "derivaciones",
        entidad_relacion_id: data.id,
        nombre_archivo: archivo.name,
        url,
        fecha_subida: new Date().toISOString()
      });
    }

    form.reset();
    resetAdjuntos();
    form.classList.add("oculto");
    paginaActual = 0;
    cargarDerivaciones();

    Swal.fire({
      icon: "success",
      title: "Guardado",
      text: "Derivación registrada correctamente",
      confirmButtonText: "OK"
    });

  } catch (error) {

    console.error("Error al crear derivación:", error);
    Swal.fire("Error", error.message || "No se pudo guardar", "error");

  } finally {

    btnSubmit.disabled = false;
    btnSubmit.textContent = "💾 Guardar";
    btnSubmit.style.backgroundColor = "";
    btnSubmit.style.cursor = "";

  }
});

  /* =====================
     INIT
  ===================== */
  await cargarTipos();
  cargarDerivaciones();
  resetAdjuntos();
}