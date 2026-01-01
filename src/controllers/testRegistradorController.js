// src/controllers/testRegistradorController.js
// Controlador para tests de conexión de registradores
// Usa SSE para notificar al agente en tiempo real

const supabase = require('../config/supabase');
const { enviarEventoAgente, agenteConectado, verificarCooldown, registrarTestRealizado } = require('./sseController');

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
 * Envía el comando al agente via SSE en tiempo real
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

    // Verificar que el agente está conectado por SSE
    if (!agenteConectado(agenteId)) {
      return res.status(503).json({
        error: 'El agente no está conectado',
        detalle: 'El agente debe estar en línea para ejecutar tests'
      });
    }

    // Verificar cooldown por IP:puerto (no por agente)
    const puertoNum = parseInt(puerto);
    const cooldown = verificarCooldown(ip, puertoNum);

    if (!cooldown.permitido) {
      return res.status(429).json({
        error: `Debes esperar ${cooldown.esperarSegundos} segundos antes de hacer otro test a ${ip}:${puertoNum}`,
        esperarSegundos: cooldown.esperarSegundos
      });
    }

    // Registrar el cooldown ANTES de crear el test
    registrarTestRealizado(ip, puertoNum);

    // Crear el test pendiente en DB
    const { data: test, error: errorCrear } = await supabase
      .from('test_registrador')
      .insert({
        agente_id: agenteId,
        ip,
        puerto: puertoNum,
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

    // Enviar comando al agente via SSE
    const enviado = enviarEventoAgente(agenteId, 'test-registrador', {
      testId: test.id,
      ip: test.ip,
      puerto: test.puerto,
      unitId: test.unit_id,
      indiceInicial: test.indice_inicial,
      cantidadRegistros: test.cantidad_registros,
    });

    if (!enviado) {
      // El agente se desconectó justo después de verificar
      await supabase
        .from('test_registrador')
        .update({
          estado: 'error',
          error_mensaje: 'El agente se desconectó antes de recibir el comando',
          completado_at: new Date().toISOString()
        })
        .eq('id', test.id);

      return res.status(503).json({
        error: 'No se pudo enviar el comando al agente',
        testId: test.id
      });
    }

    // Actualizar estado a "enviado"
    await supabase
      .from('test_registrador')
      .update({ estado: 'enviado' })
      .eq('id', test.id);

    res.status(201).json({
      testId: test.id,
      mensaje: 'Test enviado al agente. Esperando resultado...',
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

    // Verificar timeout si sigue pendiente o enviado
    if (test.estado === 'pendiente' || test.estado === 'enviado') {
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

    if (test.estado !== 'pendiente' && test.estado !== 'enviado' && test.estado !== 'ejecutando') {
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

/**
 * POST /api/agentes/:agenteId/test-coils
 * Solicita un test de lectura de coils (función Modbus 01)
 * Para leer estados de protecciones que usan direcciones de bits
 */
async function solicitarTestCoils(req, res) {
  try {
    const userId = req.user.id;
    const { agenteId } = req.params;
    const { ip, puerto, unitId, direccionCoil, cantidadBits } = req.body;

    // Verificar permisos
    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede solicitar tests' });
    }

    // Validar campos requeridos
    if (!ip || !puerto || direccionCoil === undefined || !cantidadBits) {
      return res.status(400).json({
        error: 'Campos requeridos: ip, puerto, direccionCoil, cantidadBits'
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

    // Verificar que el agente está conectado por SSE
    if (!agenteConectado(agenteId)) {
      return res.status(503).json({
        error: 'El agente no está conectado',
        detalle: 'El agente debe estar en línea para ejecutar tests'
      });
    }

    // Verificar cooldown por IP:puerto
    const puertoNum = parseInt(puerto);
    const cooldown = verificarCooldown(ip, puertoNum);

    if (!cooldown.permitido) {
      return res.status(429).json({
        error: `Debes esperar ${cooldown.esperarSegundos} segundos antes de hacer otro test a ${ip}:${puertoNum}`,
        esperarSegundos: cooldown.esperarSegundos
      });
    }

    // Registrar el cooldown
    registrarTestRealizado(ip, puertoNum);

    // Crear el test pendiente en DB (reutilizamos la misma tabla pero con tipo_lectura)
    const { data: test, error: errorCrear } = await supabase
      .from('test_registrador')
      .insert({
        agente_id: agenteId,
        ip,
        puerto: puertoNum,
        unit_id: parseInt(unitId) || 1,
        indice_inicial: parseInt(direccionCoil), // Usamos indice_inicial para la dirección de coil
        cantidad_registros: parseInt(cantidadBits), // Usamos cantidad_registros para cantidad de bits
        estado: 'pendiente',
        solicitado_por: userId,
        tipo_lectura: 'coils', // Campo adicional para distinguir el tipo
      })
      .select()
      .single();

    if (errorCrear) {
      console.error('Error creando test coils:', errorCrear);
      return res.status(500).json({ error: 'Error creando test' });
    }

    // Enviar comando al agente via SSE con evento específico para coils
    const enviado = enviarEventoAgente(agenteId, 'test-coils', {
      testId: test.id,
      ip: test.ip,
      puerto: test.puerto,
      unitId: test.unit_id,
      direccionCoil: parseInt(direccionCoil),
      cantidadBits: parseInt(cantidadBits),
    });

    if (!enviado) {
      await supabase
        .from('test_registrador')
        .update({
          estado: 'error',
          error_mensaje: 'El agente se desconectó antes de recibir el comando',
          completado_at: new Date().toISOString()
        })
        .eq('id', test.id);

      return res.status(503).json({
        error: 'No se pudo enviar el comando al agente',
        testId: test.id
      });
    }

    // Actualizar estado a "enviado"
    await supabase
      .from('test_registrador')
      .update({ estado: 'enviado' })
      .eq('id', test.id);

    res.status(201).json({
      testId: test.id,
      mensaje: 'Test de coils enviado al agente. Esperando resultado...',
      timeoutSegundos: TIMEOUT_SEGUNDOS,
    });
  } catch (err) {
    console.error('Error en solicitarTestCoils:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  // Para frontend (superadmin)
  solicitarTest,
  solicitarTestCoils,
  consultarTest,
  // Para agente
  reportarResultadoTest,
};
