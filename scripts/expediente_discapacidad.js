import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

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

  // 🔹 Obtener número de afiliado para carpeta
const { data: afiliado } = await supabase
  .from("afiliados")
  .select("numero_afiliado")
  .eq("id", afiliadoId)
  .single();

const carpetaAfiliado = afiliado?.numero_afiliado
  ? `afiliados/${afiliado.numero_afiliado}/expediente_discapacidad`
  : "afiliados/sin_numero/expediente_discapacidad";

    // =====================
// PARAMETRO DESTACAR DESDE NOTIFICACION
// =====================
const params = new URLSearchParams(window.location.search);
const registroADestacar = params.get("registro")
  ? Number(params.get("registro"))
  : null;

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

        // =====================
// SI EL REGISTRO ESTA EN OTRA PAGINA
// =====================
if (registroADestacar) {
  const posicion = await obtenerPosicionexpediente(registroADestacar);

  if (posicion !== null) {
    const paginaCorrecta = Math.floor(posicion / POR_PAGINA);

    if (paginaCorrecta !== paginaActual) {
      paginaActual = paginaCorrecta;
      await cargarExpedientes();
      return;
    }
  }
}

    for (const exp of data) {

      const documentos = docsPorId[exp.id] || [];

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = exp.id;
      card._adjuntosEliminar = [];

card.innerHTML = `
  <strong>${exp.tipo_expediente_discapacidad?.nombre || ""}</strong>

  <!-- SIEMPRE VISIBLE -->
  <div class="card-content">
    <div class="grid-fechas grid-principal">
      <div>
        <label>Fecha inicio</label>
        <input type="date" name="fecha_inicio" readonly value="${fISO(exp.fecha_inicio)}">
      </div>

      <div>
        <label>Fecha finalización</label>
        <input type="date" name="fecha_finalizacion" readonly value="${fISO(exp.fecha_finalizacion)}">
      </div>

      <div>
        <label>Reintegro</label>
        <input type="number" step="0.01" name="reintegro" readonly value="${exp.reintegro ?? ""}">
      </div>

      <div>
        <label>Fecha reintegro</label>
        <input type="date" name="fecha_reintegro" readonly value="${fISO(exp.fecha_reintegro)}">
      </div>
    </div>
  </div>

  <!-- EXPANDIBLE -->
  <div class="card-extra">

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
      </div>
    ` : ""}

    <div class="adjuntos-edicion hidden">
      <button type="button" class="btn-agregar-adjunto-card">➕ Agregar adjunto</button>
      <div class="adjuntos-nuevos"></div>
    </div>

  </div>

  <button class="toggle-card">Ver más</button>

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
if (registroADestacar && exp.id === registroADestacar) {
  
  setTimeout(() => {
    card.classList.add("card-destacada");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
}

      lista.appendChild(card);
    }
  }
  
  async function obtenerPosicionexpediente(idBuscado) {

  const { data, error } = await supabase
    .from("expediente_discapacidad")
    .select("id")
    .eq("afiliado_id", afiliadoId)
    .order("fecha_inicio", { ascending: false });

  if (error || !data) return null;

  return data.findIndex(r => r.id === idBuscado);
}

  /* =======================
     ACCIONES CARD
  ======================= */

  lista.addEventListener("click", async e => {

    const card = e.target.closest(".card");
    if (!card) return;

    const id = Number(card.dataset.id);

    // TOGGLE
if (e.target.classList.contains("toggle-card")) {

  card.classList.toggle("expandida");

  e.target.textContent = card.classList.contains("expandida")
    ? "Ver menos"
    : "Ver más";

  return;
}

    /* EDITAR */

if (e.target.classList.contains("editar")) {

  if (!card.classList.contains("expandida")) {
    card.classList.add("expandida");
    card.querySelector(".toggle-card").textContent = "Ver menos";
  }

  card.querySelectorAll("input, textarea").forEach(el => {
    el.removeAttribute("readonly");
    if (el.tagName === "TEXTAREA" && el.value === "Sin observaciones") {
      el.value = "";
    }
  });

  card.querySelector(".guardar").classList.remove("hidden");
  card.querySelector(".cancelar").classList.remove("hidden");
  card.querySelector(".editar").classList.add("hidden");
  card.querySelector(".eliminar").classList.add("hidden");

  // Mostrar eliminar adjuntos
  card.querySelectorAll(".btn-eliminar-adjunto").forEach(btn => {
    btn.classList.remove("hidden");
    btn.onclick = () => {
      const item = btn.closest(".adjunto-item");
      card._adjuntosEliminar.push(item.dataset.docId);
      item.remove();
    };
  });

  // Adjuntos edición
  const bloqueAdj = card.querySelector(".adjuntos-edicion");
  bloqueAdj.classList.remove("hidden");

  const btnAgregar = bloqueAdj.querySelector(".btn-agregar-adjunto-card");

  btnAgregar.onclick = () => {
    const wrapper = document.createElement("div");
    wrapper.className = "adjunto-item";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.png";

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.textContent = "✖";
    btnEliminar.onclick = () => wrapper.remove();

    wrapper.append(input, btnEliminar);
    bloqueAdj.querySelector(".adjuntos-nuevos").appendChild(wrapper);
  };
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

        Swal.fire(
          'Eliminado',
          'El expediente fue eliminado correctamente.',
          'success'
        );
      cargarExpedientes();
    }

    /* GUARDAR */

if (e.target.classList.contains("guardar")) {

  const btnGuardar = e.target;

  btnGuardar.disabled = true;
  btnGuardar.textContent = "⌛ Guardando...";
  btnGuardar.style.backgroundColor = "#aaa";
  btnGuardar.style.cursor = "not-allowed";

  try {

    const datosUpdate = {
      fecha_inicio: card.querySelector("[name='fecha_inicio']").value,
      fecha_finalizacion: card.querySelector("[name='fecha_finalizacion']").value || null,
      observacion: card.querySelector("[name='observacion']").value || null,
      reintegro: card.querySelector("[name='reintegro']").value
        ? parseFloat(card.querySelector("[name='reintegro']").value)
        : null,
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
      const url = await subirArchivoCloudinary(archivo, carpetaAfiliado);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        entidad_relacion_id: id,
        tipo_documento: "expediente_discapacidad",
        nombre_archivo: archivo.name,
        url,
        fecha_subida: new Date().toISOString()
      });
    }

    Swal.fire({
      icon: "success",
      title: "Guardado",
      text: "Cambios guardados correctamente",
      confirmButtonText: "OK"
    });
    
    cargarExpedientes();

  } catch (err) {
    Swal.fire("Error", "No se pudo guardar", "error");
    } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "💾 Guardar";
    btnGuardar.style.backgroundColor = "";
    btnGuardar.style.cursor = "";
  }
}

  });

  /* =======================
     PAGINACION
  ======================= */

  function renderPaginacion(total) {

    paginacion.innerHTML = "";
const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

    const btnAnt = document.createElement("button");
    btnAnt.textContent = "⬅ Anterior";
    btnAnt.disabled = paginaActual === 0;
    btnAnt.onclick = () => { paginaActual--; cargarExpedientes(); };

    const btnSig = document.createElement("button");
    btnSig.textContent = "Siguiente ➡";
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

  const btnSubmit = form.querySelector("button[type='submit']");
  btnSubmit.disabled = true;
  btnSubmit.textContent = "⌛ Guardando...";
  btnSubmit.style.backgroundColor = "#aaa";
  btnSubmit.style.cursor = "not-allowed";

  try {

    const datos = {
      afiliado_id: afiliadoId,
      tipo_expediente_id: form.tipo_expediente_id.value,
      fecha_inicio: form.fecha_inicio.value,
      fecha_finalizacion: form.fecha_finalizacion.value || null,
      observacion: form.observacion.value || null,
      reintegro: form.reintegro.value
        ? parseFloat(form.reintegro.value)
        : null,
      fecha_reintegro: form.fecha_reintegro.value || null,
      created_by: usuarioLogin?.username || "Desconocido"
    };

    const { data: nuevo, error } = await supabase
      .from("expediente_discapacidad")
      .insert(datos)
      .select()
      .single();

    if (error) throw error;

    const inputs = adjuntosContainer.querySelectorAll("input[type='file']");

    for (const input of inputs) {
      if (!input.files[0]) continue;

      const archivo = input.files[0];
      const url = await subirArchivoCloudinary(archivo, carpetaAfiliado);
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

    Swal.fire(
      "Guardado",
      "Expediente de discapacidad registrado correctamente",
      "success"
    );

    cargarExpedientes();

  } catch (err) {
    Swal.fire("Error", "No se pudo guardar", "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "💾 Guardar";
    btnSubmit.style.backgroundColor = "";
    btnSubmit.style.cursor = "";
  }
});

  /* =======================
     INIT
  ======================= */

  await cargarTipos();
  resetAdjuntos();
  cargarExpedientes();
}