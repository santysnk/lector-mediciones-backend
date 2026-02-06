// src/esquemas/plantillasDispositivo.js
const { z } = require('zod');

const esquemaCrearPlantilla = z.object({
  tipo_dispositivo: z.enum(['rele', 'analizador'], {
    errorMap: () => ({ message: 'Tipo inválido. Debe ser: rele o analizador' }),
  }),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  descripcion: z.string().trim().max(500).optional(),
  funcionalidades: z.record(z.unknown()).optional(),
  etiquetas_bits: z.record(z.unknown()).optional(),
  plantilla_etiquetas_id: z.string().uuid().nullable().optional(),
});

const esquemaActualizarPlantilla = z.object({
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100).optional(),
  descripcion: z.string().trim().max(500).optional(),
  funcionalidades: z.record(z.unknown()).optional(),
  etiquetas_bits: z.record(z.unknown()).optional(),
  plantilla_etiquetas_id: z.string().uuid().nullable().optional(),
});

const esquemaMigrarPlantillas = z.object({
  plantillas: z.array(z.record(z.unknown())).min(1, 'Se requiere al menos una plantilla'),
  tipo_dispositivo: z.enum(['rele', 'analizador'], {
    errorMap: () => ({ message: 'Tipo inválido. Debe ser: rele o analizador' }),
  }),
});

module.exports = {
  esquemaCrearPlantilla,
  esquemaActualizarPlantilla,
  esquemaMigrarPlantillas,
};
