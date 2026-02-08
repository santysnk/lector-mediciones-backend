// src/esquemas/preferencias.js
const { z } = require('zod');

const esquemaGuardarPreferencias = z.object({
  preferencias: z.record(z.string(), z.unknown()),
});

const esquemaActualizarPreferencias = z.object({
  preferencias: z.record(z.string(), z.unknown()),
});

module.exports = {
  esquemaGuardarPreferencias,
  esquemaActualizarPreferencias,
};
