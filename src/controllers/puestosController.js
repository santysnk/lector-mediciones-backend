// src/controllers/puestosController.js
// Controlador para gestionar puestos

const supabase = require('../config/supabase');

/**
 * Obtener todos los puestos de una configuración
 */
const obtenerPuestos = async (req, res) => {
  const { configuracionId } = req.params;

  try {
    const { data, error } = await supabase
      .from('puestos')
      .select(`
        *,
        alimentadores (*)
      `)
      .eq('configuracion_id', configuracionId)
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
  const { configuracionId } = req.params;
  const { nombre, descripcion, orden } = req.body;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  try {
    // Obtener el orden máximo actual si no se especifica
    let nuevoOrden = orden;
    if (nuevoOrden === undefined) {
      const { data: ultimoPuesto } = await supabase
        .from('puestos')
        .select('orden')
        .eq('configuracion_id', configuracionId)
        .order('orden', { ascending: false })
        .limit(1)
        .single();

      nuevoOrden = (ultimoPuesto?.orden || 0) + 1;
    }

    const { data, error } = await supabase
      .from('puestos')
      .insert({
        configuracion_id: configuracionId,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        orden: nuevoOrden,
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
  const { nombre, descripcion, orden } = req.body;

  try {
    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre.trim();
    if (descripcion !== undefined) updates.descripcion = descripcion?.trim() || null;
    if (orden !== undefined) updates.orden = orden;

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

  try {
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
  const { configuracionId } = req.params;
  const { ordenes } = req.body; // Array de { id, orden }

  if (!Array.isArray(ordenes)) {
    return res.status(400).json({ error: 'Se requiere un array de ordenes' });
  }

  try {
    // Actualizar cada puesto con su nuevo orden
    for (const item of ordenes) {
      await supabase
        .from('puestos')
        .update({ orden: item.orden })
        .eq('id', item.id)
        .eq('configuracion_id', configuracionId);
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
