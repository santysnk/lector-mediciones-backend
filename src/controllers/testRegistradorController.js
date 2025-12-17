// src/controllers/testRegistradorController.js
// Controlador para tests de conexión de registradores

const supabase = require('../config/supabase');

const COOLDOWN_SEGUNDOS = 60; // Tiempo mínimo entre tests del mismo agente
const TIMEOUT_SEGUNDOS = 30; // Tiempo máximo de espera para resultado

/**
 * Verifica si el usuario es superadmin
 */
async function esSuperadmin(userId) {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol_id, roles (codigo)')
    .eq('id', userId)
    .single();

  return usuario?.roles?.codigo === 'superadmin';
}

/**
 * POST /api/agentes/:agenteId/test-registrador
 * Solicita un test de conexión para un registrador (solo superadmin)
 */
async function solicitarTest(req, res) {
  try {
    const userId = req.user.id;
    const { agenteId } = req.params;
    const { ip, puerto, unitId, indiceInicial, cantidadRegistros } = req.body;

    // Verificar permisos
    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede solicitar tests' });
    }

    // Validar campos requeridos
    if (!ip || !puerto || indiceInicial === undefined || !cantidadRegistros) {
      return res.status(400).json({
        error: 'Campos requeridos: ip, puerto, indiceInicial, cantidadRegistros'
      });
    }

    // Verificar que el agente existe
    const { data: agente, error: errorAgente } = await supabase
      .from('agentes')
      .select('id, nombre, activo')
      .eq('id', agenteId)
      .single();

    if (errorAgente || !agente) {
      return res.status(404).json({ error: 'Agente no encontrado' });
    }

    // Verificar cooldown - buscar último test de este agente
    const { data: testReciente } = await supabase
      .from('test_registrador')
      .select('id, created_at')
      .eq('agente_id', agenteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (testReciente) {
      const tiempoDesdeUltimo = (Date.now() - new Date(testReciente.created_at).getTime()) / 1000;
      if (tiempoDesdeUltimo < COOLDOWN_SEGUNDOS) {
        const esperarSegundos = Math.ceil(COOLDOWN_SEGUNDOS - tiempoDesdeUltimo);
        return res.status(429).json({
          error: `Debes esperar ${esperarSegundos} segundos antes de hacer otro test`,
          esperarSegundos
        });
      }
    }

    // Crear el test pendiente
    const { data: test, error: errorCrear } = await supabase
      .from('test_registrador')
      .insert({
        agente_id: agenteId,
        ip,
        puerto: parseInt(puerto),
        unit_id: parseInt(unitId) || 1,
        indice_inicial: parseInt(indiceInicial),
        cantidad_registros: parseInt(cantidadRegistros),
        estado: 'pendiente',
        solicitado_por: userId,
      })
      .select()
      .single();

    if (errorCrear) {
      console.error('Error creando test:', errorCrear);
      return res.status(500).json({ error: 'Error creando test' });
    }

    res.status(201).json({
      testId: test.id,
      mensaje: 'Test solicitado. Esperando respuesta del agente...',
      timeoutSegundos: TIMEOUT_SEGUNDOS,
    });
  } catch (err) {
    console.error('Error en solicitarTest:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/agentes/:agenteId/test-registrador/:testId
 * Consulta el estado/resultado de un test (solo superadmin)
 */
async function consultarTest(req, res) {
  try {
    const userId = req.user.id;
    const { agenteId, testId } = req.params;

    // Verificar permisos
    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede consultar tests' });
    }

    // Obtener el test
    const { data: test, error } = await supabase
      .from('test_registrador')
      .select('*')
      .eq('id', testId)
      .eq('agente_id', agenteId)
      .single();

    if (error || !test) {
      return res.status(404).json({ error: 'Test no encontrado' });
    }

    // Verificar timeout si sigue pendiente
    if (test.estado === 'pendiente') {
      const tiempoEsperando = (Date.now() - new Date(test.created_at).getTime()) / 1000;
      if (tiempoEsperando > TIMEOUT_SEGUNDOS) {
        // Marcar como timeout
        await supabase
          .from('test_registrador')
          .update({
            estado: 'timeout',
            error_mensaje: 'El agente no respondió a tiempo',
            completado_at: new Date().toISOString()
          })
          .eq('id', testId);

        return res.json({
          ...test,
          estado: 'timeout',
          error_mensaje: 'El agente no respondió a tiempo',
        });
      }
    }

    res.json(test);
  } catch (err) {
    console.error('Error en consultarTest:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// Endpoints para el AGENTE
// ============================================

/**
 * GET /api/agente/tests-pendientes
 * El agente consulta si tiene tests pendientes (autenticado con JWT de agente)
 */
async function obtenerTestsPendientes(req, res) {
  try {
    const agenteId = req.agente.id;

    const { data: tests, error } = await supabase
      .from('test_registrador')
      .select('*')
      .eq('agente_id', agenteId)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error obteniendo tests pendientes:', error);
      return res.status(500).json({ error: 'Error obteniendo tests' });
    }

    res.json(tests || []);
  } catch (err) {
    console.error('Error en obtenerTestsPendientes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/agente/tests/:testId/resultado
 * El agente reporta el resultado de un test (autenticado con JWT de agente)
 */
async function reportarResultadoTest(req, res) {
  try {
    const agenteId = req.agente.id;
    const { testId } = req.params;
    const { exito, tiempoRespuestaMs, valores, errorMensaje } = req.body;

    // Verificar que el test pertenece a este agente
    const { data: test, error: errorTest } = await supabase
      .from('test_registrador')
      .select('id, estado')
      .eq('id', testId)
      .eq('agente_id', agenteId)
      .single();

    if (errorTest || !test) {
      return res.status(404).json({ error: 'Test no encontrado' });
    }

    if (test.estado !== 'pendiente' && test.estado !== 'ejecutando') {
      return res.status(400).json({ error: 'Este test ya fue procesado' });
    }

    // Actualizar con el resultado
    const updateData = {
      estado: exito ? 'completado' : 'error',
      tiempo_respuesta_ms: tiempoRespuestaMs || null,
      valores: exito ? valores : null,
      error_mensaje: exito ? null : errorMensaje,
      completado_at: new Date().toISOString(),
    };

    const { error: errorUpdate } = await supabase
      .from('test_registrador')
      .update(updateData)
      .eq('id', testId);

    if (errorUpdate) {
      console.error('Error actualizando test:', errorUpdate);
      return res.status(500).json({ error: 'Error guardando resultado' });
    }

    res.json({ mensaje: 'Resultado registrado correctamente' });
  } catch (err) {
    console.error('Error en reportarResultadoTest:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  // Para frontend (superadmin)
  solicitarTest,
  consultarTest,
  // Para agente
  obtenerTestsPendientes,
  reportarResultadoTest,
};
