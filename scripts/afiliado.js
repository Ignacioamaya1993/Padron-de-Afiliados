import { supabase } from "./supabase.js";

const params = new URLSearchParams(window.location.search);
const afiliadoId = params.get("id");

if (!afiliadoId) {
  Swal.fire("Error", "Afiliado no encontrado", "error");
  throw new Error("ID faltante");
}

let afiliadoActual = null;

/* =====================
   HELPERS
===================== */
function calcularEdad(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  const fn = new Date(fecha);
  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
  return edad;
}

function setEditable(editable) {
  document
    .querySelectorAll("input, select")
    .forEach(el => el.disabled = !editable);

  document.getElementById("btnGuardar").style.display = editable ? "inline-block" : "none";
  document.getElementById("btnCancelar").style.display = editable ? "inline-block" : "none";
  document.getElementById("btnEditar").style.display = editable ? "none" : "inline-block";
}

/* =====================
   CARGAR AFILIADO
===================== */
async function cargarAfiliado() {
  const { data, error } = await supabase
    .from("afiliados")
    .select("*")
    .eq("id", afiliadoId)
    .single();

  if (error) {
    Swal.fire("Error", "No se pudo cargar el afiliado", "error");
    return;
  }

  afiliadoActual = data;
  renderAfiliado();
}

function renderAfiliado() {
  const a = afiliadoActual;

  document.getElementById("nombre").value = a.nombre;
  document.getElementById("apellido").value = a.apellido;
  document.getElementById("dni").value = a.dni;
  document.getElementById("telefono").value = a.telefono || "";
  document.getElementById("fechaNacimiento").value = a.fecha_nacimiento || "";
  document.getElementById("numeroAfiliado").value = a.numero_afiliado;
  document.getElementById("relacion").value = a.relacion;
  document.getElementById("estudios").value = a.estudios || "";

  const edad = calcularEdad(a.fecha_nacimiento);
  document.getElementById("edad").textContent =
    edad !== null ? `${edad} años` : "-";

  const estado = document.getElementById("estadoAfiliado");
  if (!a.activo) {
    estado.textContent = "🔴 AFILIADO DADO DE BAJA";
    estado.style.color = "#dc2626";
  }

  if (!a.activo) {
    setEditable(false);
    document.getElementById("btnEditar").style.display = "none";
    document.getElementById("btnBaja").style.display = "none";
  } else {
    setEditable(false);
  }
}

/* =====================
   EDITAR
===================== */
document.getElementById("btnEditar").onclick = () => {
  setEditable(true);
};

document.getElementById("btnCancelar").onclick = () => {
  renderAfiliado();
};

/* =====================
   GUARDAR CAMBIOS
===================== */
document.getElementById("btnGuardar").onclick = async () => {
  const payload = {
    nombre: nombre.value.trim(),
    apellido: apellido.value.trim(),
    dni: dni.value.trim(),
    telefono: telefono.value.trim() || null,
    fecha_nacimiento: fechaNacimiento.value || null,
    numero_afiliado: numeroAfiliado.value.trim(),
    relacion: relacion.value,
    estudios: estudios.value || null
  };

  const { error } = await supabase
    .from("afiliados")
    .update(payload)
    .eq("id", afiliadoId);

  if (error) {
    if (error.code === "23505") {
      if (error.message.includes("dni")) {
        Swal.fire("DNI duplicado", "Ese DNI ya existe", "warning");
        return;
      }
      if (error.message.includes("numero")) {
        Swal.fire("Número duplicado", "Ese número ya existe", "warning");
        return;
      }
    }

    Swal.fire("Error", "No se pudieron guardar los cambios", "error");
    return;
  }

  Swal.fire("Actualizado", "Cambios guardados", "success");
  cargarAfiliado();
};

/* =====================
   DAR DE BAJA
===================== */
document.getElementById("btnBaja").onclick = async () => {
  const res = await Swal.fire({
    title: "¿Dar de baja afiliado?",
    text: "El afiliado quedará inactivo pero no se elimina",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Dar de baja",
    cancelButtonText: "Cancelar"
  });

  if (!res.isConfirmed) return;

  await supabase
    .from("afiliados")
    .update({ activo: false })
    .eq("id", afiliadoId);

  Swal.fire("Baja realizada", "", "success");
  cargarAfiliado();
};

/* =====================
   ELIMINAR DEFINITIVO
===================== */
document.getElementById("btnEliminar").onclick = async () => {
  const res = await Swal.fire({
    title: "ELIMINAR DEFINITIVAMENTE",
    text: "Esta acción no se puede deshacer",
    icon: "error",
    showCancelButton: true,
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar"
  });

  if (!res.isConfirmed) return;

  await supabase
    .from("afiliados")
    .delete()
    .eq("id", afiliadoId);

  Swal.fire("Eliminado", "", "success");
  window.location.href = "/pages/padron.html";
};

cargarAfiliado();
