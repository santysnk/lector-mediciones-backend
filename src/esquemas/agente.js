// src/esquemas/agente.js
const { z } = require('zod');

const esquemaAuth = z.object({
  claveSecreta: z.string().trim().min(1, 'La clave secreta es requerida').max(500),
});

const esquemaHeartbeat = z.object({
  version: z.string().trim().max(50).optional(),
});

const esquemaLectura = z.object({
  registradorId: z.string().uuid('registradorId debe ser un UUID válido'),
  timestamp: z.string().max(100).optional(),
  valores: z.array(z.number()),
  tiempoMs: z.number().int().min(0).optional(),
  exito: z.boolean().optional(),
  error: z.string().max(1000).optional(),
});

const esquemaLecturas = z.object({
  lecturas: z.array(esquemaLectura).min(1, 'Se requiere al menos una lectura'),
});

const esquemaLog = z.object({
  nivel: z.string().trim().max(20).optional(),
  mensaje: z.string().trim().min(1, 'El mensaje es requerido').max(5000),
  metadata: z.record(z.unknown()).optional(),
});

const esquemaVincular = z.object({
  codigo: z.string().trim().min(1, 'El código es requerido').max(20),
});

module.exports = {
  esquemaAuth,
  esquemaHeartbeat,
  esquemaLecturas,
  esquemaLog,
  esquemaVincular,
};
