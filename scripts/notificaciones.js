// notificaciones.js
import { supabase } from "./supabase.js";
import { actualizarNotificaciones } from "./header.js";

let generandoNotificaciones = false;

// =====================================================
// HELPERS FECHA (SOLUCION UTC / ARGENTINA)
// =====================================================

function hoyArgentina() {
  const ahora = new Date();
  return new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate()
  );
}

function normalizarFecha(fecha) {

  if (!fecha) return null;

  // caso DATE de supabase "YYYY-MM-DD"
  if (typeof fecha === "string" && fecha.length === 10) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // caso TIMESTAMP
  const f = new Date(fecha);
  return new Date(
    f.getFullYear(),
    f.getMonth(),
    f.getDate()
  );
}

function calcularDiasRestantes(fechaFin) {

  const hoy = hoyArgentina();
  const fin = normalizarFecha(fechaFin);

  if (!fin) return null;

  const diff = fin - hoy;

  return Math.round(diff / 86400000);
}

// =====================================================
// MENSAJES INTELIGENTES
// =====================================================

function generarMensajeVencimiento(nombre, apellido, tipoTexto, diasRestantes) {

  if (diasRestantes < 0) {
    return `⚠️ El/la afiliado/a ${nombre} ${apellido} tiene ${tipoTexto} vencido hace ${Math.abs(diasRestantes)} días`;
  }

  if (diasRestantes === 0) {
    return `⚠️ El/la afiliado/a ${nombre} ${apellido} tiene ${tipoTexto} que vence hoy`;
  }

  if (diasRestantes === 1) {
    return `El/la afiliado/a ${nombre} ${apellido} tiene ${tipoTexto} que vence mañana`;
  }

  return `El/la afiliado/a ${nombre} ${apellido} tiene ${tipoTexto} que vence en ${diasRestantes} días`;
}

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

    if (existente.mensaje !== mensaje) {

      const { error: errUpdate } = await supabase
        .from("notificaciones")
        .update({
          mensaje,
          leida: false,
          creada: new Date().toISOString()
        })
        .eq("id", existente.id);

      if (errUpdate) console.error("❌ Error actualizando:", errUpdate);
    }

    return;
  }

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

  if (registrosValidos.length === 0) {

    const { error } = await supabase
      .from("notificaciones")
      .delete()
      .eq("usuario_id", usuario.id)
      .eq("tipo", tipo);

    if (error) console.error("❌ Error eliminando notificaciones:", error);

    return;
  }

  const { error } = await supabase
    .from("notificaciones")
    .delete()
    .eq("usuario_id", usuario.id)
    .eq("tipo", tipo)
    .not("registro_id", "in", `(${registrosValidos.join(",")})`);

  if (error) console.error("❌ Error eliminando notificaciones obsoletas:", error);
}

// =====================================================
// MEDICAMENTOS
// =====================================================

async function generarNotificacionesMedicamentos(usuario) {

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

    const diasRestantes = calcularDiasRestantes(med.proxima_carga);

    if (diasRestantes >= -1) {

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
// ATENCION DOMICILIARIA
// =====================================================

async function generarNotificacionesAtencionDomiciliaria(usuario) {

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

    const diasRestantes = calcularDiasRestantes(at.fecha_fin_periodo);

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
// EXPEDIENTE DISCAPACIDAD
// =====================================================

async function generarNotificacionesExpedienteDiscapacidad(usuario) {

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

    const diasRestantes = calcularDiasRestantes(ex.fecha_finalizacion);

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

    if (tiposPermitidos.includes("medicamentos"))
      await generarNotificacionesMedicamentos(usuario);

    if (tiposPermitidos.includes("atencionDomiciliaria"))
      await generarNotificacionesAtencionDomiciliaria(usuario);

    if (tiposPermitidos.includes("expediente_discapacidad"))
      await generarNotificacionesExpedienteDiscapacidad(usuario);

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