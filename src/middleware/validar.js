// src/middleware/validar.js
// Middleware genérico de validación con Zod

const { ZodError } = require('zod');

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
      if (error instanceof ZodError) {
        const errores = (error.issues || []).map((e) => ({
          campo: e.path.join('.'),
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
