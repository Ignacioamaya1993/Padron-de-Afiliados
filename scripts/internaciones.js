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
  const btnNuevo = document.getElementById("btnNuevaInternacion");
  const btnCancelar = document.getElementById("btnCancelarInternacion");
  const form = document.getElementById("formInternacion");
  const contenedor = document.getElementById("contenedorInternaciones");
  const paginacion = document.getElementById("paginacionInternaciones");
  const tipoSelect = document.getElementById("tipoInternacion");
  const lugarSelect = document.getElementById("lugarInternacion");
  const btnAgregarAdjuntoForm = document.getElementById("btnAgregarAdjuntoFormInternacion");
  const adjuntosFormLista = document.getElementById("adjuntosFormListaInternacion");
  const rowReintegro = document.getElementById("rowReintegro");

  /* =====================
     CARGAR TIPOS Y LUGARES
  ===================== */
  async function cargarTiposYLugares() {
    // Tipos
    const { data: tipos, error: errTipos } = await supabase
      .from("tipo_internaciones")
      .select("*")
      .order("nombre");
    if (errTipos) console.error(errTipos);

    tipoSelect.innerHTML = `<option value="">Seleccione...</option>`;
    tipos?.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nombre;
      tipoSelect.appendChild(opt);
    });

    // Lugares
    const { data: lugares, error: errLugares } = await supabase
      .from("lugar_internaciones")
      .select("*")
      .order("nombre");
    if (errLugares) console.error(errLugares);

    lugarSelect.innerHTML = `<option value="">Seleccione...</option>`;
    lugares?.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.nombre;
      lugarSelect.appendChild(opt);
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

    if (!esObligatorio) {
      const btnEliminar = document.createElement("button");
      btnEliminar.type = "button";
      btnEliminar.textContent = "✖";
      btnEliminar.classList.add("btn-eliminar-adjunto");
      btnEliminar.addEventListener("click", () => wrapper.remove());
      wrapper.appendChild(btnEliminar);
    }

    adjuntosFormLista.appendChild(wrapper);
  }

  /* =====================
     CARGAR INTERNACIONES
  ===================== */
  async function cargarInternaciones() {
    try {
      const { data, count, error } = await supabase
        .from("internaciones")
        .select("*", { count: "exact" })
        .eq("afiliado_id", afiliadoId)
        .order("fecha_carga", { ascending: false })
        .range(paginaActual * POR_PAGINA, paginaActual * POR_PAGINA + POR_PAGINA - 1);

      if (error) return console.error(error);

      contenedor.innerHTML = "";
      if (!data?.length) {
        renderPaginacion(0);
        return;
      }

      const fISO = d => d ? d.split("T")[0] : "";

      // Traer documentos en paralelo
      const docsPorInternacion = await Promise.all(
        data.map(async inter => {
          const { data: docsData, error: docsError } = await supabase
            .from("fichamedica_documentos")
            .select("*")
            .eq("tipo_documento", "internaciones")
            .eq("entidad_relacion_id", inter.id);
          if (docsError) console.error("Error cargando adjuntos:", docsError);
          return docsData || [];
        })
      );

      // Generar cards
      const cardsHTML = data.map((inter, index) => {
        const docs = docsPorInternacion[index];

        return `
        <div class="card" data-id="${inter.id}" data-index="${index}" data-lugar-id="${inter.lugar_internacion_id || ""}">
            <strong>${inter.tipo_internacion_id ? tipoSelect.querySelector('option[value="'+inter.tipo_internacion_id+'"]')?.textContent : "-"}</strong>

            <div class="med-card-section grid-fechas">
              <div><label>Fecha Carga</label><input type="date" name="fecha_carga" readonly value="${fISO(inter.fecha_carga)}"></div>
              <div><label>Fecha Orden</label><input type="date" name="fecha_orden" readonly value="${fISO(inter.fecha_orden)}"></div>
              <div><label>Fecha Recepción Orden</label><input type="date" name="fecha_orden_recibida" readonly value="${fISO(inter.fecha_orden_recibida)}"></div>
              <div><label>Fecha Turno</label><input type="date" name="fecha_turno" readonly value="${fISO(inter.fecha_turno)}"></div>
              <div><label>Fecha Cirugía</label><input type="date" name="fecha_cirugia" readonly value="${fISO(inter.fecha_cirugia)}"></div>
              <div><label>Fecha Alta</label><input type="date" name="fecha_alta" readonly value="${fISO(inter.fecha_alta)}"></div>
              <div><label>Lugar</label><input name="lugar" readonly value="${inter.lugar_internacion_id ? lugarSelect.querySelector('option[value="'+inter.lugar_internacion_id+'"]')?.textContent : ""}"></div>
              <div><label>Reintegro</label><input type="number" step="0.01" name="reintegro" readonly value="${inter.reintegro ?? ""}"></div>
            </div>

            <div class="med-card-section">
              <label>Observaciones</label>
              <textarea name="observaciones" readonly>${inter.observaciones || "Sin observaciones"}</textarea>
            </div>

            ${docs.length ? `
            <div class="med-card-section adjuntos-card">
              <label>Adjuntos</label>
              <div class="adjuntos-lista">
                ${docs.map(d => `<div class="adjunto-item" data-doc-id="${d.id}">
                  <a href="${d.url}" target="_blank">📎 ${d.nombre_archivo}</a>
                  <button type="button" class="btn-eliminar-adjunto hidden">✖</button>
                </div>`).join("")}
              </div>
            </div>` : ""}

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
          </div>
        `;
      });

      contenedor.innerHTML = cardsHTML.join("");
      renderPaginacion(count);

    } catch (err) {
      console.error("Error cargando internaciones:", err);
      contenedor.innerHTML = "<p>Error cargando internaciones.</p>";
    }
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
      cargarInternaciones();
    });

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente ➡";
    btnSiguiente.disabled = paginaActual >= totalPaginas - 1;
    btnSiguiente.addEventListener("click", () => {
      paginaActual++;
      cargarInternaciones();
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

    if (e.target.classList.contains("editar") && editandoId && editandoId !== id) {
      Swal.fire("Atención", "Solo se puede editar una card a la vez", "warning");
      return;
    }

if (e.target.classList.contains("editar")) {
  card.classList.add("editando");
  editandoId = id;

  rowReintegro.style.display = "flex";
  rowReintegro.classList.remove("oculto");

  // Inputs y textarea editables
  card.querySelectorAll("input, textarea").forEach(el => {
    if (el.hasAttribute("readonly")) el.removeAttribute("readonly");
    if (el.tagName === "TEXTAREA" && el.value === "Sin observaciones") el.value = "";
  });

card._adjuntosEliminar = [];
card._adjuntosNuevos = [];

card.querySelectorAll(".adjunto-item").forEach(item => {

  const btn = item.querySelector(".btn-eliminar-adjunto");
  if (!btn) return;

  btn.classList.remove("hidden");

  btn.addEventListener("click", () => {

    const docId = item.dataset.docId;

    if (docId) {
      card._adjuntosEliminar.push(docId);
    }

    item.remove();
  });

});

// Reemplazar input de Lugar por select editable
const inputLugar = card.querySelector('input[name="lugar"]');
card._inputLugarOriginal = inputLugar;

const valorLugarId = card.dataset.lugarId || "";

const selectLugar = document.createElement("select");
selectLugar.name = "lugar_internacion_id";

// Opciones
lugarSelect.querySelectorAll("option").forEach(opt => {
  const newOpt = document.createElement("option");
  newOpt.value = opt.value;
  newOpt.textContent = opt.textContent;
  if (opt.value === valorLugarId) {
    newOpt.selected = true;
  }
  selectLugar.appendChild(newOpt);
});

inputLugar.replaceWith(selectLugar);

  // Adjuntos
const adjuntosEdicion = card.querySelector(".adjuntos-edicion");
if (adjuntosEdicion) {
  adjuntosEdicion.classList.remove("hidden");

  const btnAgregar = adjuntosEdicion.querySelector(".btn-agregar-adjunto-card");
  btnAgregar.addEventListener("click", () => {
  const wrapper = document.createElement("div");
  wrapper.classList.add("adjunto-item-nuevo"); // opcional, para estilos

  const input = document.createElement("input");
  input.type = "file";
  wrapper.appendChild(input);

  // Botón eliminar
  const btnEliminar = document.createElement("button");
  btnEliminar.type = "button";
  btnEliminar.textContent = "✖";
  btnEliminar.classList.add("btn-eliminar-adjunto");
  btnEliminar.addEventListener("click", () => {
    wrapper.remove();               // lo quita del DOM
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

if (e.target.classList.contains("cancelar")) {
    // Salir del modo edición
    editandoId = null;

    // Ocultar reintegro por seguridad
    if (rowReintegro) {
        rowReintegro.classList.add("oculto");
        rowReintegro.style.display = "none";
    }

    // Opcional: pequeño efecto visual
    const contenedor = document.getElementById("listaInternaciones");
    if (contenedor) contenedor.style.opacity = "0.5";

    // 🔄 Volver a renderizar todas las cards desde la base
    await cargarInternaciones();

    if (contenedor) contenedor.style.opacity = "1";
}

    if (e.target.classList.contains("eliminar")) {
      const result = await Swal.fire({
        title: '¿Está seguro?',
        text: "Se eliminará esta internación y todos sus adjuntos.",
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
          .eq("tipo_documento", "internaciones")
          .eq("entidad_relacion_id", id);

        await supabase.from("internaciones").delete().eq("id", id);
        cargarInternaciones();

        Swal.fire('Eliminado', 'La internación fue eliminada correctamente', 'success');
      }
    }

if (e.target.classList.contains("guardar")) {

  const datos = {};

  card.querySelectorAll("input[name], textarea[name], select[name]").forEach(el => {
    if (el.name === "reintegro") {
      datos.reintegro = el.value ? parseFloat(el.value) : null;
    } else if (el.name !== "fecha_carga") {
      datos[el.name] = el.value || null;
    }
  });

  const { error } = await supabase
    .from("internaciones")
    .update(datos)
    .eq("id", id);

      if (error) {
        console.error(error);
        Swal.fire("Error", error.message, "error");
        return;
      }

      for (const docId of (card._adjuntosEliminar || [])) {
        await supabase.from("fichamedica_documentos").delete().eq("id", docId);
      }

      for (const adj of (card._adjuntosNuevos || [])) {
        const input = adj.querySelector("input");
        if (!input || !input.files[0]) continue;

        const url = await subirArchivoCloudinary(input.files[0]);
        await supabase.from("fichamedica_documentos").insert({
          afiliado_id: afiliadoId,
          tipo_documento: "internaciones",
          entidad_relacion_id: id,
          nombre_archivo: input.files[0].name,
          url,
          fecha_subida: new Date().toISOString()
        });
      }

      editandoId = null;
      cargarInternaciones();

      Swal.fire({
        icon: "success",
        title: "Guardado",
        text: "Cambios guardados correctamente",
        confirmButtonText: "OK"
      });
    }
  });

/* =====================
   TOGGLE FORM NUEVO
===================== */

console.log("Internaciones init cargado");

btnNuevo.addEventListener("click", () => {
    console.log("CLICK DETECTADO");

  editandoId = null;
  form.reset();
  resetAdjuntos();

  form.classList.toggle("oculto");

  // Reintegro siempre oculto en alta
  rowReintegro.classList.add("oculto");
});

btnCancelar.addEventListener("click", () => {
  editandoId = null;
  form.reset();
  resetAdjuntos();
  form.classList.add("oculto");
  rowReintegro.classList.add("oculto");
});

  btnAgregarAdjuntoForm.addEventListener("click", () => crearInputAdjunto(false));

  /* =====================
     SUBMIT FORM
  ===================== */
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const datos = {
      afiliado_id: afiliadoId,
      tipo_internacion_id: tipoSelect.value || null,
      lugar_internacion_id: lugarSelect.value || null,
      fecha_carga: document.getElementById("fechaCarga").value || null,
      fecha_orden: document.getElementById("fechaOrden").value || null,
      fecha_orden_recibida: document.getElementById("fechaRecepcionOrden").value || null,
      fecha_turno: document.getElementById("fechaTurno").value || null,
      fecha_cirugia: document.getElementById("fechaCirugia").value || null,
      fecha_alta: document.getElementById("fechaAlta").value || null,
      reintegro: document.getElementById("reintegroInternacion").value || null,
      observaciones: document.getElementById("observacionesInternacion").value || null
    };

    const { data } = await supabase.from("internaciones").insert(datos).select().single();

    // Adjuntos
    const inputs = adjuntosFormLista.querySelectorAll("input[type='file']");
    for (const input of inputs) {
      if (!input.files[0]) continue;
      const archivo = input.files[0];
      const url = await subirArchivoCloudinary(archivo);

      await supabase.from("fichamedica_documentos").insert({
        afiliado_id: afiliadoId,
        tipo_documento: "internaciones",
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
    cargarInternaciones();

    Swal.fire({
      icon: "success",
      title: "Guardado",
      text: "Internación registrada correctamente",
      confirmButtonText: "OK"
    });
  });

  /* =====================
     INIT
  ===================== */
  await cargarTiposYLugares();
  cargarInternaciones();
  resetAdjuntos();
}
