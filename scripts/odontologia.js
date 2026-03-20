import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

export async function init(afiliadoId) {
  if (!afiliadoId) {
    Swal.fire("Error", "Afiliado no encontrado", "error");
    throw new Error("ID afiliado faltante");
  }

  await cargarHeader();

  // 🔹 Obtener número de afiliado para carpeta
const { data: afiliado } = await supabase
  .from("afiliados")
  .select("numero_afiliado")
  .eq("id", afiliadoId)
  .single();

const carpetaAfiliado = afiliado?.numero_afiliado
  ? `afiliados/${afiliado.numero_afiliado}/odontologia`
  : "afiliados/sin_numero/odontologia";

  // =====================
  // ESTADO
  // =====================
  let paginaActual = 0;
  const POR_PAGINA = 10;
  let archivosAdjuntos = [];

  // =====================
  // ELEMENTOS
  // =====================
    const btnNuevo = document.getElementById("btnNuevaOdontologia");
    const btnCancelar = document.getElementById("btnCancelarOdontologia");
    const form = document.getElementById("formOdontologia");
    const lista = document.getElementById("listaOdontologia");
    const adjuntosContainer = form.querySelector("#adjuntosContainer");
    const btnAgregarAdjunto = form.querySelector("#btnAgregarAdjunto");
    const campoReintegro = form.querySelector(".campo-reintegro");
    
    btnAgregarAdjunto.addEventListener("click", () => {
      agregarAdjuntoInput(false);
    });

  // =====================
  // ADJUNTOS
  // =====================
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

  // =====================
  // CARGAR REGISTROS
  // =====================
  async function cargarOdontologia() {
    const desde = paginaActual * POR_PAGINA;
    const hasta = desde + POR_PAGINA - 1;

    const { data: registros, error, count } = await supabase
      .from("odontologia")
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
    if (!registros.length) return;

    const ids = registros.map(r => r.id);

    const { data: docs } = await supabase
      .from("fichamedica_documentos")
      .select("*")
      .eq("tipo_documento", "odontologia")
      .in("entidad_relacion_id", ids);

    const docsPorRegistro = {};
    docs.forEach(d => {
      if (!docsPorRegistro[d.entidad_relacion_id]) docsPorRegistro[d.entidad_relacion_id] = [];
      docsPorRegistro[d.entidad_relacion_id].push(d);
    });

    const fISO = d => (d ? d.split("T")[0] : "");

    for (const r of registros) {
      const documentos = docsPorRegistro[r.id] || [];

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = r.id;

card.innerHTML = `

  <h4 class="full-width">Odontología</h4> 

  <!-- PARTE SIEMPRE VISIBLE -->
  <div>
    <label>Fecha carga</label>
    <input type="date" name="fecha_carga" readonly value="${fISO(r.fecha_carga)}">
  </div>

  <div>
    <label>Fecha orden</label>
    <input type="date" name="fecha_orden" readonly value="${fISO(r.fecha_orden)}">
  </div>

  <div>
    <label>Fecha recepción orden</label>
    <input type="date" name="fecha_recepcion_orden" readonly value="${fISO(r.fecha_recepcion_orden)}">
  </div>

  <div>
    <label>Fecha factura</label>
    <input type="date" name="fecha_factura" readonly value="${fISO(r.fecha_factura)}">
  </div>

  <button type="button" class="toggle-card full-width">Ver más</button>

  <!-- PARTE COLAPSABLE -->
  <div class="card-extra full-width">

    <div>
      <label>Fecha firma recibo</label>
      <input type="date" name="fecha_firma_recibo" readonly value="${fISO(r.fecha_firma_recibo)}">
    </div>

    <div>
      <label>Fecha envío recibo</label>
      <input type="date" name="fecha_envio_recibo" readonly value="${fISO(r.fecha_envio_recibo)}">
    </div>

    <div>
      <label>Reintegro</label>
      <input type="number" name="reintegro" value="${r.reintegro ?? ''}" step="0.01" readonly>
    </div>

    <div>
      <label>Fecha reintegro</label>
      <input type="date" name="fecha_reintegro" readonly value="${fISO(r.fecha_reintegro)}">
    </div>

    <div class="full-width">
      <label>Observación</label>
      <textarea name="observacion" readonly>${r.observacion || "Sin observaciones"}</textarea>
    </div>

<div class="adjuntos-card full-width">
  ${documentos.map(d => `
    <div class="adjunto-item" data-doc-id="${d.id}">
      <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
      <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
    </div>
  `).join("")}
</div>

  </div>

  <div class="acciones full-width">
    <button class="editar">✏️ Editar</button>
    <button class="eliminar">🗑️ Eliminar</button>
    <button class="guardar hidden">💾 Guardar</button>
    <button class="cancelar hidden">Cancelar</button>
  </div>
`;

      lista.appendChild(card);
    }
  }

      // =====================
      // ACCIONES CARD
      // =====================
      lista.addEventListener("click", async e => {
        const card = e.target.closest(".card");
        if (!card) return;
        const id = card.dataset.id;

        const fISO = d => (d ? d.split("T")[0] : "");

    // VER MAS / VER MENOS
if (e.target.classList.contains("toggle-card")) {

  const extra = card.querySelector(".card-extra");
  const estaAbierta = extra.classList.contains("mostrar");

  extra.classList.toggle("mostrar");
  card.classList.toggle("expandida");

  e.target.textContent = !estaAbierta
    ? "Ver menos"
    : "Ver más";

  return;
}

    if (e.target.classList.contains("editar")) {
      card.querySelectorAll("input, textarea").forEach(el => el.removeAttribute("readonly"));

// Forzar expansión si está colapsada
const extra = card.querySelector(".card-extra");
const btnToggle = card.querySelector(".toggle-card");

if (!card.classList.contains("expandida")) {
  card.classList.add("expandida");
}

if (extra && !extra.classList.contains("mostrar")) {
  extra.classList.add("mostrar");
}

if (btnToggle) {
  btnToggle.textContent = "Ver menos";
}

      // Mostrar reintegro solo en edición
      card.querySelector(".guardar").classList.remove("hidden");
      card.querySelector(".cancelar").classList.remove("hidden");
      card.querySelector(".editar").classList.add("hidden");
      card.querySelector(".eliminar").classList.add("hidden");

// Adjuntos dinámicos
const adjuntosCard = card.querySelector(".adjuntos-card");

if (adjuntosCard) {

  // Mostrar botones eliminar de adjuntos existentes
  adjuntosCard.querySelectorAll(".btn-eliminar-adjunto").forEach(btn => {
    btn.classList.remove("hidden");

    btn.onclick = async () => {
      const item = btn.closest(".adjunto-item");
      const docId = item.dataset.docId;

      if (docId) {
        // 🔴 Elimina de Supabase si ya existe en BD
        await supabase
          .from("fichamedica_documentos")
          .delete()
          .eq("id", docId);
      }

      item.remove();
    };
  });

  // Botón agregar adjunto nuevo
  if (!card.querySelector(".btn-agregar-adjunto-card")) {

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

      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;

        const url = await subirArchivoCloudinary(file, carpetaAfiliado);

        await supabase.from("fichamedica_documentos").insert({
          afiliado_id: afiliadoId,
          tipo_documento: "odontologia",
          entidad_relacion_id: card.dataset.id,
          nombre_archivo: file.name,
          url
        });

        cargarOdontologia();
      });

      wrapper.appendChild(input);

      const btnEliminar = document.createElement("button");
      btnEliminar.type = "button";
      btnEliminar.textContent = "✖";
      btnEliminar.className = "btn-eliminar-adjunto";

      btnEliminar.addEventListener("click", () => {
        wrapper.remove(); // solo elimina del DOM si aún no se subió
      });

      wrapper.appendChild(btnEliminar);
      adjuntosCard.appendChild(wrapper);
    });

    adjuntosCard.appendChild(btnAgregar);
  }
}

    }

    if (e.target.classList.contains("cancelar")) cargarOdontologia();

if (e.target.classList.contains("guardar")) {
  const btnGuardar = e.target;
        btnGuardar.disabled = true;
        btnGuardar.textContent = "⌛ Guardando...";
        btnGuardar.style.backgroundColor = "#aaa";
        btnGuardar.style.cursor = "not-allowed";

  try {
    const reintegroVal = card.querySelector("[name='reintegro']").value;

    const datosUpdate = {
      fecha_carga: card.querySelector("[name='fecha_carga']").value,
      fecha_orden: card.querySelector("[name='fecha_orden']").value || null,
      fecha_recepcion_orden: card.querySelector("[name='fecha_recepcion_orden']").value || null,
      fecha_factura: card.querySelector("[name='fecha_factura']").value || null,
      reintegro: reintegroVal ? parseFloat(reintegroVal) : null,
      fecha_reintegro: card.querySelector("[name='fecha_reintegro']").value || null,
      fecha_firma_recibo: card.querySelector("[name='fecha_firma_recibo']").value || null,
      fecha_envio_recibo: card.querySelector("[name='fecha_envio_recibo']").value || null,
      observacion: card.querySelector("[name='observacion']").value || null,
    };

    await supabase
      .from("odontologia")
      .update(datosUpdate)
      .eq("id", id);

    Swal.fire("Guardado", "Cambios guardados correctamente", "success");
    cargarOdontologia();

  } catch (error) {
    console.error(error);
    Swal.fire("Error", "No se pudo guardar", "error");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "💾 Guardar";
  }
}

if (e.target.classList.contains("eliminar")) {
  const confirmar = await Swal.fire({
    title: '¿Está seguro?',
    text: "Se eliminará esta odontología y todos sus adjuntos.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!confirmar.isConfirmed) return;

  const { error } = await supabase
    .from("odontologia")
    .delete()
    .eq("id", id);

  if (error) {
    Swal.fire("Error", "No se pudo eliminar el registro.", "error");
    return;
  }

  await Swal.fire(
    'Eliminado',
    'La odontología fue eliminada correctamente.',
    'success'
  );

  cargarOdontologia();
}
  });

  // =====================
  // PAGINACION
  // =====================
  function renderPaginacion(total) {
    const contenedor = document.getElementById("paginacionOdontologia");
    contenedor.innerHTML = "";

const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

    const btnAnterior = document.createElement("button");
    btnAnterior.textContent = "⬅ Anterior";
    btnAnterior.disabled = paginaActual === 0;
    btnAnterior.onclick = () => { paginaActual--; cargarOdontologia(); };

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;
    btnSiguiente.onclick = () => { paginaActual++; cargarOdontologia(); };

    const info = document.createElement("span");
    info.textContent = ` Página ${paginaActual + 1} de ${totalPaginas} `;

    contenedor.append(btnAnterior, info, btnSiguiente);
  }

  // =====================
  // FORM NUEVO
  // =====================
  btnNuevo.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    campoReintegro.classList.add("hidden");
    form.classList.toggle("hidden");
  });

  btnCancelar.addEventListener("click", () => {
    form.reset();
    resetAdjuntos();
    campoReintegro.classList.add("hidden");
    form.classList.add("hidden");
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const btnSubmit = form.querySelector("button[type='submit']");
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Guardando...";

    const datos = {
      afiliado_id: afiliadoId,
      fecha_carga: form.fecha_carga.value,
      fecha_orden: form.fecha_orden.value || null,
      fecha_recepcion_orden: form.fecha_recepcion_orden.value || null,
      fecha_factura: form.fecha_factura.value || null,
      reintegro: null,
      fecha_reintegro: null,
      fecha_firma_recibo: form.fecha_firma_recibo.value || null,
      fecha_envio_recibo: form.fecha_envio_recibo.value || null,
      observacion: form.observacion.value || null
    };

    const { data } = await supabase.from("odontologia").insert(datos).select().single();

    for (const adj of archivosAdjuntos) {
      if (!adj.archivo) continue;
      const url = await subirArchivoCloudinary(adj.archivo, carpetaAfiliado);
      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "odontologia",
        entidad_relacion_id: data.id,
        nombre_archivo: adj.archivo.name,
        url
      });
    }

    form.reset();
    resetAdjuntos();
    campoReintegro.classList.add("hidden");
    form.classList.add("hidden");
    cargarOdontologia();

    Swal.fire({
      icon: 'success',
      title: 'Guardado',
      text: 'Odontologia cargado correctamente',
      confirmButtonText: 'OK'
    });
    
    btnSubmit.disabled = false;
btnSubmit.textContent = "Guardar";
  });

  // =====================
  // INIT
  // =====================
  resetAdjuntos();
  cargarOdontologia();
}
