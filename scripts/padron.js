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
      .from("afiliados_view")
      .select(`
        id,
        nombre,
        dni,
        numero_afiliado,
        grupo_id,
        relacion
      `)
      .or(`
        nombre.ilike.%${texto}%,
        dni.ilike.%${texto}%,
        numero_afiliado.ilike.%${texto}%
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
        <strong>${a.nombre}</strong><br>
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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      Swal.fire("Error", "Sesión inválida", "error");
      return;
    }

    const numeroBase = f.numeroBase.value.trim();
    const relacion = f.relacion.value;

    if (!numeroBase || !relacion) {
      Swal.fire("Atención", "Completá todos los campos obligatorios", "warning");
      return;
    }

    try {
      /* =====================
         1. BUSCAR O CREAR GRUPO
      ===================== */
      let grupoId;

      const { data: grupoExistente } = await supabase
        .from("grupos_familiares")
        .select("id")
        .eq("numero_afiliado_base", numeroBase)
        .single();

      if (grupoExistente) {
        grupoId = grupoExistente.id;
      } else {
        const { data: nuevoGrupo, error } = await supabase
          .from("grupos_familiares")
          .insert({ numero_afiliado_base: numeroBase })
          .select()
          .single();

        if (error) throw error;
        grupoId = nuevoGrupo.id;
      }

      /* =====================
         2. DEFINIR SUFIJO
      ===================== */
      let sufijo;

      if (relacion === "Titular") {
        sufijo = "00";
      } else if (relacion === "Cónyuge") {
        sufijo = "99";
      } else {
        // Hijo/a → siguiente disponible
        const { data: existentes } = await supabase
          .from("afiliados")
          .select("sufijo")
          .eq("grupo_id", grupoId);

        const usados = existentes.map(a => parseInt(a.sufijo, 10));
        let next = 1;
        while (usados.includes(next)) next++;
        sufijo = next.toString().padStart(2, "0");
      }

      /* =====================
         3. INSERTAR AFILIADO
      ===================== */
      const nombreCompleto =
        `${f.apellido.value.trim()} ${f.nombre.value.trim()}`;

      const { error: insertError } = await supabase
        .from("afiliados")
        .insert({
          grupo_id: grupoId,
          sufijo,
          nombre: nombreCompleto,
          dni: f.dni.value.trim(),
          telefono: f.telefono.value.trim() || null,
          fecha_nacimiento: f.fechaNacimiento.value || null,
          relacion
        });

      if (insertError) throw insertError;

      Swal.fire("Guardado", "Afiliado agregado correctamente", "success");
      f.reset();

    } catch (err) {
      console.error(err);
      Swal.fire("Error", "No se pudo guardar el afiliado", "error");
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
