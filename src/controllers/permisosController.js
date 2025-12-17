// src/controllers/permisosController.js
// Controlador para gestionar permisos de usuarios en workspaces
// Actualizado para usar la nueva tabla usuario_workspaces con roles

const supabase = require('../config/supabase');

/**
 * Obtener todos los usuarios con acceso a un workspace
 */
const obtenerPermisos = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const { data, error } = await supabase
      .from('usuario_workspaces')
      .select(`
        id,
        usuario_id,
        workspace_id,
        rol_id,
        created_at,
        usuarios (id, email, nombre),
        roles (id, codigo, nombre, nivel)
      `)
      .eq('workspace_id', workspaceId);

    if (error) throw error;

    // Transformar datos para mantener compatibilidad con frontend
    const permisos = data.map(p => ({
      id: p.id,
      usuario_id: p.usuario_id,
      workspace_id: p.workspace_id,
      rol: p.roles?.codigo,
      rolNombre: p.roles?.nombre,
      nivel: p.roles?.nivel,
      created_at: p.created_at,
      usuarios: p.usuarios,
    }));

    res.json(permisos);
  } catch (error) {
    console.error('Error obteniendo permisos:', error);
    res.status(500).json({ error: 'Error al obtener permisos' });
  }
};

/**
 * Agregar permiso a un usuario (invitar al workspace)
 */
const agregarPermiso = async (req, res) => {
  const { workspaceId } = req.params;
  const { email, rol } = req.body;

  if (!email || !rol) {
    return res.status(400).json({ error: 'Email y rol son requeridos' });
  }

  // Mapeo de roles antiguos a nuevos códigos
  const mapeoRoles = {
    'viewer': 'observador',
    'operator': 'operador',
    'editor': 'admin',
    'admin': 'admin',
    'observador': 'observador',
    'operador': 'operador',
  };

  const rolCodigo = mapeoRoles[rol] || rol;
  const rolesValidos = ['observador', 'operador', 'admin'];

  if (!rolesValidos.includes(rolCodigo)) {
    return res.status(400).json({ error: 'Rol inválido. Debe ser: observador, operador o admin' });
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
      .from('workspaces')
      .select('creado_por')
      .eq('id', workspaceId)
      .single();

    if (config?.creado_por === usuario.id) {
      return res.status(400).json({ error: 'El creador ya tiene acceso total al workspace' });
    }

    // Obtener ID del rol
    const { data: rolData, error: errorRol } = await supabase
      .from('roles')
      .select('id')
      .eq('codigo', rolCodigo)
      .single();

    if (errorRol || !rolData) {
      return res.status(400).json({ error: 'Rol no encontrado en el sistema' });
    }

    // Crear o actualizar permiso
    const { data, error } = await supabase
      .from('usuario_workspaces')
      .upsert({
        workspace_id: workspaceId,
        usuario_id: usuario.id,
        rol_id: rolData.id,
      }, {
        onConflict: 'usuario_id,workspace_id',
      })
      .select(`
        id,
        usuario_id,
        workspace_id,
        rol_id,
        created_at,
        usuarios (id, email, nombre),
        roles (id, codigo, nombre, nivel)
      `)
      .single();

    if (error) throw error;

    // Transformar respuesta
    const respuesta = {
      id: data.id,
      usuario_id: data.usuario_id,
      workspace_id: data.workspace_id,
      rol: data.roles?.codigo,
      rolNombre: data.roles?.nombre,
      nivel: data.roles?.nivel,
      created_at: data.created_at,
      usuarios: data.usuarios,
    };

    res.status(201).json(respuesta);
  } catch (error) {
    console.error('Error agregando permiso:', error);
    res.status(500).json({ error: 'Error al agregar permiso' });
  }
};

/**
 * Actualizar rol de un usuario en el workspace
 */
const actualizarPermiso = async (req, res) => {
  const { id } = req.params;
  const { rol } = req.body;

  // Mapeo de roles antiguos a nuevos códigos
  const mapeoRoles = {
    'viewer': 'observador',
    'operator': 'operador',
    'editor': 'admin',
    'admin': 'admin',
    'observador': 'observador',
    'operador': 'operador',
  };

  const rolCodigo = mapeoRoles[rol] || rol;
  const rolesValidos = ['observador', 'operador', 'admin'];

  if (!rolesValidos.includes(rolCodigo)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  try {
    // Obtener ID del rol
    const { data: rolData, error: errorRol } = await supabase
      .from('roles')
      .select('id')
      .eq('codigo', rolCodigo)
      .single();

    if (errorRol || !rolData) {
      return res.status(400).json({ error: 'Rol no encontrado' });
    }

    const { data, error } = await supabase
      .from('usuario_workspaces')
      .update({ rol_id: rolData.id })
      .eq('id', id)
      .select(`
        id,
        usuario_id,
        workspace_id,
        rol_id,
        created_at,
        usuarios (id, email, nombre),
        roles (id, codigo, nombre, nivel)
      `)
      .single();

    if (error) throw error;

    // Transformar respuesta
    const respuesta = {
      id: data.id,
      usuario_id: data.usuario_id,
      workspace_id: data.workspace_id,
      rol: data.roles?.codigo,
      rolNombre: data.roles?.nombre,
      nivel: data.roles?.nivel,
      created_at: data.created_at,
      usuarios: data.usuarios,
    };

    res.json(respuesta);
  } catch (error) {
    console.error('Error actualizando permiso:', error);
    res.status(500).json({ error: 'Error al actualizar permiso' });
  }
};

/**
 * Eliminar permiso de un usuario (remover del workspace)
 */
const eliminarPermiso = async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('usuario_workspaces')
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
