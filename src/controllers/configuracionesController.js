// src/controllers/configuracionesController.js
// Controlador para gestionar configuraciones (ej: "Lecturas_Celta")

const supabase = require('../config/supabase');

/**
 * Obtener todas las configuraciones del usuario autenticado
 * (donde es creador o tiene permisos)
 */
const obtenerConfiguraciones = async (req, res) => {
  const userId = req.user.id;

  try {
    // Obtener configuraciones donde soy creador
    const { data: propias, error: errorPropias } = await supabase
      .from('configuraciones')
      .select('*')
      .eq('creado_por', userId);

    if (errorPropias) throw errorPropias;

    // Obtener configuraciones donde tengo permisos
    const { data: permisos, error: errorPermisos } = await supabase
      .from('permisos_configuracion')
      .select('configuracion_id, rol, configuraciones(*)')
      .eq('usuario_id', userId);

    if (errorPermisos) throw errorPermisos;

    // Combinar y formatear resultados
    const configuraciones = [
      ...propias.map(c => ({ ...c, rol: 'admin', esCreador: true })),
      ...permisos.map(p => ({ ...p.configuraciones, rol: p.rol, esCreador: false })),
    ];

    // Eliminar duplicados (si soy creador y tengo permiso)
    const unicas = configuraciones.filter((c, index, self) =>
      index === self.findIndex(t => t.id === c.id)
    );

    res.json(unicas);
  } catch (error) {
    console.error('Error obteniendo configuraciones:', error);
    res.status(500).json({ error: 'Error al obtener configuraciones' });
  }
};

/**
 * Obtener una configuración por ID con todos sus datos
 * (puestos, alimentadores)
 */
const obtenerConfiguracion = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Verificar que el usuario tiene acceso
    const tieneAcceso = await verificarAcceso(id, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta configuración' });
    }

    // Obtener configuración con puestos y alimentadores
    const { data: configuracion, error } = await supabase
      .from('configuraciones')
      .select(`
        *,
        puestos (
          *,
          alimentadores (*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Obtener el rol del usuario en esta configuración
    const rol = await obtenerRolUsuario(id, userId);
    configuracion.rolUsuario = rol;

    res.json(configuracion);
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

/**
 * Crear una nueva configuración
 */
const crearConfiguracion = async (req, res) => {
  const { nombre, descripcion } = req.body;
  const userId = req.user.id;
  const userEmail = req.user.email;
  const userName = req.user.nombre;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  try {
    // Asegurar que el usuario existe en la tabla usuarios
    await asegurarUsuarioExiste(userId, userEmail, userName);

    const { data, error } = await supabase
      .from('configuraciones')
      .insert({
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        creado_por: userId,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creando configuración:', error);
    res.status(500).json({ error: 'Error al crear configuración' });
  }
};

/**
 * Asegura que el usuario existe en la tabla usuarios de Supabase.
 * Si no existe, lo crea automáticamente.
 */
async function asegurarUsuarioExiste(userId, email, nombre) {
  // Verificar si el usuario ya existe
  const { data: existente } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', userId)
    .single();

  if (existente) return; // Ya existe, no hacer nada

  // Crear el usuario
  const { error } = await supabase
    .from('usuarios')
    .insert({
      id: userId,
      email: email || `user_${userId.substring(0, 8)}@local`,
      nombre: nombre || 'Usuario',
      password_hash: '', // Supabase Auth maneja la contraseña
    });

  if (error && error.code !== '23505') { // 23505 = duplicate key (ya existe)
    console.error('Error creando usuario:', error);
    throw error;
  }
}

/**
 * Actualizar una configuración
 */
const actualizarConfiguracion = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion } = req.body;
  const userId = req.user.id;

  try {
    // Verificar que el usuario puede editar (admin o creador)
    const rol = await obtenerRolUsuario(id, userId);
    if (!['admin', 'superadmin'].includes(rol)) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta configuración' });
    }

    const { data, error } = await supabase
      .from('configuraciones')
      .update({
        nombre: nombre?.trim(),
        descripcion: descripcion?.trim(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
};

/**
 * Eliminar una configuración
 */
const eliminarConfiguracion = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Solo el creador puede eliminar
    const { data: config } = await supabase
      .from('configuraciones')
      .select('creado_por')
      .eq('id', id)
      .single();

    if (config?.creado_por !== userId) {
      return res.status(403).json({ error: 'Solo el creador puede eliminar la configuración' });
    }

    const { error } = await supabase
      .from('configuraciones')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ mensaje: 'Configuración eliminada' });
  } catch (error) {
    console.error('Error eliminando configuración:', error);
    res.status(500).json({ error: 'Error al eliminar configuración' });
  }
};

// ============================================
// Funciones auxiliares
// ============================================

async function verificarAcceso(configuracionId, userId) {
  // Verificar si es creador
  const { data: config } = await supabase
    .from('configuraciones')
    .select('creado_por')
    .eq('id', configuracionId)
    .single();

  if (config?.creado_por === userId) return true;

  // Verificar si tiene permiso
  const { data: permiso } = await supabase
    .from('permisos_configuracion')
    .select('id')
    .eq('configuracion_id', configuracionId)
    .eq('usuario_id', userId)
    .single();

  return !!permiso;
}

async function obtenerRolUsuario(configuracionId, userId) {
  // Verificar si es creador
  const { data: config } = await supabase
    .from('configuraciones')
    .select('creado_por')
    .eq('id', configuracionId)
    .single();

  if (config?.creado_por === userId) return 'admin';

  // Obtener rol desde permisos
  const { data: permiso } = await supabase
    .from('permisos_configuracion')
    .select('rol')
    .eq('configuracion_id', configuracionId)
    .eq('usuario_id', userId)
    .single();

  return permiso?.rol || null;
}

module.exports = {
  obtenerConfiguraciones,
  obtenerConfiguracion,
  crearConfiguracion,
  actualizarConfiguracion,
  eliminarConfiguracion,
};
