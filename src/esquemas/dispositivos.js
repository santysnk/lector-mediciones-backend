// src/esquemas/dispositivos.js
const { z } = require('zod');

const esquemaRegistrarDispositivo = z.object({
  fcmToken: z.string().trim().min(1, 'El token FCM es requerido').max(500),
  plataforma: z.string().trim().max(20).optional(),
});

module.exports = {
  esquemaRegistrarDispositivo,
};
