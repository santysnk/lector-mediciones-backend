// src/controllers/lecturasController.js
// Controlador para lecturas de Modbus

const supabase = require('../config/supabase');

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
 * Obtiene las últimas lecturas de un registrador
 * GET /api/registradores/:registradorId/lecturas
 *
 * Incluye indice_inicial y cantidad_registros del registrador para que
 * el frontend pueda mapear los valores del array a direcciones Modbus.
 */
async function obtenerUltimasLecturasPorRegistrador(req, res) {
  try {
    const { registradorId } = req.params;
    const { limite = 1 } = req.query;

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
};
