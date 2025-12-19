// src/controllers/puestosController.js
// Controlador para gestionar puestos

const supabase = require('../config/supabase');

// ============================================
// Función auxiliar de verificación de acceso
// ============================================

/**
 * Verifica si el usuario tiene acceso a un workspace
 * @param {string} workspaceId - ID del workspace
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>}
 */
async function verificarAccesoWorkspace(workspaceId, userId) {
  const { data: asignacion } = await supabase
    .from('usuario_workspaces')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('usuario_id', userId)
    .single();

  return !!asignacion;
}

/**
 * Obtiene el workspace_id de un puesto
 * @param {string} puestoId - ID del puesto
 * @returns {Promise<string|null>}
 */
async function obtenerWorkspaceIdDePuesto(puestoId) {
  const { data: puesto } = await supabase
    .from('puestos')
    .select('workspace_id')
    .eq('id', puestoId)
    .single();

  return puesto?.workspace_id || null;
}

// ============================================
// Controladores
// ============================================

/**
 * Obtener todos los puestos de una configuración
 */
const obtenerPuestos = async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.id;

  try {
    // SEGURIDAD: Verificar que el usuario tiene acceso al workspace
    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este workspace' });
    }

    const { data, error } = await supabase
      .from('puestos')
      .select(`
        *,
        alimentadores (*)
      `)
      .eq('workspace_id', workspaceId)
      .order('orden', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error obteniendo puestos:', error);
    res.status(500).json({ error: 'Error al obtener puestos' });
  }
};

/**
 * Crear un nuevo puesto
 */
const crearPuesto = async (req, res) => {
  const { workspaceId } = req.params;
  const { nombre, descripcion, orden, color, bg_color } = req.body;
  const userId = req.user.id;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  try {
    // SEGURIDAD: Verificar que el usuario tiene acceso al workspace
    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este workspace' });
    }

    // Obtener el orden máximo actual si no se especifica
    let nuevoOrden = orden;
    if (nuevoOrden === undefined) {
      const { data: ultimoPuesto } = await supabase
        .from('puestos')
        .select('orden')
        .eq('workspace_id', workspaceId)
        .order('orden', { ascending: false })
        .limit(1)
        .single();

      nuevoOrden = (ultimoPuesto?.orden || 0) + 1;
    }

    const { data, error } = await supabase
      .from('puestos')
      .insert({
        workspace_id: workspaceId,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        orden: nuevoOrden,
        color: color || '#22c55e',
        bg_color: bg_color || '#e5e7eb',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creando puesto:', error);
    res.status(500).json({ error: 'Error al crear puesto' });
  }
};

/**
 * Actualizar un puesto
 */
const actualizarPuesto = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, orden, color, bg_color, gaps_verticales } = req.body;
  const userId = req.user.id;

  try {
    // SEGURIDAD: Verificar que el usuario tiene acceso al workspace del puesto
    const workspaceId = await obtenerWorkspaceIdDePuesto(id);
    if (!workspaceId) {
      return res.status(404).json({ error: 'Puesto no encontrado' });
    }

    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este puesto' });
    }

    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre.trim();
    if (descripcion !== undefined) updates.descripcion = descripcion?.trim() || null;
    if (orden !== undefined) updates.orden = orden;
    if (color !== undefined) updates.color = color;
    if (bg_color !== undefined) updates.bg_color = bg_color;
    if (gaps_verticales !== undefined) updates.gaps_verticales = gaps_verticales;

    const { data, error } = await supabase
      .from('puestos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error actualizando puesto:', error);
    res.status(500).json({ error: 'Error al actualizar puesto' });
  }
};

/**
 * Eliminar un puesto
 */
const eliminarPuesto = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // SEGURIDAD: Verificar que el usuario tiene acceso al workspace del puesto
    const workspaceId = await obtenerWorkspaceIdDePuesto(id);
    if (!workspaceId) {
      return res.status(404).json({ error: 'Puesto no encontrado' });
    }

    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este puesto' });
    }

    const { error } = await supabase
      .from('puestos')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ mensaje: 'Puesto eliminado' });
  } catch (error) {
    console.error('Error eliminando puesto:', error);
    res.status(500).json({ error: 'Error al eliminar puesto' });
  }
};

/**
 * Reordenar puestos
 */
const reordenarPuestos = async (req, res) => {
  const { workspaceId } = req.params;
  const { ordenes } = req.body; // Array de { id, orden }
  const userId = req.user.id;

  if (!Array.isArray(ordenes)) {
    return res.status(400).json({ error: 'Se requiere un array de ordenes' });
  }

  try {
    // SEGURIDAD: Verificar que el usuario tiene acceso al workspace
    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este workspace' });
    }

    // Actualizar cada puesto con su nuevo orden
    for (const item of ordenes) {
      await supabase
        .from('puestos')
        .update({ orden: item.orden })
        .eq('id', item.id)
        .eq('workspace_id', workspaceId);
    }

    res.json({ mensaje: 'Puestos reordenados' });
  } catch (error) {
    console.error('Error reordenando puestos:', error);
    res.status(500).json({ error: 'Error al reordenar puestos' });
  }
};

module.exports = {
  obtenerPuestos,
  crearPuesto,
  actualizarPuesto,
  eliminarPuesto,
  reordenarPuestos,
};
