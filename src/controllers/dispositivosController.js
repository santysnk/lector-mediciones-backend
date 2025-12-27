// src/controllers/dispositivosController.js
// Controlador para gestión de dispositivos y tokens FCM para push notifications

const supabase = require('../config/supabase');

/**
 * POST /api/dispositivos/registrar
 * Registra o actualiza el token FCM de un dispositivo
 */
async function registrarDispositivo(req, res) {
  try {
    const usuarioId = req.user.id;
    const { fcmToken, plataforma = 'android' } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken es requerido' });
    }

    // Upsert: insertar o actualizar si ya existe el token para este usuario
    const { data, error } = await supabase
      .from('dispositivos_usuario')
      .upsert({
        usuario_id: usuarioId,
        fcm_token: fcmToken,
        plataforma,
        activo: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'usuario_id,fcm_token',
      })
      .select()
      .single();

    if (error) {
      console.error('Error registrando dispositivo:', error);
      return res.status(500).json({ error: 'Error registrando dispositivo' });
    }

    console.log(`[Dispositivos] Token registrado para usuario ${usuarioId}`);
    res.json({ mensaje: 'Dispositivo registrado', dispositivo: data });
  } catch (err) {
    console.error('Error en registrarDispositivo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE /api/dispositivos/desregistrar
 * Desactiva el token FCM de un dispositivo
 */
async function desregistrarDispositivo(req, res) {
  try {
    const usuarioId = req.user.id;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken es requerido' });
    }

    const { error } = await supabase
      .from('dispositivos_usuario')
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('usuario_id', usuarioId)
      .eq('fcm_token', fcmToken);

    if (error) {
      console.error('Error desregistrando dispositivo:', error);
      return res.status(500).json({ error: 'Error desregistrando dispositivo' });
    }

    console.log(`[Dispositivos] Token desregistrado para usuario ${usuarioId}`);
    res.json({ mensaje: 'Dispositivo desregistrado' });
  } catch (err) {
    console.error('Error en desregistrarDispositivo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/dispositivos
 * Obtiene los dispositivos del usuario actual
 */
async function obtenerDispositivos(req, res) {
  try {
    const usuarioId = req.user.id;

    const { data, error } = await supabase
      .from('dispositivos_usuario')
      .select('id, plataforma, activo, created_at, updated_at')
      .eq('usuario_id', usuarioId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo dispositivos:', error);
      return res.status(500).json({ error: 'Error obteniendo dispositivos' });
    }

    res.json({ dispositivos: data || [] });
  } catch (err) {
    console.error('Error en obtenerDispositivos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  registrarDispositivo,
  desregistrarDispositivo,
  obtenerDispositivos,
};
