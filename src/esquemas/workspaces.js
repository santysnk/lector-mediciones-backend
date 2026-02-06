// src/esquemas/workspaces.js
const { z } = require('zod');

const esquemaCrearWorkspace = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  descripcion: z.string().trim().max(500).optional(),
});

const esquemaActualizarWorkspace = z.object({
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100).optional(),
  descripcion: z.string().trim().max(500).optional(),
});

module.exports = {
  esquemaCrearWorkspace,
  esquemaActualizarWorkspace,
};
