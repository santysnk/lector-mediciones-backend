// src/controllers/testConexionController.js
// Controlador para probar conexiones Modbus a través del agente via WebSocket

const crypto = require('crypto');

// Caché de IPs con conexión exitosa: { ip: timestamp }
const cacheIPsExitosas = new Map();
const CACHE_DURACION_MS = 60 * 1000; // 60 segundos

/**
 * Limpia entradas expiradas del caché
 */
function limpiarCacheExpirado() {
  const ahora = Date.now();
  for (const [ip, timestamp] of cacheIPsExitosas.entries()) {
    if (ahora - timestamp > CACHE_DURACION_MS) {
      cacheIPsExitosas.delete(ip);
    }
  }
}

/**
 * Verifica si una IP está en caché (conexión reciente exitosa)
 */
function ipEnCache(ip) {
  limpiarCacheExpirado();

  if (cacheIPsExitosas.has(ip)) {
    const timestamp = cacheIPsExitosas.get(ip);
    const tiempoRestante = Math.ceil((CACHE_DURACION_MS - (Date.now() - timestamp)) / 1000);
    return { enCache: true, tiempoRestante };
  }

  return { enCache: false, tiempoRestante: 0 };
}

/**
 * Registra una IP exitosa en el caché
 */
function registrarIPExitosa(ip) {
  cacheIPsExitosas.set(ip, Date.now());
}

/**
 * POST /api/test-conexion
 * Prueba la conexión Modbus a un dispositivo via WebSocket al agente
 *
 * Body: { ip, puerto, unitId? }
 *
 * Respuestas:
 * - 200: { exito: true/false, mensaje, tiempoMs }
 * - 200: { cacheado: true, tiempoRestante } si la IP ya fue probada recientemente
 * - 503: { error } si no hay agentes conectados
 */
const testConexion = async (req, res) => {
  const { ip, puerto, unitId, indiceInicial, cantRegistros } = req.body;

  // Validar parámetros
  if (!ip || !puerto) {
    return res.status(400).json({
      exito: false,
      error: 'Se requiere ip y puerto',
    });
  }

  // Verificar si la IP está en caché
  const { enCache, tiempoRestante } = ipEnCache(ip);

  if (enCache) {
    console.log(`[TestConexion] IP ${ip} en caché, ${tiempoRestante}s restantes`);
    return res.json({
      exito: true,
      cacheado: true,
      tiempoRestante,
      mensaje: `Conexión verificada recientemente. Próximo test disponible en ${tiempoRestante}s`,
    });
  }

  try {
    console.log(`[TestConexion] Probando conexión a ${ip}:${puerto} via WebSocket`);

    // Importar la función de envío desde index.js
    const { enviarTestConexion, agentesConectados } = require('../index');

    // Verificar si hay agentes conectados
    if (agentesConectados.size === 0) {
      return res.status(503).json({
        exito: false,
        error: 'No hay agentes conectados. El agente debe estar corriendo y conectado al backend.',
      });
    }

    // Generar ID único para esta solicitud
    const requestId = crypto.randomUUID();

    // Enviar solicitud al agente via WebSocket y esperar respuesta
    const resultado = await enviarTestConexion(requestId, {
      ip,
      puerto: Number(puerto),
      unitId: Number(unitId) || 1,
      indiceInicial: Number(indiceInicial) || 0,
      cantRegistros: Number(cantRegistros) || 10,
    });

    // Si la conexión fue exitosa, registrar en caché
    if (resultado.exito) {
      registrarIPExitosa(ip);
      console.log(`[TestConexion] Conexión exitosa a ${ip}:${puerto}, registrada en caché`);
    } else {
      console.log(`[TestConexion] Conexión fallida a ${ip}:${puerto}: ${resultado.error}`);
    }

    res.json(resultado);
  } catch (error) {
    console.error(`[TestConexion] Error: ${error.message}`);

    res.status(503).json({
      exito: false,
      error: error.message || 'Error comunicando con el agente',
    });
  }
};

/**
 * GET /api/test-conexion/estado
 * Obtiene el estado de los agentes y las IPs en caché
 */
const obtenerEstado = async (req, res) => {
  limpiarCacheExpirado();

  // Importar estado de agentes desde index.js
  const { agentesConectados } = require('../index');

  const ipsEnCache = [];
  for (const [ip, timestamp] of cacheIPsExitosas.entries()) {
    const tiempoRestante = Math.ceil((CACHE_DURACION_MS - (Date.now() - timestamp)) / 1000);
    ipsEnCache.push({ ip, tiempoRestante });
  }

  // Info de agentes conectados
  const agentes = [];
  for (const [socketId, agente] of agentesConectados.entries()) {
    agentes.push({
      socketId,
      agenteId: agente.agenteId,
      configuracionId: agente.configuracionId,
      conectadoEn: agente.conectadoEn,
    });
  }

  res.json({
    agentesConectados: agentes.length,
    agentes,
    ipsEnCache,
    cacheDuracionSegundos: CACHE_DURACION_MS / 1000,
  });
};

module.exports = {
  testConexion,
  obtenerEstado,
};
