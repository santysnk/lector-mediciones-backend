// src/controllers/permisosController.js
// Controlador para gestionar permisos de usuarios en configuraciones

const supabase = require('../config/supabase');

/**
 * Obtener todos los permisos de una configuración
 */
const obtenerPermisos = async (req, res) => {
  const { configuracionId } = req.params;

  try {
    const { data, error } = await supabase
      .from('permisos_configuracion')
      .select(`
        *,
        usuarios (id, email, nombre)
      `)
      .eq('configuracion_id', configuracionId);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error obteniendo permisos:', error);
    res.status(500).json({ error: 'Error al obtener permisos' });
  }
};

/**
 * Agregar permiso a un usuario (invitar)
 */
const agregarPermiso = async (req, res) => {
  const { configuracionId } = req.params;
  const { email, rol } = req.body;

  if (!email || !rol) {
    return res.status(400).json({ error: 'Email y rol son requeridos' });
  }

  const rolesValidos = ['viewer', 'operator', 'editor', 'admin'];
  if (!rolesValidos.includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido. Debe ser: viewer, operator, editor o admin' });
  }

  try {
    // Buscar usuario por email
    const { data: usuario, error: errorUsuario } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (errorUsuario || !usuario) {
      return res.status(404).json({ error: 'No se encontró un usuario con ese email' });
    }

    // Verificar que no sea el creador de la configuración
    const { data: config } = await supabase
      .from('configuraciones')
      .select('creado_por')
      .eq('id', configuracionId)
      .single();

    if (config?.creado_por === usuario.id) {
      return res.status(400).json({ error: 'El creador ya tiene acceso total a la configuración' });
    }

    // Crear o actualizar permiso
    const { data, error } = await supabase
      .from('permisos_configuracion')
      .upsert({
        configuracion_id: configuracionId,
        usuario_id: usuario.id,
        rol: rol,
      }, {
        onConflict: 'configuracion_id,usuario_id',
      })
      .select(`
        *,
        usuarios (id, email, nombre)
      `)
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Error agregando permiso:', error);
    res.status(500).json({ error: 'Error al agregar permiso' });
  }
};

/**
 * Actualizar rol de un usuario
 */
const actualizarPermiso = async (req, res) => {
  const { id } = req.params;
  const { rol } = req.body;

  const rolesValidos = ['viewer', 'operator', 'editor', 'admin'];
  if (!rolesValidos.includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  try {
    const { data, error } = await supabase
      .from('permisos_configuracion')
      .update({ rol })
      .eq('id', id)
      .select(`
        *,
        usuarios (id, email, nombre)
      `)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error actualizando permiso:', error);
    res.status(500).json({ error: 'Error al actualizar permiso' });
  }
};

/**
 * Eliminar permiso de un usuario
 */
const eliminarPermiso = async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('permisos_configuracion')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ mensaje: 'Permiso eliminado' });
  } catch (error) {
    console.error('Error eliminando permiso:', error);
    res.status(500).json({ error: 'Error al eliminar permiso' });
  }
};

module.exports = {
  obtenerPermisos,
  agregarPermiso,
  actualizarPermiso,
  eliminarPermiso,
};
