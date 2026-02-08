// src/esquemas/adminAgentes.js
const { z } = require('zod');

const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

const esquemaCrearAgente = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  descripcion: z.string().trim().max(500).optional(),
});

const esquemaActualizarAgente = z.object({
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100).optional(),
  descripcion: z.string().trim().max(500).optional(),
  activo: z.boolean().optional(),
});

const esquemaVincularAgenteWorkspace = z.object({
  agenteId: z.string().uuid('agenteId debe ser un UUID válido'),
});

const esquemaCrearRegistradorAgente = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  tipo: z.string().trim().max(50).optional(),
  ip: z.string().trim().regex(ipv4Regex, 'Debe ser una dirección IPv4 válida'),
  puerto: z.number().int().min(1).max(65535),
  unitId: z.number().int().min(0).max(255).optional(),
  indiceInicial: z.number().int().min(0).max(65535),
  cantidadRegistros: z.number().int().min(1).max(125),
  intervaloSegundos: z.number().int().min(1).max(3600).optional(),
  alimentadorId: z.string().uuid().nullable().optional(),
  tipoDispositivo: z.string().trim().max(50).optional(),
  plantillaId: z.string().uuid().nullable().optional(),
  configuracionRele: z.record(z.string(), z.unknown()).optional(),
});

const esquemaActualizarRegistradorAgente = z.object({
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100).optional(),
  tipo: z.string().trim().max(50).optional(),
  ip: z.string().trim().regex(ipv4Regex, 'Debe ser una dirección IPv4 válida').optional(),
  puerto: z.number().int().min(1).max(65535).optional(),
  unitId: z.number().int().min(0).max(255).optional(),
  indiceInicial: z.number().int().min(0).max(65535).optional(),
  cantidadRegistros: z.number().int().min(1).max(125).optional(),
  intervaloSegundos: z.number().int().min(1).max(3600).optional(),
  activo: z.boolean().optional(),
  alimentadorId: z.string().uuid().nullable().optional(),
  tipoDispositivo: z.string().trim().max(50).optional(),
  plantillaId: z.string().uuid().nullable().optional(),
  configuracionRele: z.record(z.string(), z.unknown()).optional(),
});

module.exports = {
  esquemaCrearAgente,
  esquemaActualizarAgente,
  esquemaVincularAgenteWorkspace,
  esquemaCrearRegistradorAgente,
  esquemaActualizarRegistradorAgente,
};
