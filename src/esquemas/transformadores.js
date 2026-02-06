// src/esquemas/transformadores.js
const { z } = require('zod');

const esquemaCrearTransformador = z.object({
  tipo: z.enum(['TI', 'TV', 'REL'], {
    errorMap: () => ({ message: 'Tipo inválido. Debe ser: TI, TV o REL' }),
  }),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  formula: z.string().trim().min(1, 'La fórmula es requerida').max(500),
  descripcion: z.string().trim().max(500).optional(),
});

const esquemaActualizarTransformador = z.object({
  tipo: z.enum(['TI', 'TV', 'REL'], {
    errorMap: () => ({ message: 'Tipo inválido. Debe ser: TI, TV o REL' }),
  }).optional(),
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100).optional(),
  formula: z.string().trim().min(1, 'La fórmula no puede estar vacía').max(500).optional(),
  descripcion: z.string().trim().max(500).optional(),
});

const esquemaMigrarTransformadores = z.object({
  transformadores: z.array(z.object({
    tipo: z.enum(['TI', 'TV', 'REL']),
    nombre: z.string().trim().min(1).max(100),
    formula: z.string().trim().min(1).max(500),
    descripcion: z.string().trim().max(500).optional(),
  })).min(1, 'Se requiere al menos un transformador'),
});

module.exports = {
  esquemaCrearTransformador,
  esquemaActualizarTransformador,
  esquemaMigrarTransformadores,
};
