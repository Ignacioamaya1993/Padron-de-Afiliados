// notificaciones.js
import { supabase } from "./supabase.js";
import { actualizarNotificaciones } from "./header.js";

let generandoNotificaciones = false;

// =====================================================
// CREAR O ACTUALIZAR NOTIFICACIÓN
// =====================================================
async function crearOActualizarNotificacion({ usuario, tipo, afiliado_id, registro_id, mensaje }) {
  if (!usuario?.id || !tipo || !afiliado_id || !registro_id) return;

  const { data: existente, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuario.id)
    .eq("tipo", tipo)
    .eq("afiliado_id", afiliado_id)
    .eq("registro_id", registro_id)
    .maybeSingle();

  if (error) {
    console.error("❌ Error verificando existente:", error);
    return;
  }

  if (existente) {
    // Actualiza mensaje si cambió
    if (existente.mensaje !== mensaje) {
      const { error: errUpdate } = await supabase
        .from("notificaciones")
        .update({ mensaje, leida: false, creada: new Date().toISOString() })
        .eq("id", existente.id);

      if (errUpdate) console.error("❌ Error actualizando:", errUpdate);
    }
    return;
  }

  // Insertar nueva notificación
  const { error: errorInsert } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id: usuario.id,
      tipo,
      afiliado_id,
      registro_id,
      mensaje,
      leida: false,
      creada: new Date().toISOString(),
    });

  if (errorInsert) console.error("❌ Error insertando:", errorInsert);
}

// =====================================================
// ELIMINAR NOTIFICACIONES OBSOLETAS
// =====================================================
async function eliminarNotificacionesObsoletas(usuario, tipo, registrosValidos) {
  if (!usuario?.id || !tipo || !Array.isArray(registrosValidos)) return;

  const { error } = await supabase
    .from("notificaciones")
    .delete()
    .eq("usuario_id", usuario.id)
    .eq("tipo", tipo)
    .not("registro_id", "in", `(${registrosValidos.join(",")})`);

  if (error) console.error("❌ Error eliminando notificaciones obsoletas:", error);
}

// =====================================================
// HELPER: FORMATEAR MENSAJE CON VENCIDA
// =====================================================
function generarMensajeVencimiento(nombre, apellido, tipoTexto, diasRestantes) {
  if (diasRestantes < 0) {
    return `⚠️ El/la afiliado/a ${nombre} ${apellido} tiene ${tipoTexto} vencida`;
  } else {
    return `El/la afiliado/a ${nombre} ${apellido} tiene ${tipoTexto} que vence en ${diasRestantes} días`;
  }
}

// =====================================================
// GENERAR NOTIFICACIONES MEDICAMENTOS
// =====================================================
async function generarNotificacionesMedicamentos(usuario) {
  const hoy = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + 20);

  const { data: meds, error } = await supabase
    .from("medicamentos")
    .select(`id, fecha_entrega, proxima_carga, afiliado_id, afiliados(nombre, apellido)`)
    .lte("proxima_carga", limite.toISOString());

  if (error) {
    console.error("❌ Error medicamentos:", error);
    return;
  }

  const registrosValidos = [];

  for (const med of meds || []) {
    const fechaFin = new Date(med.proxima_carga);
    const diasRestantes = Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24));

    if (diasRestantes >= -1) { // incluir vencidos recientes
      const mensaje = generarMensajeVencimiento(
        med.afiliados?.nombre || "",
        med.afiliados?.apellido || "",
        "medicamento",
        diasRestantes
      );

      await crearOActualizarNotificacion({
        usuario,
        tipo: "medicamentos",
        afiliado_id: med.afiliado_id,
        registro_id: med.id,
        mensaje
      });

      registrosValidos.push(med.id);
    }
  }

  await eliminarNotificacionesObsoletas(usuario, "medicamentos", registrosValidos);
}

// =====================================================
// GENERAR NOTIFICACIONES ATENCION DOMICILIARIA
// =====================================================
async function generarNotificacionesAtencionDomiciliaria(usuario) {
  const hoy = new Date();
  const limite = new Date();
  limite.setMonth(limite.getMonth() + 1);

  const { data: atenciones, error } = await supabase
    .from("atencion_domiciliaria")
    .select(`id, fecha_inicio_periodo, fecha_fin_periodo, afiliado_id, afiliados(nombre, apellido)`)
    .lte("fecha_fin_periodo", limite.toISOString());

  if (error) {
    console.error("❌ Error atención domiciliaria:", error);
    return;
  }

  const registrosValidos = [];

  for (const at of atenciones || []) {
    const fechaFin = new Date(at.fecha_fin_periodo);
    const diasRestantes = Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24));

    if (diasRestantes >= -1) {
      const mensaje = generarMensajeVencimiento(
        at.afiliados?.nombre || "",
        at.afiliados?.apellido || "",
        "atención domiciliaria",
        diasRestantes
      );

      await crearOActualizarNotificacion({
        usuario,
        tipo: "atencionDomiciliaria",
        afiliado_id: at.afiliado_id,
        registro_id: at.id,
        mensaje
      });

      registrosValidos.push(at.id);
    }
  }

  await eliminarNotificacionesObsoletas(usuario, "atencionDomiciliaria", registrosValidos);
}

// =====================================================
// GENERAR NOTIFICACIONES EXPEDIENTE DISCAPACIDAD
// =====================================================
async function generarNotificacionesExpedienteDiscapacidad(usuario) {
  const hoy = new Date();
  const limite = new Date();
  limite.setMonth(limite.getMonth() + 1);

  const { data: expedientes, error } = await supabase
    .from("expediente_discapacidad")
    .select(`id, fecha_inicio, fecha_finalizacion, afiliado_id, afiliados(nombre, apellido)`)
    .lte("fecha_finalizacion", limite.toISOString());

  if (error) {
    console.error("❌ Error expediente discapacidad:", error);
    return;
  }

  const registrosValidos = [];

  for (const ex of expedientes || []) {
    const fechaFin = new Date(ex.fecha_finalizacion);
    const diasRestantes = Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24));

    if (diasRestantes >= -1) {
      const mensaje = generarMensajeVencimiento(
        ex.afiliados?.nombre || "",
        ex.afiliados?.apellido || "",
        "expediente de discapacidad",
        diasRestantes
      );

      await crearOActualizarNotificacion({
        usuario,
        tipo: "expediente_discapacidad",
        afiliado_id: ex.afiliado_id,
        registro_id: ex.id,
        mensaje
      });

      registrosValidos.push(ex.id);
    }
  }

  await eliminarNotificacionesObsoletas(usuario, "expediente_discapacidad", registrosValidos);
}

// =====================================================
// FUNCION PRINCIPAL
// =====================================================
export async function generarNotificaciones(usuario) {
  if (!usuario || generandoNotificaciones) return;
  generandoNotificaciones = true;

  try {
    const tiposPermitidos = usuario.notificaciones || [];

    if (tiposPermitidos.includes("medicamentos")) {
      await generarNotificacionesMedicamentos(usuario);
    }
    if (tiposPermitidos.includes("atencionDomiciliaria")) {
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

    if (!error) actualizarNotificaciones(count || 0);
    else console.error("❌ Error contando notificaciones:", error);
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