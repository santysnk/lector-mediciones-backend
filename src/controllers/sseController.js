// src/controllers/sseController.js
// Controlador para Server-Sent Events (SSE) con agentes

const { verificarTokenAgente } = require('../middleware/authAgente');

// Mapa de agentes conectados: agenteId -> { res, ultimoEvento }
const agentesConectados = new Map();

// Cooldown por IP:puerto - Map de "ip:puerto" -> timestamp último test
const cooldownTests = new Map();
const COOLDOWN_MS = 60000; // 60 segundos

/**
 * GET /api/agente/eventos
 * Endpoint SSE para que el agente reciba eventos en tiempo real
 * Requiere JWT del agente en header Authorization
 */
function conectarSSE(req, res) {
  const agenteId = req.agente?.id;
  const agenteNombre = req.agente?.nombre;

  if (!agenteId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Configurar headers SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Para nginx/proxies
  });

  // Enviar evento inicial de conexión
  res.write(`event: conectado\n`);
  res.write(`data: ${JSON.stringify({ mensaje: 'Conexión SSE establecida', agenteId })}\n\n`);

  // Registrar agente conectado
  agentesConectados.set(agenteId, {
    res,
    nombre: agenteNombre,
    conectadoAt: new Date().toISOString(),
  });

  console.log(`[SSE] Agente conectado: ${agenteNombre} (${agenteId.substring(0, 8)}...) - Total: ${agentesConectados.size}`);

  // Heartbeat cada 30s para mantener conexión viva
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(`event: heartbeat\n`);
      res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    }
  }, 30000);

  // Limpiar al desconectar
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    agentesConectados.delete(agenteId);
    console.log(`[SSE] Agente desconectado: ${agenteNombre} - Total: ${agentesConectados.size}`);
  });

  req.on('error', (err) => {
    clearInterval(heartbeatInterval);
    agentesConectados.delete(agenteId);
    console.log(`[SSE] Error en conexión: ${err.message}`);
  });
}

/**
 * Envía un evento a un agente específico
 * @param {string} agenteId - ID del agente
 * @param {string} evento - Nombre del evento
 * @param {object} datos - Datos del evento
 * @returns {boolean} - true si se envió, false si el agente no está conectado
 */
function enviarEventoAgente(agenteId, evento, datos) {
  const conexion = agentesConectados.get(agenteId);

  if (!conexion || conexion.res.writableEnded) {
    console.log(`[SSE] Agente ${agenteId.substring(0, 8)}... no conectado`);
    return false;
  }

  try {
    conexion.res.write(`event: ${evento}\n`);
    conexion.res.write(`data: ${JSON.stringify(datos)}\n\n`);
    console.log(`[SSE] Evento '${evento}' enviado a ${conexion.nombre}`);
    return true;
  } catch (error) {
    console.error(`[SSE] Error enviando evento: ${error.message}`);
    agentesConectados.delete(agenteId);
    return false;
  }
}

/**
 * Verifica si un agente está conectado por SSE
 */
function agenteConectado(agenteId) {
  const conexion = agentesConectados.get(agenteId);
  return conexion && !conexion.res.writableEnded;
}

/**
 * Verifica cooldown por IP:puerto
 * @returns {object} { permitido: boolean, esperarSegundos: number }
 */
function verificarCooldown(ip, puerto) {
  const clave = `${ip}:${puerto}`;
  const ultimoTest = cooldownTests.get(clave);

  if (!ultimoTest) {
    return { permitido: true, esperarSegundos: 0 };
  }

  const tiempoTranscurrido = Date.now() - ultimoTest;

  if (tiempoTranscurrido >= COOLDOWN_MS) {
    return { permitido: true, esperarSegundos: 0 };
  }

  const esperarMs = COOLDOWN_MS - tiempoTranscurrido;
  return {
    permitido: false,
    esperarSegundos: Math.ceil(esperarMs / 1000)
  };
}

/**
 * Registra un test realizado para el cooldown
 */
function registrarTestRealizado(ip, puerto) {
  const clave = `${ip}:${puerto}`;
  cooldownTests.set(clave, Date.now());

  // Limpiar entradas viejas cada cierto tiempo
  if (cooldownTests.size > 100) {
    const ahora = Date.now();
    for (const [key, timestamp] of cooldownTests) {
      if (ahora - timestamp > COOLDOWN_MS * 2) {
        cooldownTests.delete(key);
      }
    }
  }
}

/**
 * Obtiene estadísticas de conexiones SSE
 */
function obtenerEstadisticas() {
  return {
    agentesConectados: agentesConectados.size,
    agentes: Array.from(agentesConectados.entries()).map(([id, conn]) => ({
      id: id.substring(0, 8) + '...',
      nombre: conn.nombre,
      conectadoAt: conn.conectadoAt,
    })),
  };
}

module.exports = {
  conectarSSE,
  enviarEventoAgente,
  agenteConectado,
  verificarCooldown,
  registrarTestRealizado,
  obtenerEstadisticas,
};
