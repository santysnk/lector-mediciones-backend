// src/middleware/auth.js
// Middleware para verificar el token JWT de Supabase

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Middleware que verifica el token JWT del usuario
 * Extrae el usuario del token y lo agrega a req.user
 */
const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Crear cliente temporal con el token del usuario
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    // Agregar usuario al request para usarlo en los controladores
    req.user = user;
    req.supabaseClient = supabaseClient;
    next();
  } catch (error) {
    console.error('Error verificando token:', error);
    return res.status(500).json({ error: 'Error al verificar autenticación' });
  }
};

module.exports = { verificarToken };
