// src/controllers/lecturasController.js
// Controlador para lecturas de Modbus

const supabase = require('../config/supabase');

/**
 * Helper: Obtiene los IDs de agentes a los que el usuario tiene acceso
 * @returns {null} si tiene acceso total (sin filtro)
 * @returns {string[]} array de IDs de agentes permitidos
 * @returns {[]} array vacío si no tiene permisos configurados
 */
async function obtenerAgentesPermitidos(usuarioId) {
  console.log('[Permisos] Verificando permisos para usuario:', usuarioId);

  if (!usuarioId) {
    console.log('[Permisos] ERROR: usuarioId es undefined o null');
    return [];
  }

  // Primero verificar si es superadmin (tiene acceso a todo)
  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('rol_id, roles (codigo)')
    .eq('id', usuarioId)
    .single();

  console.log('[Permisos] Resultado consulta usuario:', JSON.stringify({ usuario, errorUsuario }, null, 2));

  if (errorUsuario) {
    console.log('[Permisos] Error buscando usuario en BD:', errorUsuario.message);
    return [];
  }

  if (!usuario) {
    console.log('[Permisos] Usuario no encontrado en tabla usuarios');
    return [];
  }

  console.log('[Permisos] Usuario encontrado - rol_id:', usuario.rol_id, 'roles:', usuario.roles);

  if (usuario?.roles?.codigo === 'superadmin') {
    console.log('[Permisos] Usuario es superadmin, acceso total');
    return null; // Acceso total
  }

  // Obtener permisos de agentes del usuario
  const { data: permisos } = await supabase
    .from('usuario_agentes')
    .select('agente_id, acceso_total')
    .eq('usuario_id', usuarioId);

  if (!permisos || permisos.length === 0) {
    return []; // Sin permisos configurados
  }

  // Si tiene acceso total, retornar null (sin filtro)
  if (permisos.some(p => p.acceso_total)) {
    return null;
  }

  // Retornar array de IDs de agentes específicos
  return permisos.filter(p => p.agente_id).map(p => p.agente_id);
}

/**
 * Helper: Verifica si el usuario tiene acceso a un registrador específico
 *
 * El acceso puede ser:
 * 1. DIRECTO: usuario tiene permisos en usuario_agentes (acceso_total o agente específico)
 * 2. TRANSITIVO: usuario es invitado a un workspace que tiene vinculado el agente del registrador
 *    (usuario_workspaces → workspace → workspace_agentes → agente → registrador)
 */
async function tieneAccesoARegistrador(usuarioId, registradorId) {
  console.log('[tieneAccesoARegistrador] Verificando acceso - usuarioId:', usuarioId, 'registradorId:', registradorId);

  // Primero obtener el agente del registrador (lo necesitamos para ambas verificaciones)
  const { data: registrador, error: errorReg } = await supabase
    .from('registradores')
    .select('agente_id')
    .eq('id', registradorId)
    .single();

  console.log('[tieneAccesoARegistrador] Registrador encontrado:', registrador, 'error:', errorReg);

  if (!registrador) {
    console.log('[tieneAccesoARegistrador] Registrador no encontrado, denegando acceso');
    return false;
  }

  const agenteId = registrador.agente_id;
  console.log('[tieneAccesoARegistrador] Agente del registrador:', agenteId);

  // 1. Verificar acceso DIRECTO (permisos en usuario_agentes)
  const agentesPermitidos = await obtenerAgentesPermitidos(usuarioId);
  console.log('[tieneAccesoARegistrador] Agentes permitidos:', agentesPermitidos);

  // Acceso total directo
  if (agentesPermitidos === null) {
    console.log('[tieneAccesoARegistrador] Usuario tiene acceso total (superadmin o acceso_total)');
    return true;
  }

  // Acceso directo a este agente específico
  if (agentesPermitidos.length > 0 && agentesPermitidos.includes(agenteId)) {
    return true;
  }

  // 2. Verificar acceso TRANSITIVO (vía workspace compartido)
  // El usuario tiene acceso si pertenece a algún workspace que tiene vinculado este agente
  const { data: accesoTransitivo, error } = await supabase
    .from('usuario_workspaces')
    .select(`
      workspace_id,
      workspaces!inner (
        workspace_agentes!inner (
          agente_id
        )
      )
    `)
    .eq('usuario_id', usuarioId)
    .eq('workspaces.workspace_agentes.agente_id', agenteId)
    .limit(1);

  if (error) {
    console.error('Error verificando acceso transitivo:', error);
    return false;
  }

  // Si encontró al menos un workspace donde el usuario tiene acceso y el agente está vinculado
  return accesoTransitivo && accesoTransitivo.length > 0;
}

/**
 * Obtiene las últimas lecturas de un alimentador
 * GET /api/alimentadores/:alimentadorId/lecturas
 */
async function obtenerUltimasLecturas(req, res) {
  try {
    const { alimentadorId } = req.params;
    const { tipo, limite = 1 } = req.query;

    let query = supabase
      .from('lecturas')
      .select('*')
      .eq('alimentador_id', alimentadorId)
      .order('timestamp', { ascending: false })
      .limit(parseInt(limite));

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error obteniendo lecturas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Obtiene lecturas históricas de un alimentador
 * GET /api/alimentadores/:alimentadorId/lecturas/historico
 */
async function obtenerLecturasHistoricas(req, res) {
  try {
    const { alimentadorId } = req.params;
    const { desde, hasta, tipo } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Se requieren parámetros desde y hasta' });
    }

    let query = supabase
      .from('lecturas')
      .select('*')
      .eq('alimentador_id', alimentadorId)
      .gte('timestamp', desde)
      .lte('timestamp', hasta)
      .order('timestamp', { ascending: true });

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error obteniendo lecturas históricas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Obtiene la última lectura de todos los alimentadores de un workspace
 * GET /api/workspaces/:workspaceId/lecturas/ultima
 */
async function obtenerUltimaLecturaPorWorkspace(req, res) {
  try {
    const { workspaceId } = req.params;
    const { tipo } = req.query;

    // Primero obtener los puestos del workspace
    const { data: puestos, error: errorPuestos } = await supabase
      .from('puestos')
      .select('id')
      .eq('workspace_id', workspaceId);

    if (errorPuestos) {
      return res.status(500).json({ error: errorPuestos.message });
    }

    if (!puestos || puestos.length === 0) {
      return res.json({});
    }

    // Obtener alimentadores de esos puestos
    const puestoIds = puestos.map(p => p.id);
    const { data: alimentadores, error: errorAlim } = await supabase
      .from('alimentadores')
      .select('id')
      .in('puesto_id', puestoIds);

    if (errorAlim) {
      return res.status(500).json({ error: errorAlim.message });
    }

    if (!alimentadores || alimentadores.length === 0) {
      return res.json({});
    }

    // Para cada alimentador, obtener la última lectura
    const alimentadorIds = alimentadores.map(a => a.id);
    const resultado = {};

    for (const alimId of alimentadorIds) {
      let query = supabase
        .from('lecturas')
        .select('*')
        .eq('alimentador_id', alimId)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (tipo) {
        query = query.eq('tipo', tipo);
      }

      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        resultado[alimId] = data[0];
      }
    }

    res.json(resultado);
  } catch (error) {
    console.error('Error obteniendo últimas lecturas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Obtiene lecturas históricas de un registrador en un rango de tiempo
 * GET /api/registradores/:registradorId/lecturas/historico
 *
 * Query params:
 *   - desde: fecha ISO inicio del rango
 *   - hasta: fecha ISO fin del rango
 *
 * Incluye indice_inicial para que el frontend pueda mapear valores a direcciones Modbus.
 *
 * NOTA: Supabase tiene límite de 1000 registros por consulta por defecto.
 * Este endpoint pagina automáticamente para obtener TODOS los datos del rango.
 */
async function obtenerLecturasHistoricasPorRegistrador(req, res) {
  try {
    const { registradorId } = req.params;
    const { desde, hasta } = req.query;
    const usuarioId = req.user?.id;

    // Verificar permisos de acceso al registrador (directo o transitivo vía workspace)
    if (usuarioId) {
      const tieneAcceso = await tieneAccesoARegistrador(usuarioId, registradorId);
      if (!tieneAcceso) {
        return res.status(403).json({ error: 'No tiene permiso para ver lecturas históricas de este registrador' });
      }
    }

    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Se requieren parámetros desde y hasta' });
    }

    // Obtener el indice_inicial del registrador
    const { data: registrador, error: errorReg } = await supabase
      .from('registradores')
      .select('indice_inicial, cantidad_registros')
      .eq('id', registradorId)
      .single();

    if (errorReg) {
      console.error('Error obteniendo registrador:', errorReg);
      // Continuar sin el indice_inicial si hay error
    }

    // Obtener TODAS las lecturas paginando (Supabase límite 1000 por consulta)
    const PAGE_SIZE = 1000;
    let allData = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('lecturas')
        .select('*')
        .eq('registrador_id', registradorId)
        .gte('timestamp', desde)
        .lte('timestamp', hasta)
        .order('timestamp', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      if (data && data.length > 0) {
        allData = allData.concat(data);
        offset += PAGE_SIZE;
        // Si recibimos menos de PAGE_SIZE, no hay más datos
        hasMore = data.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log(`[Lecturas] Registrador ${registradorId}: ${allData.length} lecturas entre ${desde} y ${hasta}`);

    // Agregar indice_inicial del registrador a cada lectura
    const lecturasConIndice = allData.map(lectura => ({
      ...lectura,
      indice_inicial: registrador?.indice_inicial ?? 0,
      cantidad_registros: registrador?.cantidad_registros ?? (lectura.valores?.length || 0),
    }));

    res.json(lecturasConIndice);
  } catch (error) {
    console.error('Error obteniendo lecturas históricas por registrador:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Obtiene las últimas lecturas de un registrador
 * GET /api/registradores/:registradorId/lecturas
 *
 * Incluye indice_inicial y cantidad_registros del registrador para que
 * el frontend pueda mapear los valores del array a direcciones Modbus.
 *
 * NOTA: Filtra según los permisos del usuario (tabla usuario_agentes)
 */
async function obtenerUltimasLecturasPorRegistrador(req, res) {
  try {
    const { registradorId } = req.params;
    const { limite = 1 } = req.query;
    const usuarioId = req.user?.id;

    console.log('[Lecturas] obtenerUltimasLecturasPorRegistrador - registradorId:', registradorId, 'usuarioId:', usuarioId);
    console.log('[Lecturas] req.user completo:', JSON.stringify(req.user, null, 2));

    // Verificar permisos de acceso al registrador
    if (usuarioId) {
      const tieneAcceso = await tieneAccesoARegistrador(usuarioId, registradorId);
      console.log('[Lecturas] Resultado tieneAcceso:', tieneAcceso);
      if (!tieneAcceso) {
        console.log('[Lecturas] DENEGADO - Usuario no tiene acceso al registrador');
        return res.status(403).json({ error: 'No tiene permiso para ver lecturas de este registrador' });
      }
    } else {
      console.log('[Lecturas] WARNING: usuarioId es undefined, saltando verificación de permisos');
    }

    // Primero obtener el indice_inicial del registrador
    const { data: registrador, error: errorReg } = await supabase
      .from('registradores')
      .select('indice_inicial, cantidad_registros')
      .eq('id', registradorId)
      .single();

    if (errorReg) {
      console.error('Error obteniendo registrador:', errorReg);
      // Continuar sin el indice_inicial si hay error
    }

    // Obtener las lecturas
    const { data, error } = await supabase
      .from('lecturas')
      .select('*')
      .eq('registrador_id', registradorId)
      .order('timestamp', { ascending: false })
      .limit(parseInt(limite));

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Agregar indice_inicial del registrador a cada lectura
    // Esto permite al frontend mapear valores[0] a la dirección correcta
    const lecturasConIndice = data.map(lectura => ({
      ...lectura,
      indice_inicial: registrador?.indice_inicial ?? 0,
      cantidad_registros: registrador?.cantidad_registros ?? (lectura.valores?.length || 0),
    }));

    res.json(lecturasConIndice);
  } catch (error) {
    console.error('Error obteniendo lecturas por registrador:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  obtenerUltimasLecturas,
  obtenerLecturasHistoricas,
  obtenerUltimaLecturaPorWorkspace,
  obtenerUltimasLecturasPorRegistrador,
  obtenerLecturasHistoricasPorRegistrador,
};
