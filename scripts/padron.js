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
document
  .getElementById("PadronForm")
  ?.addEventListener("submit", async e => {
    e.preventDefault();

    const f = e.target;

    const nombre = f.nombre.value.trim();
    const apellido = f.apellido.value.trim();
    const dni = f.dni.value.trim();
    const telefono = f.telefono.value.trim() || null;
    const fechaNacimiento = f.fechaNacimiento.value || null;
    const numeroAfiliado = f.numeroAfiliado.value.trim();
    const relacion = f.relacion.value;

    if (
      !nombre ||
      !apellido ||
      !dni ||
      !numeroAfiliado ||
      !relacion
    ) {
      Swal.fire(
        "Atención",
        "Completá todos los campos obligatorios",
        "warning"
      );
      return;
    }

    /* =====================
       DERIVAR GRUPO FAMILIAR
       ej: 19-00639-4/00 → 00639-4
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
          relacion
        });

      if (error) throw error;

      Swal.fire(
        "Guardado",
        "Afiliado agregado correctamente",
        "success"
      );

      f.reset();

    } catch (err) {
      console.error(err);

      if (err.message?.includes("dni")) {
        Swal.fire(
          "DNI duplicado",
          "Ya existe un afiliado con ese DNI",
          "warning"
        );
      } else {
        Swal.fire(
          "Error",
          "No se pudo guardar el afiliado",
          "error"
        );
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
