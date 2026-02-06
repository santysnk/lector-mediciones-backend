// src/middleware/rateLimiter.js
// Rate limiter in-memory para endpoints del agente

/** @type {Map<string, { count: number, windowStart: number }>} */
const almacen = new Map();

const VENTANA_MS = 60 * 1000; // 60 segundos
const LIMPIEZA_MS = 5 * 60 * 1000; // 5 minutos

// Limpiar entries viejas cada 5 minutos para evitar memory leak
setInterval(() => {
  const ahora = Date.now();
  for (const [clave, valor] of almacen) {
    if (ahora - valor.windowStart > VENTANA_MS * 2) {
      almacen.delete(clave);
    }
  }
}, LIMPIEZA_MS);

/**
 * Crea un middleware de rate limiting por IP
 * @param {number} maxRequests - Máximo de requests permitidos por ventana
 * @returns {import('express').RequestHandler}
 */
function crearRateLimiter(maxRequests) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const ruta = req.originalUrl || req.url;
    const clave = `${ip}:${ruta}`;
    const ahora = Date.now();

    const registro = almacen.get(clave);

    if (!registro || (ahora - registro.windowStart > VENTANA_MS)) {
      // Nueva ventana
      almacen.set(clave, { count: 1, windowStart: ahora });
      return next();
    }

    registro.count++;

    if (registro.count > maxRequests) {
      const segundosRestantes = Math.ceil((VENTANA_MS - (ahora - registro.windowStart)) / 1000);

      console.warn(
        `[RateLimit] IP bloqueada: ${ip} en ${ruta} (${registro.count} requests en ${Math.round((ahora - registro.windowStart) / 1000)}s)`
      );

      res.set('Retry-After', String(segundosRestantes));
      return res.status(429).json({
        error: 'Demasiadas solicitudes',
        retryAfter: segundosRestantes,
      });
    }

    next();
  };
}

const rateLimitAuth = crearRateLimiter(10);
const rateLimitAgente = crearRateLimiter(120);
const rateLimitPing = crearRateLimiter(30);

module.exports = { rateLimitAuth, rateLimitAgente, rateLimitPing };
