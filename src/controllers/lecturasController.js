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
 * Obtiene la última lectura de todos los alimentadores de una configuración
 * GET /api/configuraciones/:configuracionId/lecturas/ultima
 */
async function obtenerUltimaLecturaPorConfiguracion(req, res) {
  try {
    const { configuracionId } = req.params;
    const { tipo } = req.query;

    // Primero obtener los puestos de la configuración
    const { data: puestos, error: errorPuestos } = await supabase
      .from('puestos')
      .select('id')
      .eq('configuracion_id', configuracionId);

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

module.exports = {
  obtenerUltimasLecturas,
  obtenerLecturasHistoricas,
  obtenerUltimaLecturaPorConfiguracion,
};
