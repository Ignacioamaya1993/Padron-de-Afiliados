// notificaciones.js
import { supabase } from "./supabase.js";
import { actualizarNotificaciones } from "./header.js"; // función del header para actualizar badge

// ================================
// FUNCIONES INDIVIDUALES POR TABLA
// ================================

async function generarNotificacionesMedicamentos(usuario) {
  const hoy = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + 20);

  const { data: meds, error } = await supabase
    .from("medicamentos")
    .select(`*, tipo_medicamentos(nombre), afiliado_id, afiliados(nombre, apellido)`) // se corrige relación
    .lte("proxima_carga", limite.toISOString())
    .gte("proxima_carga", hoy.toISOString());

  if (error) return console.error("Medicamentos:", error);

  for (const med of meds) {
    const mensaje = `El afiliado ${med.afiliados?.nombre || ""} ${med.afiliados?.apellido || ""} tiene un medicamento que vence en 20 días`;

    const { data: existentes, error: errorExistentes } = await supabase
      .from("notificaciones")
      .select("*")
      .eq("usuario_id", usuario.id)
      .eq("tipo", "medicamentos")
      .eq("mensaje", mensaje);

    if (errorExistentes) return console.error("Verificando existentes medicamentos:", errorExistentes);

    if (!existentes?.length) {
      await supabase.from("notificaciones").insert({
        usuario_id: usuario.id,
        tipo: "medicamentos",
        mensaje,
        afiliado_id: med.afiliado_id,
        leida: false,
        creada: new Date().toISOString(),
      });
    }
  }
}

async function generarNotificacionesAtencionDomiciliaria(usuario) {
  const hoy = new Date();
  const limite = new Date();
  limite.setMonth(limite.getMonth() + 1);

  const { data: atenciones, error } = await supabase
    .from("atencion_domiciliaria")
    .select(`*, afiliado_id, afiliados(nombre, apellido)`)
    .lte("fecha_fin_periodo", limite.toISOString())
    .gte("fecha_fin_periodo", hoy.toISOString());

  if (error) return console.error("Atención domiciliaria:", error);

  for (const at of atenciones) {
    const mensaje = `El afiliado ${at.afiliados?.nombre || ""} ${at.afiliados?.apellido || ""} tiene atención domiciliaria que vence en un mes`;

    const { data: existentes, error: errorExistentes } = await supabase
      .from("notificaciones")
      .select("*")
      .eq("usuario_id", usuario.id)
      .eq("tipo", "atencion_domiciliaria")
      .eq("mensaje", mensaje);

    if (errorExistentes) return console.error("Verificando existentes atencion domiciliaria:", errorExistentes);

    if (!existentes?.length) {
      await supabase.from("notificaciones").insert({
        usuario_id: usuario.id,
        tipo: "atencion_domiciliaria",
        mensaje,
        afiliado_id: at.afiliado_id,
        leida: false,
        creada: new Date().toISOString(),
      });
    }
  }
}

async function generarNotificacionesExpedienteDiscapacidad(usuario) {
  const hoy = new Date();
  const limite = new Date();
  limite.setMonth(limite.getMonth() + 1);

  const { data: expedientes, error } = await supabase
    .from("expediente_discapacidad")
    .select(`*, afiliado_id, afiliados(nombre, apellido)`)
    .lte("fecha_finalizacion", limite.toISOString())
    .gte("fecha_finalizacion", hoy.toISOString());

  if (error) return console.error("Expediente discapacidad:", error);

  for (const ex of expedientes) {
    const mensaje = `El afiliado ${ex.afiliados?.nombre || ""} ${ex.afiliados?.apellido || ""} tiene expediente de discapacidad que vence en un mes`;

    const { data: existentes, error: errorExistentes } = await supabase
      .from("notificaciones")
      .select("*")
      .eq("usuario_id", usuario.id)
      .eq("tipo", "expediente_discapacidad")
      .eq("mensaje", mensaje);

    if (errorExistentes) return console.error("Verificando existentes expediente discapacidad:", errorExistentes);

    if (!existentes?.length) {
      await supabase.from("notificaciones").insert({
        usuario_id: usuario.id,
        tipo: "expediente_discapacidad",
        mensaje,
        afiliado_id: ex.afiliado_id,
        leida: false,
        creada: new Date().toISOString(),
      });
    }
  }
}

// ================================
// FUNCION PRINCIPAL
// ================================

export async function generarNotificaciones(usuario) {
  if (!usuario) return;

  await generarNotificacionesMedicamentos(usuario);
  await generarNotificacionesAtencionDomiciliaria(usuario);
  await generarNotificacionesExpedienteDiscapacidad(usuario);

  // =========================
  // ACTUALIZAR BADGE
  // =========================
  const { count } = await supabase
    .from("notificaciones")
    .select("*", { count: "exact", head: true })
    .eq("usuario_id", usuario.id)
    .eq("leida", false);

  actualizarNotificaciones(count || 0);
}

// ================================
// OBTENER ULTIMAS NOTIFICACIONES
// ================================
export async function obtenerUltimasNotificaciones(usuario, limite = 10) {
  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuario.id)
    .order("creada", { ascending: false })
    .limit(limite);

  if (error) return console.error("Obteniendo ultimas notificaciones:", error);

  return data || [];
}

// ================================
// EXPORTS INDIVIDUALES
// ================================
export {
  generarNotificacionesMedicamentos,
  generarNotificacionesAtencionDomiciliaria,
  generarNotificacionesExpedienteDiscapacidad
};