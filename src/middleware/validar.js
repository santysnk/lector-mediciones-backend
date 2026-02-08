// src/middleware/validar.js
// Middleware genérico de validación con Zod

/**
 * Crea un middleware que valida req.body contra un esquema Zod
 * @param {import('zod').ZodSchema} esquema - Esquema Zod a validar
 * @returns {import('express').RequestHandler}
 */
function validar(esquema) {
  return (req, res, next) => {
    try {
      req.body = esquema.parse(req.body);
      next();
    } catch (error) {
      // Detectar errores de validación Zod por la presencia de .issues
      // (compatible con Zod v3 y v4, donde la clase de error cambió)
      if (error && Array.isArray(error.issues)) {
        const errores = error.issues.map((e) => ({
          campo: (e.path || []).join('.'),
          mensaje: e.message,
        }));
        return res.status(400).json({
          error: 'Datos de entrada inválidos',
          detalles: errores,
        });
      }
      next(error);
    }
  };
}

module.exports = { validar };
