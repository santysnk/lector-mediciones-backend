// src/esquemas/puestos.js
const { z } = require('zod');

const esquemaCrearPuesto = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  descripcion: z.string().trim().max(500).optional(),
  orden: z.number().int().min(0).optional(),
  color: z.string().trim().max(20).optional(),
  bg_color: z.string().trim().max(20).optional(),
});

const esquemaActualizarPuesto = z.object({
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100).optional(),
  descripcion: z.string().trim().max(500).optional(),
  orden: z.number().int().min(0).optional(),
  color: z.string().trim().max(20).optional(),
  bg_color: z.string().trim().max(20).optional(),
  gaps_verticales: z.number().min(0).optional(),
  escala: z.number().min(0.1).max(10).optional(),
});

const esquemaReordenarPuestos = z.object({
  ordenes: z.array(z.object({
    id: z.string().uuid('id debe ser un UUID válido'),
    orden: z.number().int().min(0),
  })).min(1, 'Se requiere al menos un elemento'),
});

module.exports = {
  esquemaCrearPuesto,
  esquemaActualizarPuesto,
  esquemaReordenarPuestos,
};
