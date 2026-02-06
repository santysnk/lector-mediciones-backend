// src/esquemas/agentesLegacy.js
const { z } = require('zod');

const esquemaSolicitarVinculacion = z.object({
  workspaceId: z.string().uuid('workspaceId debe ser un UUID válido'),
});

const esquemaDesvincularAgente = z.object({
  workspaceId: z.string().uuid('workspaceId debe ser un UUID válido'),
});

const esquemaRotarClave = z.object({
  workspaceId: z.string().uuid('workspaceId debe ser un UUID válido'),
});

module.exports = {
  esquemaSolicitarVinculacion,
  esquemaDesvincularAgente,
  esquemaRotarClave,
};
