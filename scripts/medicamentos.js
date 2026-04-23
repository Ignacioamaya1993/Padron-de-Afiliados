import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";
import { authObserver } from "./auth.js";

import { generarNotificacionesMedicamentos } from "./notificaciones.js";

authObserver(async (user) => {
  if (user) {
  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("*")
    .ilike("email", user.email)
    .single();
  if (error) console.error("Error usuario:", error);

    await generarNotificacionesMedicamentos(usuario);
  }
});

export async function init(afiliadoId) {
  if (!afiliadoId) {
    Swal.fire("Error", "Afiliado no encontrado", "error");
    throw new Error("ID afiliado faltante");
  }

  await cargarHeader();

          const {
    data: { user }
  } = await supabase.auth.getUser();
  
    const { data: usuarioLogin } = await supabase
    .from("usuarios_login")
    .select("username")
    .eq("email", user.email)
    .single();

    const { data: afiliado } = await supabase
    .from("afiliados")
    .select("numero_afiliado")
    .eq("id", afiliadoId)
    .single();

  if (!afiliado) {
    Swal.fire("Error", "No se pudo obtener el afiliado", "error");
    return;
  }

  const numeroAfiliado = afiliado.numero_afiliado;

  // =====================
// PARAMETRO DESTACAR DESDE NOTIFICACION
// =====================
const params = new URLSearchParams(window.location.search);
const registroADestacar = params.get("registro")
  ? Number(params.get("registro"))
  : null;

  /* =====================
     ESTADO
  ===================== */
  let editandoId = null;
  let archivosAdjuntos = [];

  let paginaActual = 0;
  const POR_PAGINA = 12;

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

  // Inputs reales
  const inputLatas = form.querySelector("[name='latas_entregadas']");
  const inputInicio = form.querySelector("[name='fecha_inicio']");
  const inputVenc = form.querySelector("[name='fecha_vencimiento']");

  // Quitar required por defecto
  inputLatas?.removeAttribute("required");
  inputInicio?.removeAttribute("required");
  inputVenc?.removeAttribute("required");

  // Tipo 4 → leche maternizada
  if (tipoId === 4) {
    campoLatas.classList.remove("hidden");
    inputLatas?.setAttribute("required", "required");
  }

  // Tipos 6 y 7
  if ([6, 7].includes(tipoId)) {
    campoInicio.classList.remove("hidden");
    campoVencimiento.classList.remove("hidden");
    inputInicio?.setAttribute("required", "required");
    inputVenc?.setAttribute("required", "required");
  }
}

  tipoSelect.addEventListener("change", actualizarCamposPorTipo);

  /* =====================
     ADJUNTOS FORM NUEVO
  ===================== */
  function resetAdjuntos() {
    archivosAdjuntos = [];
    adjuntosContainer.innerHTML = "";
    agregarAdjuntoInput(adjuntosContainer, archivosAdjuntos, true); 
  }

    function agregarAdjuntoInput(
      container = adjuntosContainer,
      arr = archivosAdjuntos,
      obligatorio = false
    ) {
      const wrapper = document.createElement("div");
      wrapper.className = "adjunto-item";

      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.jpg,.png";

      input.addEventListener("change", () => {
        wrapper.archivo = input.files[0] || null;
      });

      wrapper.archivo = null;
      arr.push(wrapper);

      wrapper.appendChild(input);

      // ❗ Si NO es obligatorio, puede eliminarse
      if (!obligatorio) {
        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.textContent = "✖";
        btnEliminar.className = "btn-eliminar-adjunto";

        btnEliminar.addEventListener("click", () => {
          arr.splice(arr.indexOf(wrapper), 1);
          wrapper.remove();
        });

        wrapper.appendChild(btnEliminar);
      }

      container.appendChild(wrapper);
    }

    btnAgregarAdjunto.addEventListener("click", () => {
      agregarAdjuntoInput(adjuntosContainer, archivosAdjuntos, false);
    });

  /* =====================
     LISTAR MEDICAMENTOS
  ===================== */
async function cargarMedicamentos() {

  const desde = paginaActual * POR_PAGINA;
  const hasta = desde + POR_PAGINA - 1;

  const { data: meds, error, count } = await supabase
    .from("medicamentos")
    .select(`*, tipo_medicamentos(nombre)`, { count: "exact" })
    .eq("afiliado_id", afiliadoId)
    .order("fecha_carga", { ascending: false })
    .range(desde, hasta);

  if (error) return console.error(error);

  lista.innerHTML = "";

  if (!meds.length) {
    renderPaginacion(count);
    return;
  }
  
  // Traemos los documentos SOLO de esta página
  const medIds = meds.map(m => m.id);

  const { data: docs } = await supabase
    .from("fichamedica_documentos")
    .select("*")
    .eq("tipo_documento", "medicamentos")
    .in("entidad_relacion_id", medIds);

  const docsPorMedicamento = {};
  docs.forEach(d => {
    if (!docsPorMedicamento[d.entidad_relacion_id]) {
      docsPorMedicamento[d.entidad_relacion_id] = [];
    }
    docsPorMedicamento[d.entidad_relacion_id].push(d);
  });

  const fISO = d => (d ? d.split("T")[0] : "");
  const fragment = document.createDocumentFragment();

  for (const med of meds) {
    const documentos = docsPorMedicamento[med.id] || [];

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = med.id;
    card._adjuntosNuevos = [];
    card._adjuntosEliminar = [];

card.innerHTML = `
  <strong>${med.tipo_medicamentos?.nombre || "-"}</strong>

  <div class="card-content">

    <div class="med-card-section grid-fechas">
      <div><label>Fecha de carga</label><input type="date" name="fecha_carga" readonly value="${fISO(med.fecha_carga)}"></div>
      <div class="med-card-section"><label>Estado</label><input name="estado" readonly value="${med.estado ?? ""}"></div>
      <div><label>Fecha de autorización</label><input type="date" name="fecha_autorizacion" readonly value="${fISO(med.fecha_autorizacion)}"></div>
      <div><label>Fecha de entrega</label><input type="date" name="fecha_entrega" readonly value="${fISO(med.fecha_entrega)}"></div>
      <div><label>Próxima carga</label><input type="date" name="proxima_carga" readonly value="${fISO(med.proxima_carga)}"></div>
    </div>

  </div>

  <div class="card-extra">

    ${med.latas_entregadas ? `
    <div class="med-card-section grid-fechas">
      <div><label>Latas entregadas</label><input name="latas_entregadas" readonly value="${med.latas_entregadas}"></div>
    </div>` : ""}

    ${[6,7].includes(med.tipo_medicamento_id) ? `
    <div class="med-card-section grid-fechas">
      <div><label>Inicio</label><input type="date" name="fecha_inicio" readonly value="${fISO(med.fecha_inicio)}"></div>
      <div><label>Vencimiento</label><input type="date" name="fecha_vencimiento" readonly value="${fISO(med.fecha_vencimiento)}"></div>
    </div>` : ""}

    <div class="med-card-section grid-fechas">
      <div>
        <label>Reintegro</label>
        <input type="number" step="0.01" name="reintegro" readonly value="${med.reintegro ?? ""}">
      </div>
      <div>
        <label>Fecha reintegro</label>
        <input type="date" name="fecha_reintegro" readonly value="${fISO(med.fecha_reintegro)}">
      </div>
    </div>

    <div class="med-card-section">
      <label>Observaciones</label>
      <textarea name="observaciones" readonly>${med.observaciones || "Sin observaciones"}</textarea>
    </div>

    ${documentos.length ? `
    <div class="med-card-section adjuntos-card">
      <label>Adjuntos</label>
      <div class="adjuntos-lista">
        ${documentos.map(d => `
          <div class="adjunto-item" data-doc-id="${d.id}">
            <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
            <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
          </div>`).join("")}
      </div>
    </div>` : ""}

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

// =====================
// DESTACAR SI VIENE DE NOTIFICACION
// =====================
if (registroADestacar && med.id === registroADestacar) {

  // Si el registro está en otra página,
  // calculamos qué página debería estar
  const indexGlobal = meds.findIndex(m => m.id === registroADestacar);
  
  if (indexGlobal === -1) {
    // Puede estar en otra página
    const posicion = await obtenerPosicionMedicamento(registroADestacar);
    if (posicion !== null) {
      paginaActual = Math.floor(posicion / POR_PAGINA);
      await cargarMedicamentos();
      return;
    }
  }

  setTimeout(() => {
    card.classList.add("card-destacada");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
}

    fragment.appendChild(card);
  }

    lista.appendChild(fragment);

  renderPaginacion(count);
}

async function obtenerPosicionMedicamento(idBuscado) {

  const { data, error } = await supabase
    .from("medicamentos")
    .select("id")
    .eq("afiliado_id", afiliadoId)
    .order("fecha_carga", { ascending: false });

  if (error || !data) return null;

  return data.findIndex(m => m.id === idBuscado);
}

function renderPaginacion(total) {

  const contenedor = document.getElementById("paginacionMedicamentos");
  contenedor.innerHTML = "";

const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  
  const btnAnterior = document.createElement("button");
  btnAnterior.textContent = "⬅ Anterior";
  btnAnterior.disabled = paginaActual === 0;

  btnAnterior.addEventListener("click", () => {
    paginaActual--;
    cargarMedicamentos();
  });

  const btnSiguiente = document.createElement("button");
  btnSiguiente.textContent = "Siguiente ➡";
  btnSiguiente.disabled = paginaActual >= totalPaginas - 1;

  btnSiguiente.addEventListener("click", () => {
    paginaActual++;
    cargarMedicamentos();
  });

  const info = document.createElement("span");
  info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas} `;

  contenedor.appendChild(btnAnterior);
  contenedor.appendChild(info);
  contenedor.appendChild(btnSiguiente);
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

  const btnGuardar = e.target;
  btnGuardar.disabled = true;
  btnGuardar.textContent = "⌛ Guardando...";
  btnGuardar.style.backgroundColor = "#aaa";
  btnGuardar.style.cursor = "not-allowed";

  try {

const datos = {};

card.querySelectorAll("input[name], textarea[name]").forEach(el => {

  if (el.name === "reintegro") {
    datos.reintegro = el.value !== ""
      ? parseFloat(el.value)
      : null;
    return;
  }

  if (el.name === "latas_entregadas") {
    datos.latas_entregadas = el.value !== ""
      ? parseInt(el.value)
      : null;
    return;
  }

  datos[el.name] = el.value || null;
});

    const { error } = await supabase
      .from("medicamentos")
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
      if (!adj.archivo) continue;

    const url = await subirArchivoCloudinary(
      adj.archivo,
      `afiliados/${numeroAfiliado}/medicamentos`
    );

      await supabase
        .from("fichamedica_documentos")
        .insert({
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
      icon: "success",
      title: "Guardado",
      text: "Cambios guardados correctamente",
      confirmButtonText: "OK"
    });

  } catch (error) {
    console.error("Error al actualizar medicamento:", error);
    Swal.fire("Error", error.message || "No se pudo guardar", "error");
  } finally {

    // Restaurar botón
    btnGuardar.disabled = false;
    btnGuardar.textContent = "💾 Guardar";
    btnGuardar.style.backgroundColor = "";
    btnGuardar.style.cursor = "";

  }
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

  const btnGuardar = form.querySelector(".btn-guardar");

  // 🔒 Bloquear botón
  btnGuardar.disabled = true;
  btnGuardar.textContent = "⌛ Guardando...";
  btnGuardar.style.backgroundColor = "#aaa";
  btnGuardar.style.cursor = "not-allowed";

  try {

    if (!archivosAdjuntos[0] || !archivosAdjuntos[0].archivo) {
      Swal.fire("Atención", "Debe adjuntar al menos un archivo.", "warning");
      return;
    }

    const datos = {
      afiliado_id: afiliadoId,
      tipo_medicamento_id: form.tipo_medicamento_id.value,
      fecha_carga: form.fecha_carga.value,
      fecha_autorizacion: form.fecha_autorizacion.value || null,
      fecha_entrega: form.fecha_entrega.value || null,
      proxima_carga: form.proxima_carga.value || null,
      latas_entregadas: form.latas_entregadas?.value
        ? parseInt(form.latas_entregadas.value)
        : null,
      fecha_inicio: form.fecha_inicio.value || null,
      fecha_vencimiento: form.fecha_vencimiento.value || null,
      observaciones: form.observaciones.value || null,
      reintegro: form.reintegro?.value
        ? parseFloat(form.reintegro.value)
        : null,
      fecha_reintegro: form.fecha_reintegro?.value || null,
      created_by: usuarioLogin?.username || "Desconocido",
      estado: form.estado?.value || null,
    };

    const { data, error } = await supabase
      .from("medicamentos")
      .insert(datos)
      .select()
      .single();

    if (error) throw error;

    for (const adj of archivosAdjuntos) {
      if (!adj.archivo) continue;

      const url = await subirArchivoCloudinary(
        adj.archivo,
        `afiliados/${numeroAfiliado}/medicamentos`
      );
      
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
      text: 'Medicamento cargado correctamente',
      confirmButtonText: 'OK'
    });

  } catch (error) {
    console.error(error);
    Swal.fire("Error", error.message || "No se pudo guardar", "error");
  } finally {

    // 🔓 Restaurar botón SIEMPRE
    btnGuardar.disabled = false;
    btnGuardar.textContent = "💾 Guardar";
    btnGuardar.style.backgroundColor = "";
    btnGuardar.style.cursor = "";

  }
});
 
  /* =====================
     INIT
  ===================== */
  await cargarTipos();
  cargarMedicamentos();
}
