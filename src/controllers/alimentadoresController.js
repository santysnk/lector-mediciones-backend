// src/controllers/alimentadoresController.js
// Controlador para gestionar alimentadores

const supabase = require('../config/supabase');

// ============================================
// Funciones auxiliares de verificación de acceso
// ============================================

/**
 * Verifica si el usuario tiene acceso a un workspace
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
 */
async function obtenerWorkspaceIdDePuesto(puestoId) {
  const { data: puesto } = await supabase
    .from('puestos')
    .select('workspace_id')
    .eq('id', puestoId)
    .single();

  return puesto?.workspace_id || null;
}

/**
 * Obtiene el workspace_id de un alimentador (via su puesto)
 */
async function obtenerWorkspaceIdDeAlimentador(alimentadorId) {
  const { data: alimentador } = await supabase
    .from('alimentadores')
    .select('puesto_id')
    .eq('id', alimentadorId)
    .single();

  if (!alimentador?.puesto_id) return null;

  return obtenerWorkspaceIdDePuesto(alimentador.puesto_id);
}

// ============================================
// Controladores
// ============================================

/**
 * Obtener todos los alimentadores de un puesto
 */
const obtenerAlimentadores = async (req, res) => {
  const { puestoId } = req.params;
  const userId = req.user.id;

  try {
    // SEGURIDAD: Verificar acceso al workspace del puesto
    const workspaceId = await obtenerWorkspaceIdDePuesto(puestoId);
    if (!workspaceId) {
      return res.status(404).json({ error: 'Puesto no encontrado' });
    }

    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este puesto' });
    }

    const { data, error } = await supabase
      .from('alimentadores')
      .select('*')
      .eq('puesto_id', puestoId)
      .order('orden', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error obteniendo alimentadores:', error);
    res.status(500).json({ error: 'Error al obtener alimentadores' });
  }
};

/**
 * Crear un nuevo alimentador
 */
const crearAlimentador = async (req, res) => {
  const { puestoId } = req.params;
  const { nombre, color, orden, registrador_id, intervalo_consulta_ms, card_design, gap_horizontal } = req.body;
  const userId = req.user.id;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  try {
    // SEGURIDAD: Verificar acceso al workspace del puesto
    const workspaceId = await obtenerWorkspaceIdDePuesto(puestoId);
    if (!workspaceId) {
      return res.status(404).json({ error: 'Puesto no encontrado' });
    }

    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este puesto' });
    }

    // Obtener el orden máximo actual si no se especifica
    let nuevoOrden = orden;
    if (nuevoOrden === undefined) {
      const { data: ultimoAlim } = await supabase
        .from('alimentadores')
        .select('orden')
        .eq('puesto_id', puestoId)
        .order('orden', { ascending: false })
        .limit(1)
        .single();

      nuevoOrden = (ultimoAlim?.orden || 0) + 1;
    }

    const { data, error } = await supabase
      .from('alimentadores')
      .insert({
        puesto_id: puestoId,
        nombre: nombre.trim(),
        color: color || '#3b82f6',
        orden: nuevoOrden,
        registrador_id: registrador_id || null,
        intervalo_consulta_ms: intervalo_consulta_ms || 60000,
        card_design: card_design || {},
        gap_horizontal: gap_horizontal || 0,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creando alimentador:', error);
    res.status(500).json({ error: 'Error al crear alimentador' });
  }
};

/**
 * Actualizar un alimentador
 */
const actualizarAlimentador = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre, color, orden, registrador_id, intervalo_consulta_ms,
      card_design, gap_horizontal, escala, config_tarjeta
    } = req.body;
    const userId = req.user.id;
    // SEGURIDAD: Verificar acceso al workspace del alimentador
    const workspaceId = await obtenerWorkspaceIdDeAlimentador(id);
    if (!workspaceId) {
      return res.status(404).json({ error: 'Alimentador no encontrado' });
    }

    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este alimentador' });
    }

    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre.trim();
    if (color !== undefined) updates.color = color;
    if (orden !== undefined) updates.orden = orden;
    if (registrador_id !== undefined) updates.registrador_id = registrador_id;
    if (intervalo_consulta_ms !== undefined) updates.intervalo_consulta_ms = intervalo_consulta_ms;
    if (card_design !== undefined) updates.card_design = card_design;
    if (gap_horizontal !== undefined) updates.gap_horizontal = gap_horizontal;
    if (escala !== undefined) updates.escala = escala;
    if (config_tarjeta !== undefined) updates.config_tarjeta = config_tarjeta;

    const { data, error } = await supabase
      .from('alimentadores')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error actualizando alimentador:', error);
    res.status(500).json({ error: 'Error al actualizar alimentador' });
  }
};

/**
 * Eliminar un alimentador
 */
const eliminarAlimentador = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // SEGURIDAD: Verificar acceso al workspace del alimentador
    const workspaceId = await obtenerWorkspaceIdDeAlimentador(id);
    if (!workspaceId) {
      return res.status(404).json({ error: 'Alimentador no encontrado' });
    }

    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este alimentador' });
    }

    const { error } = await supabase
      .from('alimentadores')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ mensaje: 'Alimentador eliminado' });
  } catch (error) {
    console.error('Error eliminando alimentador:', error);
    res.status(500).json({ error: 'Error al eliminar alimentador' });
  }
};

/**
 * Reordenar alimentadores dentro de un puesto
 */
const reordenarAlimentadores = async (req, res) => {
  const { puestoId } = req.params;
  const { ordenes } = req.body; // Array de { id, orden }
  const userId = req.user.id;

  if (!Array.isArray(ordenes)) {
    return res.status(400).json({ error: 'Se requiere un array de ordenes' });
  }

  try {
    // SEGURIDAD: Verificar acceso al workspace del puesto
    const workspaceId = await obtenerWorkspaceIdDePuesto(puestoId);
    if (!workspaceId) {
      return res.status(404).json({ error: 'Puesto no encontrado' });
    }

    const tieneAcceso = await verificarAccesoWorkspace(workspaceId, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este puesto' });
    }

    for (const item of ordenes) {
      await supabase
        .from('alimentadores')
        .update({ orden: item.orden })
        .eq('id', item.id)
        .eq('puesto_id', puestoId);
    }

    res.json({ mensaje: 'Alimentadores reordenados' });
  } catch (error) {
    console.error('Error reordenando alimentadores:', error);
    res.status(500).json({ error: 'Error al reordenar alimentadores' });
  }
};

/**
 * Mover alimentador a otro puesto
 */
const moverAlimentador = async (req, res) => {
  const { id } = req.params;
  const { nuevo_puesto_id, orden } = req.body;
  const userId = req.user.id;

  // Soportar ambos nombres de parámetro por compatibilidad
  const nuevoPuestoId = nuevo_puesto_id;

  if (!nuevoPuestoId) {
    return res.status(400).json({ error: 'Se requiere el ID del nuevo puesto' });
  }

  try {
    // SEGURIDAD: Verificar acceso al workspace del alimentador actual
    const workspaceIdOrigen = await obtenerWorkspaceIdDeAlimentador(id);
    if (!workspaceIdOrigen) {
      return res.status(404).json({ error: 'Alimentador no encontrado' });
    }

    const tieneAccesoOrigen = await verificarAccesoWorkspace(workspaceIdOrigen, userId);
    if (!tieneAccesoOrigen) {
      return res.status(403).json({ error: 'No tienes acceso a este alimentador' });
    }

    // SEGURIDAD: Verificar acceso al workspace del puesto destino
    const workspaceIdDestino = await obtenerWorkspaceIdDePuesto(nuevoPuestoId);
    if (!workspaceIdDestino) {
      return res.status(404).json({ error: 'Puesto destino no encontrado' });
    }

    const tieneAccesoDestino = await verificarAccesoWorkspace(workspaceIdDestino, userId);
    if (!tieneAccesoDestino) {
      return res.status(403).json({ error: 'No tienes acceso al puesto destino' });
    }

    const { data, error } = await supabase
      .from('alimentadores')
      .update({
        puesto_id: nuevoPuestoId,
        orden: orden || 0,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error moviendo alimentador:', error);
    res.status(500).json({ error: 'Error al mover alimentador' });
  }
};

module.exports = {
  obtenerAlimentadores,
  crearAlimentador,
  actualizarAlimentador,
  eliminarAlimentador,
  reordenarAlimentadores,
  moverAlimentador,
};
