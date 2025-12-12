// src/controllers/preferenciasController.js
// Controlador para gestionar preferencias visuales del usuario

const supabase = require('../config/supabase');

/**
 * Obtener preferencias del usuario para una configuración
 */
const obtenerPreferencias = async (req, res) => {
  const { configuracionId } = req.params;
  const userId = req.user.id;

  try {
    const { data, error } = await supabase
      .from('preferencias_usuario')
      .select('*')
      .eq('usuario_id', userId)
      .eq('configuracion_id', configuracionId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    // Si no hay preferencias, devolver objeto vacío
    res.json(data || { preferencias: {} });
  } catch (error) {
    console.error('Error obteniendo preferencias:', error);
    res.status(500).json({ error: 'Error al obtener preferencias' });
  }
};

/**
 * Guardar preferencias del usuario para una configuración
 * (colores, orden de tarjetas, gaps, etc.)
 */
const guardarPreferencias = async (req, res) => {
  const { configuracionId } = req.params;
  const { preferencias } = req.body;
  const userId = req.user.id;

  if (!preferencias || typeof preferencias !== 'object') {
    return res.status(400).json({ error: 'Las preferencias deben ser un objeto' });
  }

  try {
    const { data, error } = await supabase
      .from('preferencias_usuario')
      .upsert({
        usuario_id: userId,
        configuracion_id: configuracionId,
        preferencias: preferencias,
      }, {
        onConflict: 'usuario_id,configuracion_id',
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error guardando preferencias:', error);
    res.status(500).json({ error: 'Error al guardar preferencias' });
  }
};

/**
 * Actualizar preferencias parcialmente (merge)
 */
const actualizarPreferencias = async (req, res) => {
  const { configuracionId } = req.params;
  const { preferencias: nuevasPreferencias } = req.body;
  const userId = req.user.id;

  try {
    // Obtener preferencias actuales
    const { data: actual } = await supabase
      .from('preferencias_usuario')
      .select('preferencias')
      .eq('usuario_id', userId)
      .eq('configuracion_id', configuracionId)
      .single();

    // Merge con las nuevas
    const preferenciasActualizadas = {
      ...(actual?.preferencias || {}),
      ...nuevasPreferencias,
    };

    const { data, error } = await supabase
      .from('preferencias_usuario')
      .upsert({
        usuario_id: userId,
        configuracion_id: configuracionId,
        preferencias: preferenciasActualizadas,
      }, {
        onConflict: 'usuario_id,configuracion_id',
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error actualizando preferencias:', error);
    res.status(500).json({ error: 'Error al actualizar preferencias' });
  }
};

/**
 * Eliminar preferencias del usuario
 */
const eliminarPreferencias = async (req, res) => {
  const { configuracionId } = req.params;
  const userId = req.user.id;

  try {
    const { error } = await supabase
      .from('preferencias_usuario')
      .delete()
      .eq('usuario_id', userId)
      .eq('configuracion_id', configuracionId);

    if (error) throw error;

    res.json({ mensaje: 'Preferencias eliminadas' });
  } catch (error) {
    console.error('Error eliminando preferencias:', error);
    res.status(500).json({ error: 'Error al eliminar preferencias' });
  }
};

module.exports = {
  obtenerPreferencias,
  guardarPreferencias,
  actualizarPreferencias,
  eliminarPreferencias,
};
