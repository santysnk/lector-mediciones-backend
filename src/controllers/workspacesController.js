// src/controllers/workspacesController.js
// Controlador para gestionar workspaces

const supabase = require('../config/supabase');

/**
 * Obtener todos los workspaces del usuario autenticado
 * (donde tiene asignación en usuario_workspaces)
 */
const obtenerWorkspaces = async (req, res) => {
  const userId = req.user.id;

  try {
    // Obtener workspaces donde el usuario tiene asignación
    const { data: asignaciones, error: errorAsignaciones } = await supabase
      .from('usuario_workspaces')
      .select(`
        workspace_id,
        rol_id,
        roles (codigo),
        workspaces (*)
      `)
      .eq('usuario_id', userId);

    if (errorAsignaciones) throw errorAsignaciones;

    // Formatear resultados
    const workspaces = asignaciones.map(a => {
      return {
        ...a.workspaces,
        rol: a.roles?.codigo || 'observador',
        esCreador: a.workspaces?.creado_por === userId,
      };
    });

    res.json(workspaces);
  } catch (error) {
    console.error('Error obteniendo workspaces:', error);
    res.status(500).json({ error: 'Error al obtener workspaces' });
  }
};

/**
 * Obtener un workspace por ID con todos sus datos
 * (puestos, alimentadores)
 */
const obtenerWorkspace = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Verificar que el usuario tiene acceso
    const tieneAcceso = await verificarAcceso(id, userId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este workspace' });
    }

    // Obtener workspace con puestos y alimentadores
    const { data: workspace, error } = await supabase
      .from('workspaces')
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

    // Obtener el rol del usuario en este workspace
    const rol = await obtenerRolUsuario(id, userId);
    workspace.rolUsuario = rol;

    res.json(workspace);
  } catch (error) {
    console.error('Error obteniendo workspace:', error);
    res.status(500).json({ error: 'Error al obtener workspace' });
  }
};

/**
 * Crear un nuevo workspace
 * Solo superadmin y admin pueden crear workspaces
 */
const crearWorkspace = async (req, res) => {
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

    // Verificar que el usuario tiene permiso para crear workspaces (superadmin o admin)
    const rolGlobal = await obtenerRolGlobalUsuario(userId);
    if (!['superadmin', 'admin'].includes(rolGlobal)) {
      return res.status(403).json({
        error: 'No tienes permiso para crear workspaces. Solo superadmin y admin pueden hacerlo.'
      });
    }

    // Crear el workspace
    const { data: workspace, error: errorWorkspace } = await supabase
      .from('workspaces')
      .insert({
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        creado_por: userId,
      })
      .select()
      .single();

    if (errorWorkspace) throw errorWorkspace;

    // Obtener el rol admin para asignar al creador
    const { data: rolAdmin } = await supabase
      .from('roles')
      .select('id')
      .eq('codigo', 'admin')
      .single();

    // Asignar automáticamente al creador como admin del workspace
    const { error: errorAsignacion } = await supabase
      .from('usuario_workspaces')
      .insert({
        usuario_id: userId,
        workspace_id: workspace.id,
        rol_id: rolAdmin?.id,
      });

    if (errorAsignacion) {
      // Si falla la asignación, eliminar el workspace creado
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      throw errorAsignacion;
    }

    // Devolver el workspace con el rol incluido
    res.status(201).json({
      ...workspace,
      rol: 'admin',
      esCreador: true,
    });
  } catch (error) {
    console.error('Error creando workspace:', error);
    res.status(500).json({ error: 'Error al crear workspace' });
  }
};

/**
 * Asegura que el usuario existe en la tabla usuarios de Supabase.
 * Si no existe, lo crea automáticamente con rol observador por defecto.
 * NOTA: El trigger on_auth_user_created debería crear el usuario automáticamente,
 * pero esta función sirve como respaldo.
 */
async function asegurarUsuarioExiste(userId, email, nombre) {
  // Verificar si el usuario ya existe
  const { data: existente } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', userId)
    .single();

  if (existente) return; // Ya existe, no hacer nada

  // Obtener el rol observador (rol por defecto, nivel 4)
  const { data: rolObservador } = await supabase
    .from('roles')
    .select('id')
    .eq('codigo', 'observador')
    .single();

  // Crear el usuario con rol observador por defecto
  const { error } = await supabase
    .from('usuarios')
    .insert({
      id: userId,
      email: email || `user_${userId.substring(0, 8)}@local`,
      nombre: nombre || 'Usuario',
      rol_id: rolObservador?.id || null,
    });

  if (error && error.code !== '23505') { // 23505 = duplicate key (ya existe)
    console.error('Error creando usuario:', error);
    throw error;
  }
}

/**
 * Actualizar un workspace
 */
const actualizarWorkspace = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion } = req.body;
  const userId = req.user.id;

  try {
    // Verificar que el usuario puede editar (admin o creador)
    const rol = await obtenerRolUsuario(id, userId);
    if (!['admin', 'superadmin'].includes(rol)) {
      return res.status(403).json({ error: 'No tienes permiso para editar este workspace' });
    }

    const { data, error } = await supabase
      .from('workspaces')
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
    console.error('Error actualizando workspace:', error);
    res.status(500).json({ error: 'Error al actualizar workspace' });
  }
};

/**
 * Eliminar un workspace
 */
const eliminarWorkspace = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Solo el creador puede eliminar
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('creado_por')
      .eq('id', id)
      .single();

    if (workspace?.creado_por !== userId) {
      return res.status(403).json({ error: 'Solo el creador puede eliminar el workspace' });
    }

    // Eliminar todas las preferencias de usuario asociadas al workspace
    const { error: errorPreferencias } = await supabase
      .from('preferencias_usuario')
      .delete()
      .eq('workspace_id', id);

    if (errorPreferencias) {
      console.error('Error eliminando preferencias del workspace:', errorPreferencias);
      // Continuar aunque falle, el workspace se eliminará igual
    }

    const { error } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ mensaje: 'Workspace eliminado' });
  } catch (error) {
    console.error('Error eliminando workspace:', error);
    res.status(500).json({ error: 'Error al eliminar workspace' });
  }
};

// ============================================
// Funciones auxiliares
// ============================================

async function verificarAcceso(workspaceId, userId) {
  // Verificar si tiene asignación en usuario_workspaces
  const { data: asignacion } = await supabase
    .from('usuario_workspaces')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('usuario_id', userId)
    .single();

  return !!asignacion;
}

async function obtenerRolUsuario(workspaceId, userId) {
  // Obtener rol desde usuario_workspaces con join a roles
  const { data: asignacion } = await supabase
    .from('usuario_workspaces')
    .select('rol_id, roles (codigo)')
    .eq('workspace_id', workspaceId)
    .eq('usuario_id', userId)
    .single();

  return asignacion?.roles?.codigo || null;
}

/**
 * Obtiene el rol global del usuario (desde la tabla usuarios)
 */
async function obtenerRolGlobalUsuario(userId) {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol_id, roles (codigo)')
    .eq('id', userId)
    .single();

  return usuario?.roles?.codigo || 'observador';
}

module.exports = {
  obtenerWorkspaces,
  obtenerWorkspace,
  crearWorkspace,
  actualizarWorkspace,
  eliminarWorkspace,
};
