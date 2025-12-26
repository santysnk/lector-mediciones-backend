// src/controllers/agenteApiController.js
// Controlador REST para comunicación con agentes

const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');
const { generarTokenAgente } = require('../middleware/authAgente');
const { registrarLogAgente } = require('./agentesController');

// ============================================
// POST /api/agente/auth
// Autenticación del agente con clave secreta
// ============================================
async function autenticar(req, res) {
  try {
    const { claveSecreta } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    if (!claveSecreta) {
      return res.status(400).json({ error: 'claveSecreta es requerida' });
    }

    // Obtener todos los agentes activos
    const { data: agentes, error } = await supabase
      .from('agentes')
      .select('id, nombre, clave_hash, clave_anterior_hash, clave_rotada_at, activo')
      .eq('activo', true);

    if (error) {
      console.error('[AgenteAPI] Error obteniendo agentes:', error);
      return res.status(500).json({ error: 'Error de base de datos' });
    }

    // Buscar el agente cuya clave coincida
    let agenteEncontrado = null;
    let usoClavePrincipal = true;
    let advertencia = null;

    for (const agente of agentes) {
      // Verificar clave actual
      const coincideActual = await bcrypt.compare(claveSecreta, agente.clave_hash);
      if (coincideActual) {
        agenteEncontrado = agente;
        usoClavePrincipal = true;
        break;
      }

      // Verificar clave anterior (si existe y no ha expirado - 24h)
      if (agente.clave_anterior_hash && agente.clave_rotada_at) {
        const rotadaHace = Date.now() - new Date(agente.clave_rotada_at).getTime();
        const veinticuatroHoras = 24 * 60 * 60 * 1000;

        if (rotadaHace < veinticuatroHoras) {
          const coincideAnterior = await bcrypt.compare(claveSecreta, agente.clave_anterior_hash);
          if (coincideAnterior) {
            agenteEncontrado = agente;
            usoClavePrincipal = false;
            advertencia = 'Usando clave anterior, por favor actualice la configuración del agente';
            break;
          }
        }
      }
    }

    if (!agenteEncontrado) {
      console.log(`[AgenteAPI] Autenticación fallida desde ${clientIp}`);
      return res.status(401).json({ error: 'Clave inválida' });
    }

    // Generar token JWT
    const token = generarTokenAgente(agenteEncontrado.id, agenteEncontrado.nombre);

    // Actualizar ultimo_heartbeat e IP
    await supabase
      .from('agentes')
      .update({
        ultimo_heartbeat: new Date().toISOString(),
        ip_ultima_conexion: clientIp,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agenteEncontrado.id);

    // Registrar log de autenticación
    await registrarLogAgente(agenteEncontrado.id, 'autenticacion_rest', clientIp, {
      usoClavePrincipal,
    }, true);

    // Buscar workspaces vinculados a este agente
    const { data: workspaces } = await supabase
      .from('workspace_agentes')
      .select('workspace_id, workspaces(id, nombre)')
      .eq('agente_id', agenteEncontrado.id);

    console.log(`[AgenteAPI] Agente autenticado: ${agenteEncontrado.nombre} (${agenteEncontrado.id.substring(0, 8)}...)`);

    res.json({
      exito: true,
      token,
      agente: {
        id: agenteEncontrado.id,
        nombre: agenteEncontrado.nombre,
      },
      workspaces: workspaces?.map(w => w.workspaces) || [],
      advertencia,
    });

  } catch (err) {
    console.error('[AgenteAPI] Error en autenticar:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// POST /api/agente/heartbeat
// El agente reporta que está vivo
// ============================================
async function heartbeat(req, res) {
  try {
    const { version } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const agenteId = req.agente.id;

    // Actualizar heartbeat
    const { error } = await supabase
      .from('agentes')
      .update({
        ultimo_heartbeat: new Date().toISOString(),
        ip_ultima_conexion: clientIp,
        version_software: version || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agenteId);

    if (error) {
      console.error('[AgenteAPI] Error actualizando heartbeat:', error);
      return res.status(500).json({ error: 'Error actualizando heartbeat' });
    }

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[AgenteAPI] Error en heartbeat:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// GET /api/agente/config
// Obtiene la configuración del agente (registradores)
// ============================================
async function obtenerConfiguracion(req, res) {
  try {
    const agenteId = req.agente.id;

    // Obtener registradores asignados al agente
    // Nota: Se usa alimentadores!alimentadores_registrador_id_fkey para desambiguar
    // porque existen dos FK entre registradores y alimentadores
    const { data: registradores, error } = await supabase
      .from('registradores')
      .select(`
        id,
        nombre,
        tipo,
        ip,
        puerto,
        unit_id,
        indice_inicial,
        cantidad_registros,
        intervalo_segundos,
        timeout_ms,
        activo,
        alimentador_id,
        tipo_registrador_id,
        alimentadores!alimentadores_registrador_id_fkey(id, nombre, puesto_id, puestos(id, nombre, workspace_id))
      `)
      .eq('agente_id', agenteId)
      .eq('activo', true);

    if (error) {
      console.error('[AgenteAPI] Error obteniendo registradores:', error);
      return res.status(500).json({ error: 'Error obteniendo configuración' });
    }

    // Formatear respuesta
    const config = registradores.map(r => ({
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo,
      ip: r.ip,
      puerto: r.puerto,
      unitId: r.unit_id,
      indiceInicial: r.indice_inicial,
      cantidadRegistros: r.cantidad_registros,
      intervaloSegundos: r.intervalo_segundos,
      timeoutMs: r.timeout_ms || 5000,
      alimentador: r.alimentadores ? {
        id: r.alimentadores.id,
        nombre: r.alimentadores.nombre,
        puestoId: r.alimentadores.puesto_id,
        puestoNombre: r.alimentadores.puestos?.nombre,
        workspaceId: r.alimentadores.puestos?.workspace_id,
      } : null,
    }));

    res.json({
      agente: req.agente,
      registradores: config,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[AgenteAPI] Error en obtenerConfiguracion:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// POST /api/agente/lecturas
// El agente envía lecturas
// ============================================
async function enviarLecturas(req, res) {
  try {
    const { lecturas } = req.body;
    const agenteId = req.agente.id;

    if (!lecturas || !Array.isArray(lecturas)) {
      return res.status(400).json({ error: 'lecturas debe ser un array' });
    }

    if (lecturas.length === 0) {
      return res.json({ ok: true, insertadas: 0 });
    }

    // Validar que los registradores pertenecen a este agente
    const registradorIds = [...new Set(lecturas.map(l => l.registradorId))];

    const { data: registradoresValidos, error: errorReg } = await supabase
      .from('registradores')
      .select('id')
      .eq('agente_id', agenteId)
      .in('id', registradorIds);

    if (errorReg) {
      console.error('[AgenteAPI] Error validando registradores:', errorReg);
      return res.status(500).json({ error: 'Error validando registradores' });
    }

    const idsValidos = new Set(registradoresValidos.map(r => r.id));

    // Filtrar lecturas válidas y formatear para inserción
    // Nota: No guardamos indice_inicial en la lectura - se obtiene del registrador al consultar
    const lecturasValidas = lecturas
      .filter(l => idsValidos.has(l.registradorId))
      .map(l => ({
        registrador_id: l.registradorId,
        timestamp: l.timestamp || new Date().toISOString(),
        valores: l.valores,
        tiempo_respuesta_ms: l.tiempoMs || null,
        exito: l.exito !== false,
        error_mensaje: l.error || null,
      }));

    if (lecturasValidas.length === 0) {
      return res.status(400).json({ error: 'Ninguna lectura válida para este agente' });
    }

    // Insertar lecturas
    const { error: errorInsert } = await supabase
      .from('lecturas')
      .insert(lecturasValidas);

    if (errorInsert) {
      console.error('[AgenteAPI] Error insertando lecturas:', errorInsert);
      return res.status(500).json({ error: 'Error guardando lecturas' });
    }

    // Actualizar ultima_lectura_exitosa en registradores
    const exitosas = lecturasValidas.filter(l => l.exito);
    for (const lectura of exitosas) {
      await supabase
        .from('registradores')
        .update({
          ultima_lectura_exitosa: lectura.timestamp,
          ultimo_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lectura.registrador_id);
    }

    // Actualizar errores
    const fallidas = lecturasValidas.filter(l => !l.exito);
    for (const lectura of fallidas) {
      await supabase
        .from('registradores')
        .update({
          ultimo_error: lectura.error_mensaje,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lectura.registrador_id);
    }

    res.json({
      ok: true,
      insertadas: lecturasValidas.length,
      rechazadas: lecturas.length - lecturasValidas.length,
    });

  } catch (err) {
    console.error('[AgenteAPI] Error en enviarLecturas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// POST /api/agente/log
// El agente envía un log
// ============================================
async function enviarLog(req, res) {
  try {
    const { nivel, mensaje, metadata } = req.body;
    const agenteId = req.agente.id;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    if (!mensaje) {
      return res.status(400).json({ error: 'mensaje es requerido' });
    }

    const { error } = await supabase
      .from('agente_logs')
      .insert({
        agente_id: agenteId,
        accion: nivel || 'info',
        ip: clientIp,
        detalles: { mensaje, ...metadata },
        exito: nivel !== 'error',
      });

    if (error) {
      console.error('[AgenteAPI] Error insertando log:', error);
      return res.status(500).json({ error: 'Error guardando log' });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error('[AgenteAPI] Error en enviarLog:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// POST /api/agente/vincular
// El agente se vincula a un workspace usando código
// ============================================
async function vincular(req, res) {
  try {
    const { codigo } = req.body;
    const agenteId = req.agente.id;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    if (!codigo) {
      return res.status(400).json({ error: 'codigo es requerido' });
    }

    // Buscar código válido
    const { data: codigoData, error: errorCodigo } = await supabase
      .from('codigos_vinculacion')
      .select('*, workspaces(id, nombre)')
      .eq('codigo', codigo.toUpperCase())
      .eq('usado', false)
      .single();

    if (errorCodigo || !codigoData) {
      await registrarLogAgente(agenteId, 'vinculacion', clientIp, { codigo, error: 'Código no encontrado' }, false);
      return res.status(400).json({ error: 'Código inválido o ya usado' });
    }

    // Verificar expiración
    if (new Date(codigoData.expira_at) < new Date()) {
      await registrarLogAgente(agenteId, 'vinculacion', clientIp, { codigo, error: 'Código expirado' }, false);
      return res.status(400).json({ error: 'Código expirado' });
    }

    // Verificar rate limiting
    if (codigoData.intentos_fallidos >= 5) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos' });
    }

    // Crear relación en workspace_agentes
    const { error: errorInsert } = await supabase
      .from('workspace_agentes')
      .upsert({
        workspace_id: codigoData.workspace_id,
        agente_id: agenteId,
      }, {
        onConflict: 'workspace_id,agente_id',
      });

    if (errorInsert) {
      console.error('[AgenteAPI] Error vinculando:', errorInsert);
      return res.status(500).json({ error: 'Error vinculando workspace' });
    }

    // Marcar código como usado
    await supabase
      .from('codigos_vinculacion')
      .update({ usado: true, agente_id: agenteId })
      .eq('id', codigoData.id);

    // Registrar log exitoso
    await registrarLogAgente(agenteId, 'vinculacion', clientIp, {
      codigo,
      workspace_id: codigoData.workspace_id,
      workspace_nombre: codigoData.workspaces?.nombre,
    }, true);

    res.json({
      exito: true,
      workspace: {
        id: codigoData.workspace_id,
        nombre: codigoData.workspaces?.nombre,
      },
    });

  } catch (err) {
    console.error('[AgenteAPI] Error en vincular:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  autenticar,
  heartbeat,
  obtenerConfiguracion,
  enviarLecturas,
  enviarLog,
  vincular,
};
