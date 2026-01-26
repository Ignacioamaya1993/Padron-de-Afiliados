import { cargarHeader } from "./header.js";
import { supabase } from "./supabase.js";

await cargarHeader();

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

function obtenerAlertaHijo(fechaNacimiento, parentesco) {
  if (parentesco !== "Hijos" || !fechaNacimiento) return null;

  const edad = calcularEdad(fechaNacimiento);

  const meses18 = mesesHastaCumple(fechaNacimiento, 18);
  if (edad === 17 && meses18 <= 2 && meses18 >= 0) {
    return { icono: "🟡", texto: "Cumple 18 pronto" };
  }

  const meses25 = mesesHastaCumple(fechaNacimiento, 25);
  if (edad === 24 && meses25 <= 2 && meses25 >= 0) {
    return { icono: "🔴", texto: "Cumple 25 pronto" };
  }

  return null;
}

function pasoEdadLimite(fechaNacimiento, edadLimite) {
  if (!fechaNacimiento) return true;

  const fn = new Date(fechaNacimiento);
  const fechaLimite = new Date(
    fn.getFullYear() + edadLimite,
    fn.getMonth(),
    fn.getDate()
  );

  return new Date() >= fechaLimite;
}

/* =====================
   MOSTRAR / OCULTAR ESTUDIOS
===================== */
const parentescoSelect = document.querySelector('select[name="parentesco"]');
const fechaNacimientoInput = document.querySelector('input[name="fechaNacimiento"]');
const estudiosField = document.getElementById("estudiosField");
const estudiosSelect = document.querySelector('select[name="estudios"]');

function actualizarCampoEstudios() {
  if (!parentescoSelect || !fechaNacimientoInput) return;

  const parentesco = parentescoSelect.value;
  const fechaNacimiento = fechaNacimientoInput.value;

  if (parentesco !== "Hijos" || !fechaNacimiento) {
    estudiosField.style.display = "none";
    estudiosSelect.value = "";
    return;
  }

  // Se muestra estudios solo si todavía NO cumplió 26
  if (!pasoEdadLimite(fechaNacimiento, 26)) {
    estudiosField.style.display = "block";
  } else {
    estudiosField.style.display = "none";
    estudiosSelect.value = "";
  }
}

parentescoSelect?.addEventListener("change", actualizarCampoEstudios);
fechaNacimientoInput?.addEventListener("change", actualizarCampoEstudios);

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
        parentesco,
        fecha_nacimiento,
        activo
      `)
      .or(
        `nombre_completo.ilike.%${texto}%,dni.ilike.%${texto}%,numero_afiliado.ilike.%${texto}%`
      )
      .limit(20);

    if (error) throw error;

    if (!data.length) {
      resultadosDiv.innerHTML = `<p style="opacity:.7">Sin resultados</p>`;
      return;
    }

    data.forEach(a => {
      const alerta = obtenerAlertaHijo(a.fecha_nacimiento, a.parentesco);
      const edad = a.fecha_nacimiento ? calcularEdad(a.fecha_nacimiento) : null;

      const estado = a.activo
        ? `<span style="color:#16a34a;font-weight:600"> 🟢 Activo</span>`
        : `<span style="color:#dc2626;font-weight:600"> 🔴 Dado de baja</span>`;

      const item = document.createElement("div");
      item.className = "resultado-item";

      item.innerHTML = `
        <strong>
          ${a.nombre_completo}
          ${estado}
          ${alerta ? `<span title="${alerta.texto}">${alerta.icono}</span>` : ""}
        </strong>

        DNI: ${a.dni || "-"}
        ${edad !== null ? ` | Edad: ${edad}` : ""}
        <br>
        Afiliado: ${a.numero_afiliado} | ${a.parentesco}
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
document
  .getElementById("PadronForm")
  ?.addEventListener("submit", async e => {
    e.preventDefault();

    const f = e.target;
    const submitBtn = f.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    try {
      const nombre = f.elements.nombre.value.trim();
      const apellido = f.elements.apellido.value.trim();
      const dni = f.elements.dni.value.trim();
      const telefono = f.elements.telefono.value.trim() || null;
      const fechaNacimiento = f.elements.fechaNacimiento.value || null;
      const numero_afiliado = f.elements.numero_afiliado.value.trim();

      const parentesco = f.elements.parentesco.value;
      const sexo = f.elements.sexo.value;
      const plan = f.elements.plan?.value || null;
      const categoria = f.elements.categoria?.value || null;
      const localidad = f.elements.localidad?.value || null;
      const discapacidad = f.elements.discapacidad?.checked || false;
      const nivel_discapacidad = f.elements.nivelDiscapacidad?.value || null;
      const estudios = f.elements.estudios?.value || null;

      if (!nombre || !apellido || !dni || !numero_afiliado || !parentesco || !sexo) {
        Swal.fire("Atención", "Completá todos los campos obligatorios", "warning");
        return;
      }

      if (parentesco === "Hijos" && fechaNacimiento) {

        const cumplio21 = pasoEdadLimite(fechaNacimiento, 21);
        const cumplio26 = pasoEdadLimite(fechaNacimiento, 26);

        // No estudia → hasta el día que cumple 21
        if (!estudios && cumplio21) {
          Swal.fire(
            "No permitido",
            "Los hijos pueden afiliarse hasta el día que cumplen 21 años",
            "error"
          );
          return;
        }

        // Estudia → hasta el día que cumple 26
        if (estudios && cumplio26) {
          Swal.fire(
            "No permitido",
            "Los hijos que estudian pueden afiliarse hasta el día que cumplen 26 años",
            "error"
          );
          return;
        }

        // Si tiene 18 o más y está dentro del rango → exigir estudios
        if (!cumplio21 && calcularEdad(fechaNacimiento) >= 18 && !estudios) {
          Swal.fire(
            "Atención",
            "Debe indicar qué estudios cursa",
            "warning"
          );
          return;
        }
      }

      const match = numero_afiliado.match(/^[^-]+-([^/]+)\//);
      if (!match) {
        Swal.fire("Formato incorrecto", "Formato esperado: 19-00639-4/00", "error");
        return;
      }

      const grupoFamiliarCodigo = match[1];

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user.id;

      const { error } = await supabase
        .from("afiliados")
        .insert({
          nombre,
          apellido,
          dni,
          telefono,
          fecha_nacimiento: fechaNacimiento,
          numero_afiliado,
          grupo_familiar_codigo: grupoFamiliarCodigo,
          parentesco,
          sexo,
          plan,
          categoria,
          localidad,
          discapacidad,
          nivel_discapacidad,
          estudios,
          created_by: userId
        });

      if (error) throw error;

      Swal.fire("Guardado", "Afiliado agregado correctamente", "success");
      f.reset();
      actualizarCampoEstudios();

    } catch (err) {
      console.error(err);

      if (err.code === "23505") {
        if (err.message.includes("afiliados_dni")) {
          Swal.fire("DNI duplicado", "Ya existe un afiliado con ese DNI", "warning");
          return;
        }

        if (err.message.includes("afiliados_numero")) {
          Swal.fire(
            "Número de afiliado duplicado",
            "Ya existe un afiliado con ese número de afiliado",
            "warning"
          );
          return;
        }
      }

      Swal.fire("Error", "No se pudo guardar el afiliado", "error");

    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar";
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