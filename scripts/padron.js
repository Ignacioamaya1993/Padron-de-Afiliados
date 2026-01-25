import { authObserver, logout } from "./auth.js";
import { supabase } from "./supabase.js";

let buscando = false;

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
        relacion
      `)
      .or(
        `nombre_completo.ilike.%${texto}%,dni.ilike.%${texto}%,numero_afiliado.ilike.%${texto}%`
      )
      .limit(20);

    if (error) throw error;

    if (!data.length) {
      resultadosDiv.innerHTML =
        `<p style="opacity:.7">Sin resultados</p>`;
      return;
    }

    data.forEach(a => {
      const item = document.createElement("div");
      item.className = "resultado-item";

      item.innerHTML = `
        <strong>${a.nombre_completo}</strong><br>
        DNI: ${a.dni || "-"} |
        Afiliado: ${a.numero_afiliado} |
        ${a.relacion}
      `;

      item.onclick = () => {
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
const form = document.getElementById("PadronForm");
const estudiosField = document.getElementById("estudiosField");
const estudiosInput = document.getElementById("estudios");

function calcularEdad(fecha) {
  const hoy = new Date();
  const nac = new Date(fecha);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

/* Mostrar / ocultar estudios en tiempo real */
form.relacion.addEventListener("change", validarHijo);
form.fechaNacimiento.addEventListener("change", validarHijo);

function validarHijo() {
  estudiosField.style.display = "none";
  estudiosInput.value = "";

  if (form.relacion.value !== "Hijo/a") return;
  if (!form.fechaNacimiento.value) return;

  const edad = calcularEdad(form.fechaNacimiento.value);

  if (edad > 25) {
    Swal.fire(
      "No permitido",
      "Los hijos mayores de 25 años no pueden afiliarse",
      "warning"
    );
    form.fechaNacimiento.value = "";
    return;
  }

  if (edad >= 18) {
    estudiosField.style.display = "block";
  }
}

form.addEventListener("submit", async e => {
  e.preventDefault();

  const nombre = form.nombre.value.trim();
  const apellido = form.apellido.value.trim();
  const dni = form.dni.value.trim();
  const telefono = form.telefono.value.trim() || null;
  const fechaNacimiento = form.fechaNacimiento.value || null;
  const numeroAfiliado = form.numeroAfiliado.value.trim();
  const relacion = form.relacion.value;
  const estudios = estudiosInput.value.trim() || null;

  if (!nombre || !apellido || !dni || !numeroAfiliado || !relacion) {
    Swal.fire("Atención", "Completá todos los campos obligatorios", "warning");
    return;
  }

  if (relacion === "Hijo/a" && fechaNacimiento) {
    const edad = calcularEdad(fechaNacimiento);

    if (edad > 25) {
      Swal.fire(
        "No permitido",
        "Los hijos mayores de 25 años no pueden afiliarse",
        "error"
      );
      return;
    }

    if (edad >= 18 && !estudios) {
      Swal.fire(
        "Falta información",
        "Indicá los estudios que está cursando",
        "warning"
      );
      return;
    }
  }

  /* =====================
     GRUPO FAMILIAR
  ===================== */
  const match = numeroAfiliado.match(/^[^-]+-([^/]+)\//);

  if (!match) {
    Swal.fire(
      "Formato incorrecto",
      "El número de afiliado debe tener formato válido (ej: 19-00639-4/00)",
      "error"
    );
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
    form.reset();
    estudiosField.style.display = "none";

  } catch (err) {
    console.error(err);

    if (err.message?.includes("dni")) {
      Swal.fire("DNI duplicado", "Ya existe un afiliado con ese DNI", "warning");
    } else {
      Swal.fire("Error", "No se pudo guardar el afiliado", "error");
    }
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
