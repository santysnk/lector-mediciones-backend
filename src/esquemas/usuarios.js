// src/esquemas/usuarios.js
const { z } = require('zod');

const esquemaCrearPerfil = z.object({
  nombre: z.string().trim().max(100).optional(),
});

const esquemaActualizarWorkspaceDefault = z.object({
  workspaceId: z.string().uuid('workspaceId debe ser un UUID válido').nullable().optional(),
});

module.exports = {
  esquemaCrearPerfil,
  esquemaActualizarWorkspaceDefault,
};
