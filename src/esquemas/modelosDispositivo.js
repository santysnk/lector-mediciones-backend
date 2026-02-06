// src/esquemas/modelosDispositivo.js
const { z } = require('zod');

const esquemaCrearModelo = z.object({
  id: z.string().trim().min(1, 'El id es requerido').max(50),
  tipo_dispositivo: z.enum(['rele', 'analizador'], {
    errorMap: () => ({ message: 'Tipo inválido. Debe ser: rele o analizador' }),
  }),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  fabricante: z.string().trim().min(1, 'El fabricante es requerido').max(100),
  familia: z.string().trim().max(100).optional(),
  descripcion: z.string().trim().max(500).optional(),
  icono: z.string().trim().max(100).optional(),
  capacidades: z.record(z.unknown()).optional(),
});

const esquemaCrearConfiguracion = z.object({
  id: z.string().trim().min(1, 'El id es requerido').max(50),
  modelo_id: z.string().trim().min(1, 'El modelo_id es requerido'),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  descripcion: z.string().trim().max(500).optional(),
  capacidades: z.record(z.unknown()).optional(),
  protecciones: z.array(z.record(z.unknown())).optional(),
});

module.exports = {
  esquemaCrearModelo,
  esquemaCrearConfiguracion,
};
