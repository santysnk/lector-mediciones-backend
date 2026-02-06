// src/esquemas/adminUsuarios.js
const { z } = require('zod');

const esquemaCambiarRolUsuario = z.object({
  rolCodigo: z.enum(['admin', 'operador', 'observador'], {
    errorMap: () => ({ message: 'Rol inválido. Debe ser: admin, operador u observador' }),
  }),
});

const esquemaActualizarAgentesUsuario = z.object({
  accesoTotal: z.boolean(),
  agentesIds: z.array(z.string().uuid('Cada agenteId debe ser un UUID válido')).optional().default([]),
});

module.exports = {
  esquemaCambiarRolUsuario,
  esquemaActualizarAgentesUsuario,
};
