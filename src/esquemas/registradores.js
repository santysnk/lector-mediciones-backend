// src/esquemas/registradores.js
const { z } = require('zod');

const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

const esquemaCrearRegistrador = z.object({
  workspaceId: z.string().uuid('workspaceId debe ser un UUID válido'),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  tipo: z.string().trim().max(50).optional(),
  ubicacion: z.string().trim().max(200).optional(),
  ip: z.string().trim().regex(ipv4Regex, 'Debe ser una dirección IPv4 válida'),
  puerto: z.number().int().min(1).max(65535),
  indiceInicial: z.number().int().min(0).max(65535),
  cantidadRegistros: z.number().int().min(1).max(125),
  intervaloSegundos: z.number().int().min(1).max(3600).optional(),
});

const esquemaActualizarRegistrador = z.object({
  workspaceId: z.string().uuid('workspaceId debe ser un UUID válido'),
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100).optional(),
  tipo: z.string().trim().max(50).optional(),
  ubicacion: z.string().trim().max(200).optional(),
  ip: z.string().trim().regex(ipv4Regex, 'Debe ser una dirección IPv4 válida').optional(),
  puerto: z.number().int().min(1).max(65535).optional(),
  intervaloSegundos: z.number().int().min(1).max(3600).optional(),
});

const esquemaToggleActivo = z.object({
  workspaceId: z.string().uuid('workspaceId debe ser un UUID válido'),
  activo: z.boolean(),
});

module.exports = {
  esquemaCrearRegistrador,
  esquemaActualizarRegistrador,
  esquemaToggleActivo,
};
