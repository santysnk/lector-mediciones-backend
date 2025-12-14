// src/controllers/agentesController.js
// Controlador para gestión de agentes y vinculación con workspaces

const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// ============================================
// Funciones auxiliares
// ============================================

/**
 * Genera un código de vinculación en formato XXXX-XXXX
 */
function generarCodigoVinculacion() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1 para evitar confusión
  let codigo = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) codigo += '-';
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return codigo;
}

/**
 * Genera una clave secreta para el agente
 */
function generarClaveSecreta() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================
// Autenticación de agentes (usado por WebSocket)
// ============================================

/**
 * Verifica la clave secreta del agente
 * @param {string} claveSecreta - Clave proporcionada por el agente
 * @returns {object} - { valido: boolean, agente?: object, error?: string }
 */
async function verificarClaveAgente(claveSecreta) {
  try {
    // Obtener todos los agentes activos
    const { data: agentes, error } = await supabase
      .from('agentes')
      .select('id, nombre, clave_hash, clave_anterior_hash, clave_rotada_at, activo')
      .eq('activo', true);

    if (error) {
      console.error('Error obteniendo agentes:', error);
      return { valido: false, error: 'Error de base de datos' };
    }

    // Buscar el agente cuya clave coincida
    for (const agente of agentes) {
      // Verificar clave actual
      const coincideActual = await bcrypt.compare(claveSecreta, agente.clave_hash);
      if (coincideActual) {
        return {
          valido: true,
          agente: { id: agente.id, nombre: agente.nombre },
          usoClavePrincipal: true
        };
      }

      // Verificar clave anterior (si existe y no ha expirado - 24h)
      if (agente.clave_anterior_hash && agente.clave_rotada_at) {
        const rotadaHace = Date.now() - new Date(agente.clave_rotada_at).getTime();
        const veinticuatroHoras = 24 * 60 * 60 * 1000;

        if (rotadaHace < veinticuatroHoras) {
          const coincideAnterior = await bcrypt.compare(claveSecreta, agente.clave_anterior_hash);
          if (coincideAnterior) {
            return {
              valido: true,
              agente: { id: agente.id, nombre: agente.nombre },
              usoClavePrincipal: false,
              advertencia: 'Usando clave anterior, por favor actualice'
            };
          }
        }
      }
    }

    return { valido: false, error: 'Clave inválida' };
  } catch (err) {
    console.error('Error verificando clave:', err);
    return { valido: false, error: 'Error interno' };
  }
}

/**
 * Registra un log de acción del agente
 */
async function registrarLogAgente(agenteId, accion, ip, detalles = {}, exito = true) {
  try {
    await supabase.from('agente_logs').insert({
      agente_id: agenteId,
      accion,
      ip,
      detalles,
      exito,
    });
  } catch (err) {
    console.error('Error registrando log de agente:', err);
  }
}

// ============================================
// Endpoints de API
// ============================================

/**
 * POST /api/agentes/solicitar-vinculacion
 * Usuario solicita código para vincular workspace con agente
 */
async function solicitarVinculacion(req, res) {
  try {
    const { workspaceId } = req.body;
    const usuarioId = req.usuario.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es requerido' });
    }

    // Verificar que el usuario tiene permisos sobre el workspace
    const { data: permiso, error: errorPermiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (errorPermiso || !permiso) {
      return res.status(403).json({ error: 'No tienes permisos sobre este workspace' });
    }

    if (!['admin', 'editor'].includes(permiso.rol)) {
      return res.status(403).json({ error: 'Necesitas rol admin o editor para vincular agentes' });
    }

    // Verificar que el workspace existe
    const { data: workspace, error: errorWorkspace } = await supabase
      .from('workspaces')
      .select('id, nombre, agente_id')
      .eq('id', workspaceId)
      .single();

    if (errorWorkspace || !workspace) {
      return res.status(404).json({ error: 'Workspace no encontrado' });
    }

    // Generar código único
    let codigo;
    let intentos = 0;
    do {
      codigo = generarCodigoVinculacion();
      const { data: existente } = await supabase
        .from('codigos_vinculacion')
        .select('id')
        .eq('codigo', codigo)
        .eq('usado', false)
        .single();

      if (!existente) break;
      intentos++;
    } while (intentos < 10);

    if (intentos >= 10) {
      return res.status(500).json({ error: 'No se pudo generar código único' });
    }

    // Invalidar códigos anteriores del mismo usuario/workspace
    await supabase
      .from('codigos_vinculacion')
      .update({ usado: true })
      .eq('usuario_id', usuarioId)
      .eq('workspace_id', workspaceId)
      .eq('usado', false);

    // Crear nuevo código con expiración de 5 minutos
    const expiraAt = new Date(Date.now() + 5 * 60 * 1000);

    // NOTA: agente_id es NULL porque el agente aún no se ha vinculado
    // El código se asociará al agente cuando éste lo use
    const { data: codigoCreado, error: errorCodigo } = await supabase
      .from('codigos_vinculacion')
      .insert({
        codigo,
        agente_id: workspace.agente_id, // Puede ser NULL
        usuario_id: usuarioId,
        workspace_id: workspaceId,
        expira_at: expiraAt.toISOString(),
      })
      .select()
      .single();

    if (errorCodigo) {
      console.error('Error creando código:', errorCodigo);
      return res.status(500).json({ error: 'Error creando código de vinculación' });
    }

    res.json({
      codigo,
      expiraAt: expiraAt.toISOString(),
      workspaceNombre: workspace.nombre,
    });

  } catch (err) {
    console.error('Error en solicitarVinculacion:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/agentes/validar-vinculacion
 * El agente envía código para vincularse al workspace
 * (Llamado internamente desde WebSocket, no directamente por HTTP)
 */
async function validarVinculacion(codigo, agenteId, ip) {
  try {
    // Buscar código válido
    const { data: codigoData, error: errorCodigo } = await supabase
      .from('codigos_vinculacion')
      .select('*, workspaces(id, nombre)')
      .eq('codigo', codigo.toUpperCase())
      .eq('usado', false)
      .single();

    if (errorCodigo || !codigoData) {
      await registrarLogAgente(agenteId, 'vinculacion', ip, { codigo, error: 'Código no encontrado' }, false);
      return { exito: false, error: 'Código inválido o ya usado' };
    }

    // Verificar expiración
    if (new Date(codigoData.expira_at) < new Date()) {
      await registrarLogAgente(agenteId, 'vinculacion', ip, { codigo, error: 'Código expirado' }, false);
      return { exito: false, error: 'Código expirado' };
    }

    // Verificar rate limiting (máximo 5 intentos fallidos)
    if (codigoData.intentos_fallidos >= 5) {
      return { exito: false, error: 'Demasiados intentos fallidos' };
    }

    // Vincular workspace con agente
    const { error: errorUpdate } = await supabase
      .from('workspaces')
      .update({ agente_id: agenteId })
      .eq('id', codigoData.workspace_id);

    if (errorUpdate) {
      console.error('Error vinculando workspace:', errorUpdate);
      return { exito: false, error: 'Error vinculando workspace' };
    }

    // Marcar código como usado
    await supabase
      .from('codigos_vinculacion')
      .update({ usado: true, agente_id: agenteId })
      .eq('id', codigoData.id);

    // Registrar log exitoso
    await registrarLogAgente(agenteId, 'vinculacion', ip, {
      codigo,
      workspace_id: codigoData.workspace_id,
      workspace_nombre: codigoData.workspaces?.nombre,
    }, true);

    return {
      exito: true,
      workspace: {
        id: codigoData.workspace_id,
        nombre: codigoData.workspaces?.nombre,
      },
    };

  } catch (err) {
    console.error('Error en validarVinculacion:', err);
    return { exito: false, error: 'Error interno' };
  }
}

/**
 * GET /api/agentes/estado
 * Obtiene el estado de vinculación del workspace actual
 */
async function obtenerEstadoVinculacion(req, res) {
  try {
    const { workspaceId } = req.query;
    const usuarioId = req.usuario.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es requerido' });
    }

    // Verificar permisos
    const { data: permiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (!permiso) {
      return res.status(403).json({ error: 'No tienes permisos sobre este workspace' });
    }

    // Obtener workspace con agente
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, nombre, agente_id, agentes(id, nombre, activo)')
      .eq('id', workspaceId)
      .single();

    if (error || !workspace) {
      return res.status(404).json({ error: 'Workspace no encontrado' });
    }

    // Verificar si hay código pendiente
    const { data: codigoPendiente } = await supabase
      .from('codigos_vinculacion')
      .select('codigo, expira_at')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .eq('usado', false)
      .gt('expira_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    res.json({
      vinculado: !!workspace.agente_id,
      agente: workspace.agentes ? {
        id: workspace.agentes.id,
        nombre: workspace.agentes.nombre,
        activo: workspace.agentes.activo,
      } : null,
      codigoPendiente: codigoPendiente ? {
        codigo: codigoPendiente.codigo,
        expiraAt: codigoPendiente.expira_at,
      } : null,
    });

  } catch (err) {
    console.error('Error en obtenerEstadoVinculacion:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/agentes/desvincular
 * Desvincula el agente del workspace
 */
async function desvincularAgente(req, res) {
  try {
    const { workspaceId } = req.body;
    const usuarioId = req.usuario.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es requerido' });
    }

    // Verificar permisos (solo admin)
    const { data: permiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (!permiso || permiso.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden desvincular agentes' });
    }

    // Desvincular
    const { error } = await supabase
      .from('workspaces')
      .update({ agente_id: null })
      .eq('id', workspaceId);

    if (error) {
      console.error('Error desvinculando:', error);
      return res.status(500).json({ error: 'Error desvinculando agente' });
    }

    res.json({ exito: true, mensaje: 'Agente desvinculado correctamente' });

  } catch (err) {
    console.error('Error en desvincularAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/agentes/rotar-clave
 * Rota la clave del agente (genera nueva, guarda anterior)
 */
async function rotarClave(req, res) {
  try {
    const { workspaceId } = req.body;
    const usuarioId = req.usuario.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es requerido' });
    }

    // Verificar permisos (solo admin)
    const { data: permiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (!permiso || permiso.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden rotar claves' });
    }

    // Obtener workspace con agente
    const { data: workspace, error: errorWs } = await supabase
      .from('workspaces')
      .select('agente_id, agentes(id, clave_hash)')
      .eq('id', workspaceId)
      .single();

    if (errorWs || !workspace || !workspace.agente_id) {
      return res.status(400).json({ error: 'Workspace no tiene agente vinculado' });
    }

    // Generar nueva clave
    const nuevaClave = generarClaveSecreta();
    const nuevoHash = await bcrypt.hash(nuevaClave, 10);

    // Actualizar agente: mover clave actual a anterior, poner nueva clave
    const { error: errorUpdate } = await supabase
      .from('agentes')
      .update({
        clave_anterior_hash: workspace.agentes.clave_hash,
        clave_hash: nuevoHash,
        clave_rotada_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', workspace.agente_id);

    if (errorUpdate) {
      console.error('Error rotando clave:', errorUpdate);
      return res.status(500).json({ error: 'Error rotando clave' });
    }

    // Registrar log
    await registrarLogAgente(workspace.agente_id, 'rotacion_clave', req.ip, {
      usuario_id: usuarioId,
    }, true);

    // La nueva clave solo se muestra una vez
    res.json({
      exito: true,
      nuevaClave,
      mensaje: 'Clave rotada. La clave anterior será válida por 24 horas.',
    });

  } catch (err) {
    console.error('Error en rotarClave:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  // Funciones para WebSocket
  verificarClaveAgente,
  validarVinculacion,
  registrarLogAgente,
  generarClaveSecreta,

  // Endpoints HTTP
  solicitarVinculacion,
  obtenerEstadoVinculacion,
  desvincularAgente,
  rotarClave,
};
