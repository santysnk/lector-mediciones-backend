// src/esquemas/alimentadores.js
const { z } = require('zod');

const esquemaCrearAlimentador = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  color: z.string().trim().max(20).optional(),
  orden: z.number().int().min(0).optional(),
  registrador_id: z.string().uuid().nullable().optional(),
  intervalo_consulta_ms: z.number().int().min(1000).max(60000).optional(),
  card_design: z.record(z.string(), z.unknown()).optional(),
  gap_horizontal: z.number().min(0).optional(),
  config_tarjeta: z.record(z.string(), z.unknown()).nullable().optional(),
});

const esquemaActualizarAlimentador = z.object({
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100).optional(),
  color: z.string().trim().max(20).optional(),
  orden: z.number().int().min(0).optional(),
  registrador_id: z.string().uuid().nullable().optional(),
  intervalo_consulta_ms: z.number().int().min(1000).max(60000).optional(),
  card_design: z.record(z.string(), z.unknown()).optional(),
  gap_horizontal: z.number().min(0).optional(),
  escala: z.number().min(0.1).max(10).optional(),
  config_tarjeta: z.record(z.string(), z.unknown()).optional(),
});

const esquemaReordenarAlimentadores = z.object({
  ordenes: z.array(z.object({
    id: z.string().uuid('id debe ser un UUID válido'),
    orden: z.number().int().min(0),
  })).min(1, 'Se requiere al menos un elemento'),
});

const esquemaMoverAlimentador = z.object({
  nuevo_puesto_id: z.string().uuid('nuevo_puesto_id debe ser un UUID válido'),
  orden: z.number().int().min(0).optional(),
});

module.exports = {
  esquemaCrearAlimentador,
  esquemaActualizarAlimentador,
  esquemaReordenarAlimentadores,
  esquemaMoverAlimentador,
};
