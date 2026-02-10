import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";
import { subirArchivoCloudinary } from "./cloudinary.js";

    
export async function init(afiliadoId) {
  if (!afiliadoId) {
    Swal.fire("Error", "Afiliado no encontrado", "error");
    throw new Error("ID afiliado faltante");
  }
  
  // =====================
  // INIT HEADER
  // =====================
  await cargarHeader();

  // =====================
  // ELEMENTOS
  // =====================
  const btnNuevo = document.getElementById("btnNuevoMedicamento");
  const btnCancelar = document.getElementById("btnCancelarMedicamento");
  const form = document.getElementById("formMedicamento");
  const lista = document.getElementById("listaMedicamentos");

  const tipoSelect = document.getElementById("tipoMedicamento");
  const campoLatas = document.getElementById("campoLatas");
  const campoInicio = document.getElementById("campoInicio");
  const campoVencimiento = document.getElementById("campoVencimiento");
  const datosMedicamento = document.getElementById("datosMedicamento");

  // =====================
  // TIPOS MEDICAMENTOS
  // =====================
  async function cargarTipos() {
    const { data, error } = await supabase
      .from("tipo_medicamentos")
      .select("id, nombre")
      .order("nombre");

    if (error) {
      console.error(error);
      return;
    }

    tipoSelect.innerHTML = `<option value="">Seleccione tipo</option>`;

    data.forEach(tipo => {
      const option = document.createElement("option");
      option.value = tipo.id;
      option.textContent = tipo.nombre;
      tipoSelect.appendChild(option);
    });

    actualizarCamposPorTipo();
  }

  // =====================
  // CAMPOS SEGÚN TIPO
  // =====================
  function actualizarCamposPorTipo() {
    const tipoId = Number(tipoSelect.value);

    if (!tipoId) {
      datosMedicamento.classList.add("hidden");
      campoLatas.classList.add("hidden");
      campoInicio.classList.add("hidden");
      campoVencimiento.classList.add("hidden");
      return;
    }

    datosMedicamento.classList.remove("hidden");

    campoLatas.classList.add("hidden");
    campoInicio.classList.add("hidden");
    campoVencimiento.classList.add("hidden");

    if (tipoId !== 4) form.latas_entregadas.value = "";
    if (![6, 7].includes(tipoId)) {
      form.fecha_inicio.value = "";
      form.fecha_vencimiento.value = "";
    }

    if (tipoId === 4) campoLatas.classList.remove("hidden");
    if ([6, 7].includes(tipoId)) {
      campoInicio.classList.remove("hidden");
      campoVencimiento.classList.remove("hidden");
    }
  }

  tipoSelect.addEventListener("change", actualizarCamposPorTipo);

  // =====================
  // LISTAR MEDICAMENTOS
  // =====================
  async function cargarMedicamentos() {
    const { data, error } = await supabase
      .from("medicamentos")
      .select(`*, tipo_medicamentos ( nombre )`)
      .eq("afiliado_id", afiliadoId)
      .order("fecha_carga", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    lista.innerHTML = "";

    if (!data.length) {
      lista.innerHTML = "<p>No hay medicamentos cargados.</p>";
      return;
    }

    data.forEach(med => {
      const div = document.createElement("div");
      div.className = "card";

div.innerHTML = `
  <strong>${med.tipo_medicamentos?.nombre || "-"}</strong>
  <div class="med-card-section">
    <h4>Fechas generales</h4>
    Fecha carga: ${med.fecha_carga || "-"}<br>
    Fecha autorización: ${med.fecha_autorizacion || "-"}<br>
    Fecha entrega: ${med.fecha_entrega || "-"}<br>
    Próxima carga: ${med.proxima_carga || "-"}<br>
  </div>

  <div class="med-card-section">
    <h4>Campos especiales</h4>
    ${med.latas_entregadas ? `Latas entregadas: ${med.latas_entregadas}<br>` : ""}
    ${med.fecha_inicio ? `Fecha inicio: ${med.fecha_inicio}<br>` : ""}
    ${med.fecha_vencimiento ? `Fecha vencimiento: ${med.fecha_vencimiento}<br>` : ""}
  </div>

  <div class="med-card-section">
    <h4>Extras</h4>
    Observaciones: ${med.observaciones || "-"}<br>
    ${med.archivo_url ? `<a href="${med.archivo_url}" target="_blank">📎 Ver adjunto</a>` : "-"}
  </div>

  <div class="acciones">
    <button class="editar" data-id="${med.id}">✏️</button>
    <button class="eliminar" data-id="${med.id}">🗑️</button>
  </div>
`;

      lista.appendChild(div);
    });
  }

  // =====================
  // NUEVO / CANCELAR
  // =====================
  btnNuevo.addEventListener("click", () => {
    form.reset();
    form.id.value = "";
    datosMedicamento.classList.add("hidden");
    actualizarCamposPorTipo();
    form.classList.remove("hidden");
  });

  btnCancelar.addEventListener("click", () => {
    form.reset();
    form.classList.add("hidden");
  });

  // =====================
  // GUARDAR / EDITAR
  // =====================
  form.addEventListener("submit", async e => {
    e.preventDefault();

    let archivoUrl = null;
    const file = form.adjunto.files[0];

    if (file) archivoUrl = await subirArchivoCloudinary(file);

    const datos = {
      afiliado_id: afiliadoId,
      tipo_medicamento_id: form.tipo_medicamento_id.value,
      fecha_carga: form.fecha_carga.value,
      fecha_autorizacion: form.fecha_autorizacion.value || null,
      fecha_entrega: form.fecha_entrega.value || null,
      proxima_carga: form.proxima_carga.value || null,
      latas_entregadas: form.latas_entregadas.value || null,
      fecha_inicio: form.fecha_inicio.value || null,
      fecha_vencimiento: form.fecha_vencimiento.value || null,
      observaciones: form.observaciones.value || null,
      ...(archivoUrl && { archivo_url: archivoUrl }),
    };

    let query;
    if (form.id.value) {
      query = supabase.from("medicamentos").update(datos).eq("id", form.id.value);
    } else {
      query = supabase.from("medicamentos").insert(datos);
    }

    const { error } = await query;

    if (error) {
      Swal.fire("Error", error.message, "error");
      return;
    }

    Swal.fire("OK", "Medicamento guardado", "success");
    form.reset();
    form.classList.add("hidden");
    cargarMedicamentos();
  });

  // =====================
  // EDITAR / ELIMINAR
  // =====================
  lista.addEventListener("click", async e => {
    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains("editar")) {
      const { data, error } = await supabase.from("medicamentos").select("*").eq("id", id).single();
      if (error) return;

      Object.keys(data).forEach(key => {
        if (form[key]) form[key].value = data[key] ?? "";
      });

      actualizarCamposPorTipo();
      form.classList.remove("hidden");
    }

    if (e.target.classList.contains("eliminar")) {
      const confirm = await Swal.fire({
        title: "¿Eliminar medicamento?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí",
        cancelButtonText: "No",
      });

      if (!confirm.isConfirmed) return;

      await supabase.from("medicamentos").delete().eq("id", id);
      cargarMedicamentos();
    }
  });

  // =====================
  // INIT
  // =====================
  cargarTipos();
  cargarMedicamentos();
}
