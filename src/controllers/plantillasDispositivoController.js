// src/controllers/plantillasDispositivoController.js
// Controlador para CRUD de plantillas de dispositivo (relés y analizadores)

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
// CRUD de Plantillas de Dispositivo
// ============================================

/**
 * GET /api/workspaces/:workspaceId/plantillas-dispositivo
 * Obtiene todas las plantillas del workspace
 * Query params: tipo=rele|analizador (opcional)
 */
async function obtenerPlantillas(req, res) {
  try {
    const { workspaceId } = req.params;
    const { tipo } = req.query;
    const usuarioId = req.user.id;

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos sobre este workspace' });
    }

    // Construir query
    let query = supabase
      .from('plantillas_dispositivo')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('nombre', { ascending: true });

    // Filtrar por tipo si se especifica
    if (tipo && ['rele', 'analizador'].includes(tipo)) {
      query = query.eq('tipo_dispositivo', tipo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo plantillas:', error);
      return res.status(500).json({ error: 'Error obteniendo plantillas' });
    }

    res.json({ plantillas: data || [] });

  } catch (err) {
    console.error('Error en obtenerPlantillas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/plantillas-dispositivo/:id
 * Obtiene una plantilla específica
 */
async function obtenerPlantilla(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = req.user.id;

    // Obtener plantilla
    const { data: plantilla, error } = await supabase
      .from('plantillas_dispositivo')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !plantilla) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, plantilla.workspace_id);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos sobre esta plantilla' });
    }

    res.json({ plantilla });

  } catch (err) {
    console.error('Error en obtenerPlantilla:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/workspaces/:workspaceId/plantillas-dispositivo
 * Crea una nueva plantilla
 */
async function crearPlantilla(req, res) {
  try {
    const { workspaceId } = req.params;
    const usuarioId = req.user.id;
    const {
      tipo_dispositivo,
      nombre,
      descripcion,
      funcionalidades,
      etiquetas_bits,
      plantilla_etiquetas_id
    } = req.body;

    // Validar campos requeridos
    if (!tipo_dispositivo || !nombre) {
      return res.status(400).json({ error: 'Tipo de dispositivo y nombre son requeridos' });
    }

    // Validar tipo
    if (!['rele', 'analizador'].includes(tipo_dispositivo)) {
      return res.status(400).json({ error: 'Tipo debe ser rele o analizador' });
    }

    // Verificar permisos (admin o superior)
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId, ['admin', 'superadmin']);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para crear plantillas' });
    }

    // Crear plantilla
    const { data, error } = await supabase
      .from('plantillas_dispositivo')
      .insert({
        tipo_dispositivo,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        workspace_id: workspaceId,
        funcionalidades: funcionalidades || {},
        etiquetas_bits: etiquetas_bits || {},
        plantilla_etiquetas_id: plantilla_etiquetas_id || null,
        created_by: usuarioId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando plantilla:', error);
      return res.status(500).json({ error: 'Error creando plantilla' });
    }

    res.status(201).json({ plantilla: data });

  } catch (err) {
    console.error('Error en crearPlantilla:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PUT /api/plantillas-dispositivo/:id
 * Actualiza una plantilla existente
 */
async function actualizarPlantilla(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = req.user.id;
    const {
      nombre,
      descripcion,
      funcionalidades,
      etiquetas_bits,
      plantilla_etiquetas_id
    } = req.body;

    // Obtener la plantilla para verificar workspace
    const { data: plantilla, error: errorBuscar } = await supabase
      .from('plantillas_dispositivo')
      .select('workspace_id')
      .eq('id', id)
      .single();

    if (errorBuscar || !plantilla) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, plantilla.workspace_id, ['admin', 'superadmin']);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para editar plantillas' });
    }

    // Preparar datos de actualización
    const datosActualizacion = {};
    if (nombre) datosActualizacion.nombre = nombre.trim();
    if (descripcion !== undefined) datosActualizacion.descripcion = descripcion?.trim() || null;
    if (funcionalidades !== undefined) datosActualizacion.funcionalidades = funcionalidades;
    if (etiquetas_bits !== undefined) datosActualizacion.etiquetas_bits = etiquetas_bits;
    if (plantilla_etiquetas_id !== undefined) datosActualizacion.plantilla_etiquetas_id = plantilla_etiquetas_id;

    // Actualizar
    const { data, error } = await supabase
      .from('plantillas_dispositivo')
      .update(datosActualizacion)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando plantilla:', error);
      return res.status(500).json({ error: 'Error actualizando plantilla' });
    }

    res.json({ plantilla: data });

  } catch (err) {
    console.error('Error en actualizarPlantilla:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE /api/plantillas-dispositivo/:id
 * Elimina una plantilla
 */
async function eliminarPlantilla(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = req.user.id;

    // Obtener la plantilla para verificar workspace
    const { data: plantilla, error: errorBuscar } = await supabase
      .from('plantillas_dispositivo')
      .select('workspace_id')
      .eq('id', id)
      .single();

    if (errorBuscar || !plantilla) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, plantilla.workspace_id, ['admin', 'superadmin']);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar plantillas' });
    }

    // Eliminar
    const { error } = await supabase
      .from('plantillas_dispositivo')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando plantilla:', error);
      return res.status(500).json({ error: 'Error eliminando plantilla' });
    }

    res.json({ mensaje: 'Plantilla eliminada correctamente' });

  } catch (err) {
    console.error('Error en eliminarPlantilla:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/workspaces/:workspaceId/plantillas-dispositivo/migrar
 * Migra plantillas desde localStorage (envío masivo)
 */
async function migrarPlantillas(req, res) {
  try {
    const { workspaceId } = req.params;
    const usuarioId = req.user.id;
    const { plantillas, tipo_dispositivo } = req.body;

    if (!Array.isArray(plantillas) || plantillas.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de plantillas' });
    }

    if (!tipo_dispositivo || !['rele', 'analizador'].includes(tipo_dispositivo)) {
      return res.status(400).json({ error: 'Tipo de dispositivo requerido (rele o analizador)' });
    }

    // Verificar permisos
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId, ['admin', 'superadmin']);
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para migrar plantillas' });
    }

    // Preparar datos para inserción
    const datosInsertar = plantillas.map(p => ({
      tipo_dispositivo,
      nombre: p.nombre?.trim() || 'Sin nombre',
      descripcion: p.descripcion?.trim() || null,
      workspace_id: workspaceId,
      funcionalidades: p.funcionalidades || {},
      etiquetas_bits: p.etiquetasBits || p.etiquetas_bits || {},
      plantilla_etiquetas_id: p.plantillaEtiquetasId || p.plantilla_etiquetas_id || null,
      created_by: usuarioId
    }));

    // Insertar todos
    const { data, error } = await supabase
      .from('plantillas_dispositivo')
      .insert(datosInsertar)
      .select();

    if (error) {
      console.error('Error migrando plantillas:', error);
      return res.status(500).json({ error: 'Error migrando plantillas' });
    }

    res.status(201).json({
      mensaje: `${data.length} plantillas migradas correctamente`,
      plantillas: data
    });

  } catch (err) {
    console.error('Error en migrarPlantillas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  obtenerPlantillas,
  obtenerPlantilla,
  crearPlantilla,
  actualizarPlantilla,
  eliminarPlantilla,
  migrarPlantillas
};
