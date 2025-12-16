// src/middleware/authAgente.js
// Middleware para autenticación de agentes via JWT

const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'lector-mediciones-secret-key-cambiar-en-produccion';
const TOKEN_EXPIRY = '24h';

/**
 * Genera un token JWT para el agente
 */
function generarTokenAgente(agenteId, nombre) {
  return jwt.sign(
    { agenteId, nombre, tipo: 'agente' },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Middleware que verifica el token JWT del agente
 * Extrae el agente del token y lo agrega a req.agente
 */
async function verificarTokenAgente(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verificar que es un token de agente
    if (decoded.tipo !== 'agente') {
      return res.status(401).json({ error: 'Token inválido (no es token de agente)' });
    }

    // Verificar que el agente sigue activo en la BD
    const { data: agente, error } = await supabase
      .from('agentes')
      .select('id, nombre, activo')
      .eq('id', decoded.agenteId)
      .eq('activo', true)
      .single();

    if (error || !agente) {
      return res.status(401).json({ error: 'Agente no encontrado o inactivo' });
    }

    // Agregar agente al request
    req.agente = {
      id: agente.id,
      nombre: agente.nombre,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    console.error('Error verificando token agente:', error);
    return res.status(500).json({ error: 'Error al verificar autenticación' });
  }
}

module.exports = {
  generarTokenAgente,
  verificarTokenAgente,
  JWT_SECRET,
};
