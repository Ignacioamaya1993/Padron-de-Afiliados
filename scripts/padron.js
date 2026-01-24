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
      .select(`
        id,
        nombre_completo,
        dni,
        afiliado,
        grupo_familiar_id,
        relacion
      `)
      .or(`
        nombre_completo.ilike.%${texto}%,
        dni.ilike.%${texto}%,
        afiliado.ilike.%${texto}%
      `)
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
        Afiliado: ${a.afiliado} |
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

    const numeroBaseInput = f.numeroBase.value.trim(); // ej: 50271-5
    const sufijo = f.sufijo.value.trim();              // libre: 00, 99, etc
    const relacion = f.relacion.value;

    if (
      !nombre ||
      !apellido ||
      !dni ||
      !numeroBaseInput ||
      !sufijo ||
      !relacion
    ) {
      Swal.fire(
        "Atención",
        "Completá todos los campos obligatorios",
        "warning"
      );
      return;
    }

    const nombreCompleto =
      `${apellido.toUpperCase()} ${nombre.toUpperCase()}`;

    const numeroBase = `19-${numeroBaseInput}`;

    try {
      /* =====================
         1. BUSCAR O CREAR GRUPO
      ===================== */
      let grupoId;

      const { data: grupoExistente, error: errorGrupo } = await supabase
        .from("grupos_familiares")
        .select("id")
        .eq("numero_afiliado_base", numeroBase)
        .maybeSingle();

      if (errorGrupo) throw errorGrupo;

      if (grupoExistente) {
        grupoId = grupoExistente.id;
      } else {
        const { data: nuevoGrupo, error } = await supabase
          .from("grupos_familiares")
          .insert({
            numero_afiliado_base: numeroBase
          })
          .select()
          .single();

        if (error) throw error;
        grupoId = nuevoGrupo.id;
      }

      /* =====================
         2. INSERTAR AFILIADO
      ===================== */
      const { error: insertError } = await supabase
        .from("afiliados")
        .insert({
          grupo_id: grupoId,
          nombre,
          apellido,
          nombre_completo: nombreCompleto,
          dni,
          telefono,
          fecha_nacimiento: fechaNacimiento,
          sufijo,
          relacion
        });

      if (insertError) {
        if (insertError.message?.includes("grupo_sufijo_unico")) {
          Swal.fire(
            "Error",
            "Ese sufijo ya existe dentro del grupo familiar",
            "error"
          );
          return;
        }

        throw insertError;
      }

      Swal.fire(
        "Guardado",
        "Afiliado agregado correctamente",
        "success"
      );

      f.reset();

    } catch (err) {
      console.error(err);
      Swal.fire(
        "Error",
        "No se pudo guardar el afiliado",
        "error"
      );
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
