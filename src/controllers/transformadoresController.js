// src/controllers/transformadoresController.js
// Controlador para CRUD de transformadores (TI/TV)

const supabase = require('../config/supabase');

/**
 * Verifica si el usuario tiene permisos sobre el workspace
 */
async function verificarPermisoWorkspace(usuarioId, workspaceId, rolesPermitidos = null) {
  const { data: permiso } = await supabase
    .from('usuario_workspaces')
    .select('rol_id, roles (codigo)')
    .eq('workspace_id', workspaceId)
    .eq('usuario_id', usuarioId)
    .single();

  if (permiso) {
    const rolCodigo = permiso.roles?.codigo;
    if (!rolesPermitidos || rolesPermitidos.includes(rolCodigo)) {
      return { tienePermiso: true, rol: rolCodigo };
    }
  }

  // Verificar si es superadmin global
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol_id, roles (codigo)')
    .eq('id', usuarioId)
    .single();

  if (usuario?.roles?.codigo === 'superadmin') {
    return { tienePermiso: true, rol: 'superadmin' };
  }

  return { tienePermiso: false, rol: null };
}

// ============================================
// CRUD de Transformadores
// ============================================

/**
 * GET /api/workspaces/:workspaceId/transformadores
 * Obtiene todos los transformadores del workspace
 */
async function obtenerTransformadores(req, res) {
  try {
    const { workspaceId } = req.params;
    const usuarioId = req.user.id;

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos sobre este workspace' });
    }

    // Obtener transformadores del workspace
    const { data, error } = await supabase
      .from('transformadores')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('tipo', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error obteniendo transformadores:', error);
      return res.status(500).json({ error: 'Error obteniendo transformadores' });
    }

    res.json({ transformadores: data || [] });

  } catch (err) {
    console.error('Error en obtenerTransformadores:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/workspaces/:workspaceId/transformadores
 * Crea un nuevo transformador
 */
async function crearTransformador(req, res) {
  try {
    const { workspaceId } = req.params;
    const usuarioId = req.user.id;
    const { tipo, nombre, formula, descripcion } = req.body;

    // Validar campos requeridos
    if (!tipo || !nombre || !formula) {
      return res.status(400).json({ error: 'Tipo, nombre y fórmula son requeridos' });
    }

    // Validar tipo
    if (!['TI', 'TV', 'REL'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo debe ser TI, TV o REL' });
    }

    // Verificar permisos (admin o superior)
    const { tienePermiso, rol } = await verificarPermisoWorkspace(usuarioId, workspaceId, ['admin', 'superadmin']);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para crear transformadores' });
    }

    // Crear transformador
    const { data, error } = await supabase
      .from('transformadores')
      .insert({
        tipo,
        nombre: nombre.trim(),
        formula: formula.trim(),
        descripcion: descripcion?.trim() || null,
        workspace_id: workspaceId,
        created_by: usuarioId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando transformador:', error);
      return res.status(500).json({ error: 'Error creando transformador' });
    }

    res.status(201).json({ transformador: data });

  } catch (err) {
    console.error('Error en crearTransformador:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PUT /api/transformadores/:id
 * Actualiza un transformador existente
 */
async function actualizarTransformador(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = req.user.id;
    const { tipo, nombre, formula, descripcion } = req.body;

    // Obtener el transformador para verificar workspace
    const { data: transformador, error: errorBuscar } = await supabase
      .from('transformadores')
      .select('workspace_id')
      .eq('id', id)
      .single();

    if (errorBuscar || !transformador) {
      return res.status(404).json({ error: 'Transformador no encontrado' });
    }

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, transformador.workspace_id, ['admin', 'superadmin']);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para editar transformadores' });
    }

    // Validar tipo si se proporciona
    if (tipo && !['TI', 'TV', 'REL'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo debe ser TI, TV o REL' });
    }

    // Preparar datos de actualización
    const datosActualizacion = {};
    if (tipo) datosActualizacion.tipo = tipo;
    if (nombre) datosActualizacion.nombre = nombre.trim();
    if (formula) datosActualizacion.formula = formula.trim();
    if (descripcion !== undefined) datosActualizacion.descripcion = descripcion?.trim() || null;

    // Actualizar
    const { data, error } = await supabase
      .from('transformadores')
      .update(datosActualizacion)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando transformador:', error);
      return res.status(500).json({ error: 'Error actualizando transformador' });
    }

    res.json({ transformador: data });

  } catch (err) {
    console.error('Error en actualizarTransformador:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE /api/transformadores/:id
 * Elimina un transformador
 */
async function eliminarTransformador(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = req.user.id;

    // Obtener el transformador para verificar workspace
    const { data: transformador, error: errorBuscar } = await supabase
      .from('transformadores')
      .select('workspace_id')
      .eq('id', id)
      .single();

    if (errorBuscar || !transformador) {
      return res.status(404).json({ error: 'Transformador no encontrado' });
    }

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, transformador.workspace_id, ['admin', 'superadmin']);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar transformadores' });
    }

    // Eliminar
    const { error } = await supabase
      .from('transformadores')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando transformador:', error);
      return res.status(500).json({ error: 'Error eliminando transformador' });
    }

    res.json({ mensaje: 'Transformador eliminado correctamente' });

  } catch (err) {
    console.error('Error en eliminarTransformador:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/workspaces/:workspaceId/transformadores/migrar
 * Migra transformadores desde localStorage (envío masivo)
 */
async function migrarTransformadores(req, res) {
  try {
    const { workspaceId } = req.params;
    const usuarioId = req.user.id;
    const { transformadores } = req.body;

    if (!Array.isArray(transformadores) || transformadores.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de transformadores' });
    }

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId, ['admin', 'superadmin']);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para migrar transformadores' });
    }

    // Preparar datos para inserción
    const datosInsertar = transformadores.map(t => ({
      tipo: t.tipo || 'TI',
      nombre: t.nombre?.trim() || 'Sin nombre',
      formula: t.formula?.trim() || 'x',
      descripcion: t.descripcion?.trim() || null,
      workspace_id: workspaceId,
      created_by: usuarioId
    }));

    // Insertar todos
    const { data, error } = await supabase
      .from('transformadores')
      .insert(datosInsertar)
      .select();

    if (error) {
      console.error('Error migrando transformadores:', error);
      return res.status(500).json({ error: 'Error migrando transformadores' });
    }

    res.status(201).json({
      mensaje: `${data.length} transformadores migrados correctamente`,
      transformadores: data
    });

  } catch (err) {
    console.error('Error en migrarTransformadores:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  obtenerTransformadores,
  crearTransformador,
  actualizarTransformador,
  eliminarTransformador,
  migrarTransformadores
};
