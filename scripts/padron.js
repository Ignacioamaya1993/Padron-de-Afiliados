import { authObserver, logout } from "./auth.js";
import { supabase } from "./supabase.js";

let buscando = false;

/* =====================
   HELPERS
===================== */
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;

  const hoy = new Date();
  const fn = new Date(fechaNacimiento);

  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();

  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) {
    edad--;
  }

  return edad;
}

function mesesHastaCumple(fechaNacimiento, edadObjetivo) {
  const hoy = new Date();
  const fn = new Date(fechaNacimiento);

  const cumpleObjetivo = new Date(
    fn.getFullYear() + edadObjetivo,
    fn.getMonth(),
    fn.getDate()
  );

  const diffMs = cumpleObjetivo - hoy;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
}

function obtenerAlertaHijo(fechaNacimiento, relacion) {
  if (relacion !== "Hijo/a" || !fechaNacimiento) return null;

  const edad = calcularEdad(fechaNacimiento);

  const meses18 = mesesHastaCumple(fechaNacimiento, 18);
  if (edad === 17 && meses18 <= 2 && meses18 >= 0) {
    return { nivel: "warning", icono: "🟡" };
  }

  const meses25 = mesesHastaCumple(fechaNacimiento, 25);
  if (edad === 24 && meses25 <= 2 && meses25 >= 0) {
    return { nivel: "critical", icono: "🔴" };
  }

  return null;
}

/* =====================
   MOSTRAR / OCULTAR ESTUDIOS
===================== */
const relacionSelect = document.querySelector('select[name="relacion"]');
const fechaNacimientoInput = document.querySelector('input[name="fechaNacimiento"]');
const estudiosField = document.getElementById("estudiosField");
const estudiosSelect = document.querySelector('select[name="estudios"]');

function actualizarCampoEstudios() {
  const relacion = relacionSelect.value;
  const fechaNacimiento = fechaNacimientoInput.value;

  if (relacion !== "Hijo/a" || !fechaNacimiento) {
    estudiosField.style.display = "none";
    estudiosSelect.value = "";
    return;
  }

  const edad = calcularEdad(fechaNacimiento);

  if (edad >= 18 && edad <= 25) {
    estudiosField.style.display = "block";
  } else {
    estudiosField.style.display = "none";
    estudiosSelect.value = "";
  }
}

if (relacionSelect && fechaNacimientoInput && estudiosField && estudiosSelect) {
  relacionSelect.addEventListener("change", actualizarCampoEstudios);
  fechaNacimientoInput.addEventListener("change", actualizarCampoEstudios);
}

/* =====================
   AUTH
===================== */
authObserver(user => {
  if (!user) {
    window.location.href = "/pages/login.html";
    return;
  }

  document.getElementById("status").textContent =
    `Bienvenido ${user.email}`;
});

document
  .getElementById("logoutBtn")
  ?.addEventListener("click", logout);

/* =====================
   BUSCADOR
===================== */
const searchInput = document.getElementById("searchInput");
const resultadosDiv = document.createElement("div");
resultadosDiv.className = "resultados-busqueda";
searchInput.after(resultadosDiv);

searchInput.addEventListener("input", async e => {
  const texto = e.target.value.trim();
  resultadosDiv.innerHTML = "";

  if (texto.length < 3 || buscando) return;
  buscando = true;

  try {
    const { data, error } = await supabase
      .from("afiliados")
      .select(`
        id,
        nombre_completo,
        dni,
        numero_afiliado,
        relacion,
        fecha_nacimiento
      `)
      .or(
        `nombre_completo.ilike.%${texto}%,numero_afiliado.ilike.%${texto}%`
      )
      .limit(20);

    if (error) throw error;

    if (!data.length) {
      resultadosDiv.innerHTML =
        `<p style="opacity:.7">Sin resultados</p>`;
      return;
    }

    data.forEach(a => {
      const alerta = obtenerAlertaHijo(
        a.fecha_nacimiento,
        a.relacion
      );

      const edad = a.fecha_nacimiento
        ? calcularEdad(a.fecha_nacimiento)
        : null;

      const item = document.createElement("div");
      item.className = "resultado-item";

      item.innerHTML = `
        <strong>
          ${a.nombre_completo}
          ${alerta ? `<span title="Alerta por edad">${alerta.icono}</span>` : ""}
        </strong>
        DNI: ${a.dni || "-"}
        ${edad !== null ? ` | Edad: ${edad}` : ""}
        <br>
        Afiliado: ${a.numero_afiliado} |
        ${a.relacion}
      `;

      item.onclick = () => {
        resultadosDiv.innerHTML = "";
        searchInput.value = "";
        window.location.href = `/pages/afiliado.html?id=${a.id}`;
      };

      resultadosDiv.appendChild(item);
    });

  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo buscar el afiliado", "error");
  } finally {
    buscando = false;
  }
});

/* =====================
   NUEVO AFILIADO
===================== */
document
  .getElementById("PadronForm")
  ?.addEventListener("submit", async e => {
    e.preventDefault();

    if (buscando) return;
    buscando = true;

    const f = e.target;

    const nombre = f.nombre.value.trim();
    const apellido = f.apellido.value.trim();
    const dni = f.dni.value.trim();
    const telefono = f.telefono.value.trim() || null;
    const fechaNacimiento = f.fechaNacimiento.value || null;
    const numeroAfiliado = f.numeroAfiliado.value.trim();
    const relacion = f.relacion.value;
    const estudios = f.estudios?.value || null;

    if (!nombre || !apellido || !dni || !numeroAfiliado || !relacion) {
      Swal.fire("Atención", "Completá todos los campos obligatorios", "warning");
      buscando = false;
      return;
    }

    if (relacion === "Hijo/a" && fechaNacimiento) {
      const edad = calcularEdad(fechaNacimiento);

      if (edad > 25) {
        Swal.fire("No permitido", "Los hijos mayores de 25 años no pueden afiliarse", "error");
        buscando = false;
        return;
      }

      if (edad >= 18 && !estudios) {
        Swal.fire("Atención", "Debe indicar qué estudios cursa", "warning");
        buscando = false;
        return;
      }
    }

    const match = numeroAfiliado.match(/^[^-]+-([^/]+)\//);
    if (!match) {
      Swal.fire("Formato incorrecto", "Formato esperado: 19-00639-4/00", "error");
      buscando = false;
      return;
    }

    const grupoFamiliarCodigo = match[1];

    try {
      const { error } = await supabase
        .from("afiliados")
        .insert({
          nombre,
          apellido,
          dni,
          telefono,
          fecha_nacimiento: fechaNacimiento,
          numero_afiliado: numeroAfiliado,
          grupo_familiar_codigo: grupoFamiliarCodigo,
          relacion,
          estudios
        });

      if (error) throw error;

      Swal.fire("Guardado", "Afiliado agregado correctamente", "success");
      f.reset();
      actualizarCampoEstudios();

    } catch (err) {
      console.error(err);

      if (err.message?.includes("dni")) {
        Swal.fire("DNI duplicado", "Ya existe un afiliado con ese DNI", "warning");
        return;
      }

      if (err.message?.includes("numero_afiliado")) {
        Swal.fire("Número duplicado", "Ya existe un afiliado con ese número", "warning");
        return;
      }

      Swal.fire("Error", "No se pudo guardar el afiliado", "error");
    } finally {
      buscando = false;
    }
  });

/* =====================
   MOSTRAR / OCULTAR FORM
===================== */
const btnNuevo = document.getElementById("btnNuevoAfiliado");
const btnCancelar = document.getElementById("btnCancelarNuevo");
const nuevoSection = document.getElementById("nuevoAfiliadoSection");

btnNuevo.onclick = () => {
  nuevoSection.style.display = "block";
  btnNuevo.style.display = "none";
};

btnCancelar.onclick = () => {
  nuevoSection.style.display = "none";
  btnNuevo.style.display = "inline-block";
};
