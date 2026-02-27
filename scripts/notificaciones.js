// notificaciones.js
import { supabase } from "./supabase.js";
import { actualizarNotificaciones } from "./header.js";

// =====================================================
// LOCK GLOBAL (ANTI DOBLE EJECUCIÓN)
// =====================================================
let generandoNotificaciones = false;

// =====================================================
// FUNCION CENTRAL (ANTI DUPLICADOS)
// =====================================================
async function crearNotificacionSiNoExiste({
  usuario,
  tipo,
  afiliado_id,
  mensaje
}) {
  if (!usuario?.id || !tipo || !afiliado_id) {
    return;
  }

  const { data: existente, error } = await supabase
    .from("notificaciones")
    .select("id")
    .eq("usuario_id", usuario.id)
    .eq("tipo", tipo)
    .eq("afiliado_id", afiliado_id)
    .maybeSingle();

  if (error) {
    console.error("❌ Error verificando existente:", error);
    return;
  }

  if (existente) {
    return;
  }

  const { error: errorInsert } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id: usuario.id,
      tipo,
      mensaje,
      afiliado_id,
      leida: false,
      creada: new Date().toISOString(),
    });

  if (errorInsert) {
    console.error("❌ Error insertando:", errorInsert);
  } else {
  }
}

// =====================================================
// MEDICAMENTOS
// =====================================================
async function generarNotificacionesMedicamentos(usuario) {

  const hoy = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + 20);

  const { data: meds, error } = await supabase
    .from("medicamentos")
    .select(`*, afiliado_id, afiliados(nombre, apellido)`)
    .lte("proxima_carga", limite.toISOString())
    .gte("proxima_carga", hoy.toISOString());

  if (error) {
    console.error("❌ Error medicamentos:", error);
    return;
  }


  for (const med of meds || []) {
    const mensaje = `El/la afiliado/a ${med.afiliados?.nombre || ""} ${med.afiliados?.apellido || ""} tiene un medicamento que vence en 20 días`;

    await crearNotificacionSiNoExiste({
      usuario,
      tipo: "medicamentos",
      afiliado_id: med.afiliado_id,
      mensaje
    });
  }
}

// =====================================================
// ATENCION DOMICILIARIA
// =====================================================
async function generarNotificacionesAtencionDomiciliaria(usuario) {

  const hoy = new Date();
  const limite = new Date();
  limite.setMonth(limite.getMonth() + 1);

  const { data: atenciones, error } = await supabase
    .from("atencion_domiciliaria")
    .select(`*, afiliado_id, afiliados(nombre, apellido)`)
    .lte("fecha_fin_periodo", limite.toISOString())
    .gte("fecha_fin_periodo", hoy.toISOString());

  if (error) {
    console.error("❌ Error atención domiciliaria:", error);
    return;
  }

  for (const at of atenciones || []) {
    const mensaje = `El/la afiliado/a ${at.afiliados?.nombre || ""} ${at.afiliados?.apellido || ""} tiene atención domiciliaria que vence en un mes`;

    await crearNotificacionSiNoExiste({
      usuario,
      tipo: "atencion_domiciliaria",
      afiliado_id: at.afiliado_id,
      mensaje
    });
  }
}

// =====================================================
// EXPEDIENTE DISCAPACIDAD
// =====================================================
async function generarNotificacionesExpedienteDiscapacidad(usuario) {

  const hoy = new Date();
  const limite = new Date();
  limite.setMonth(limite.getMonth() + 1);

  const { data: expedientes, error } = await supabase
    .from("expediente_discapacidad")
    .select(`*, afiliado_id, afiliados(nombre, apellido)`)
    .lte("fecha_finalizacion", limite.toISOString())
    .gte("fecha_finalizacion", hoy.toISOString());

  if (error) {
    console.error("❌ Error expediente discapacidad:", error);
    return;
  }


  for (const ex of expedientes || []) {
    const mensaje = `El/la afiliado/a ${ex.afiliados?.nombre || ""} ${ex.afiliados?.apellido || ""} tiene expediente de discapacidad que vence en un mes`;

    await crearNotificacionSiNoExiste({
      usuario,
      tipo: "expediente_discapacidad",
      afiliado_id: ex.afiliado_id,
      mensaje
    });
  }
}

// =====================================================
// FUNCION PRINCIPAL
// =====================================================
export async function generarNotificaciones(usuario) {
  if (!usuario) {
    return;
  }

  if (generandoNotificaciones) {
    return;
  }

  generandoNotificaciones = true;

  try {
    const tiposPermitidos = usuario.notificaciones || [];

    if (tiposPermitidos.includes("medicamentos")) {
      await generarNotificacionesMedicamentos(usuario);
    }

    if (tiposPermitidos.includes("atencion_domiciliaria")) {
      await generarNotificacionesAtencionDomiciliaria(usuario);
    }

    if (tiposPermitidos.includes("expediente_discapacidad")) {
      await generarNotificacionesExpedienteDiscapacidad(usuario);
    }

    // Actualizar badge
    const { count, error } = await supabase
      .from("notificaciones")
      .select("*", { count: "exact", head: true })
      .eq("usuario_id", usuario.id)
      .eq("leida", false);

    if (!error) {
      actualizarNotificaciones(count || 0);
    } else {
      console.error("❌ Error contando notificaciones:", error);
    }

  } catch (err) {
    console.error("❌ Error general generarNotificaciones:", err);
  }

  generandoNotificaciones = false;
}

// =====================================================
// OBTENER ULTIMAS NOTIFICACIONES
// =====================================================
export async function obtenerUltimasNotificaciones(usuario, limite = 10) {
  if (!usuario) return [];

  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuario.id)
    .order("creada", { ascending: false })
    .limit(limite);

  if (error) {
    console.error("❌ Error obteniendo notificaciones:", error);
    return [];
  }

  return data || [];
}

// =====================================================
// EXPORTS
// =====================================================
export {
  generarNotificacionesMedicamentos,
  generarNotificacionesAtencionDomiciliaria,
  generarNotificacionesExpedienteDiscapacidad
};