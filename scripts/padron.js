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

  if (texto.length < 3) return;
  if (buscando) return;

  buscando = true;

  try {
    const { data, error } = await supabase
      .from("padron")
      .select("id, nombre_completo, dni, afiliado, grupo_familiar_id")
      .or(
        `nombre_completo.ilike.%${texto}%,dni.ilike.%${texto}%,afiliado.ilike.%${texto}%,grupo_familiar_id.ilike.%${texto}%`
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
        Afiliado: ${a.afiliado || "-"} |
        Grupo: ${a.grupo_familiar_id || "-"}
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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      Swal.fire("Error", "Sesión inválida", "error");
      return;
    }

    try {
      const payload = {
        nombre: f.nombre.value.trim(),
        apellido: f.apellido.value.trim(),
        nombre_completo: `${f.apellido.value.trim()} ${f.nombre.value.trim()}`,
        dni: f.dni.value.trim(),
        telefono: f.telefono.value.trim() || null,
        afiliado: f.afiliado.value.trim() || null,
        grupo_familiar_id: f.grupoFamiliarId.value.trim() || null,
        fecha_nacimiento: f.fechaNacimiento.value || null,
        created_by: user.id
      };

      await supabase
        .from("padron")
        .insert(payload);

      Swal.fire("Guardado", "Afiliado agregado", "success");
      f.reset();

    } catch (err) {
      console.error(err);

      if (err.message?.includes("padron_dni_unique")) {
        Swal.fire(
          "DNI duplicado",
          "Ya existe un afiliado con ese DNI",
          "warning"
        ).then(() => {
          f.dni.focus();
        });
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