// src/esquemas/permisos.js
const { z } = require('zod');

const esquemaAgregarPermiso = z.object({
  email: z.string().trim().email('Debe ser un email válido').max(200),
  rol: z.string().trim().min(1, 'El rol es requerido').max(50),
});

const esquemaActualizarPermiso = z.object({
  rol: z.string().trim().min(1, 'El rol es requerido').max(50),
});

module.exports = {
  esquemaAgregarPermiso,
  esquemaActualizarPermiso,
};
