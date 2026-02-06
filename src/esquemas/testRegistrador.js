// src/esquemas/testRegistrador.js
const { z } = require('zod');

const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

const esquemaSolicitarTest = z.object({
  ip: z.string().trim().regex(ipv4Regex, 'Debe ser una dirección IPv4 válida'),
  puerto: z.number().int().min(1).max(65535),
  unitId: z.number().int().min(0).max(255).optional(),
  indiceInicial: z.number().int().min(0).max(65535),
  cantidadRegistros: z.number().int().min(1).max(125),
});

const esquemaSolicitarTestCoils = z.object({
  ip: z.string().trim().regex(ipv4Regex, 'Debe ser una dirección IPv4 válida'),
  puerto: z.number().int().min(1).max(65535),
  unitId: z.number().int().min(0).max(255).optional(),
  direccionCoil: z.number().int().min(0).max(65535),
  cantidadBits: z.number().int().min(1).max(2000),
});

const esquemaReportarResultadoTest = z.object({
  exito: z.boolean(),
  tiempoRespuestaMs: z.number().min(0).optional(),
  valores: z.array(z.number()).optional(),
  coils: z.array(z.object({
    direccion: z.number().int().min(0),
    valor: z.union([z.boolean(), z.number()]),
  })).optional(),
  errorMensaje: z.string().max(1000).optional(),
});

module.exports = {
  esquemaSolicitarTest,
  esquemaSolicitarTestCoils,
  esquemaReportarResultadoTest,
};
