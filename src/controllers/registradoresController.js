// src/controllers/registradoresController.js
// Controlador para CRUD de registradores y creación de tablas dinámicas

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Verifica si el usuario tiene permisos sobre el workspace
 * @param {string} usuarioId - ID del usuario
 * @param {string} workspaceId - ID del workspace
 * @param {string[]} rolesPermitidos - Array de roles permitidos (opcional, si no se pasa permite cualquier rol)
 * @returns {object} - { tienePermiso: boolean, rol: string|null }
 */
async function verificarPermisoWorkspace(usuarioId, workspaceId, rolesPermitidos = null) {
  // Primero verificar en usuario_workspaces
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

  // Si no tiene permiso en workspace, verificar si es superadmin global
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

/**
 * Sanitiza el nombre para usarlo como nombre de tabla
 * Convierte espacios a guiones bajos, elimina caracteres especiales
 */
function sanitizarNombreTabla(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^a-z0-9_]/g, '_') // Solo letras, números y guiones bajos
    .replace(/_+/g, '_') // Eliminar guiones bajos duplicados
    .replace(/^_|_$/g, ''); // Eliminar guiones bajos al inicio/final
}

/**
 * GET /api/registradores
 * Obtiene todos los registradores del agente vinculado al workspace
 */
async function obtenerRegistradores(req, res) {
  try {
    const { workspaceId } = req.query;
    const usuarioId = req.user.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es requerido' });
    }

    // Verificar permisos (cualquier rol con acceso al workspace)
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId);

    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos sobre este workspace' });
    }

    // Obtener workspace con agente_id
    const { data: workspace, error: errorWorkspace } = await supabase
      .from('workspaces')
      .select('agente_id')
      .eq('id', workspaceId)
      .single();

    if (errorWorkspace || !workspace) {
      return res.status(404).json({ error: 'Workspace no encontrado' });
    }

    if (!workspace.agente_id) {
      return res.json({ registradores: [], mensaje: 'No hay agente vinculado' });
    }

    // Obtener registradores del agente
    const { data: registradores, error: errorRegistradores } = await supabase
      .from('registradores')
      .select('*')
      .eq('agente_id', workspace.agente_id)
      .order('created_at', { ascending: true });

    if (errorRegistradores) {
      console.error('Error obteniendo registradores:', errorRegistradores);
      return res.status(500).json({ error: 'Error obteniendo registradores' });
    }

    res.json({ registradores: registradores || [] });

  } catch (err) {
    console.error('Error en obtenerRegistradores:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/registradores
 * Crea un nuevo registrador y su tabla de lecturas asociada
 */
async function crearRegistrador(req, res) {
  try {
    const { workspaceId, nombre, tipo, ubicacion, ip, puerto, indiceInicial, cantidadRegistros, intervaloSegundos } = req.body;
    const usuarioId = req.user.id;

    // Validaciones
    if (!workspaceId || !nombre || !ip || !puerto || !indiceInicial || !cantidadRegistros) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Verificar permisos (solo superadmin y admin)
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId, ['superadmin', 'admin']);

    if (!tienePermiso) {
      return res.status(403).json({ error: 'Solo administradores pueden crear registradores' });
    }

    // Obtener workspace con agente_id
    const { data: workspace, error: errorWorkspace } = await supabase
      .from('workspaces')
      .select('agente_id')
      .eq('id', workspaceId)
      .single();

    if (errorWorkspace || !workspace || !workspace.agente_id) {
      return res.status(400).json({ error: 'Workspace sin agente vinculado' });
    }

    // Generar nombre de tabla sanitizado
    const nombreTabla = `lecturas_${sanitizarNombreTabla(nombre)}_${Date.now()}`;

    // Log de datos a insertar
    const datosInsertar = {
      agente_id: workspace.agente_id,
      nombre,
      tipo: tipo || null,
      ubicacion: ubicacion || null,
      ip,
      puerto: parseInt(puerto),
      unit_id: 1,
      indice_inicial: parseInt(indiceInicial),
      cantidad_registros: parseInt(cantidadRegistros),
      intervalo_segundos: parseInt(intervaloSegundos) || 60,
      activo: false,
      tabla_lecturas: nombreTabla,
    };
    console.log('Intentando insertar registrador:', JSON.stringify(datosInsertar, null, 2));

    // Crear el registrador
    const { data: registrador, error: errorCrear } = await supabase
      .from('registradores')
      .insert({
        agente_id: workspace.agente_id,
        nombre,
        tipo: tipo || null,
        ubicacion: ubicacion || null,
        ip,
        puerto: parseInt(puerto),
        unit_id: 1, // Default Modbus unit ID
        indice_inicial: parseInt(indiceInicial),
        cantidad_registros: parseInt(cantidadRegistros),
        intervalo_segundos: parseInt(intervaloSegundos) || 60,
        activo: false, // Inicia desactivado
        tabla_lecturas: nombreTabla,
      })
      .select()
      .single();

    if (errorCrear) {
      console.error('Error creando registrador:', JSON.stringify(errorCrear, null, 2));
      return res.status(500).json({
        error: `Error creando registrador: ${errorCrear.message}`,
        codigo: errorCrear.code,
        detalles: errorCrear.details
      });
    }

    // Crear tabla dinámica de lecturas
    const columnas = [];
    for (let i = 0; i < parseInt(cantidadRegistros); i++) {
      const indice = parseInt(indiceInicial) + i;
      columnas.push(`"${indice}" numeric`);
    }

    const sqlCrearTabla = `
      CREATE TABLE IF NOT EXISTS "${nombreTabla}" (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        registrador_id uuid REFERENCES registradores(id) ON DELETE CASCADE,
        timestamp timestamptz DEFAULT now(),
        ${columnas.join(',\n        ')}
      );

      CREATE INDEX IF NOT EXISTS "${nombreTabla}_timestamp_idx" ON "${nombreTabla}" (timestamp DESC);
      CREATE INDEX IF NOT EXISTS "${nombreTabla}_registrador_idx" ON "${nombreTabla}" (registrador_id);
    `;

    const { error: errorTabla } = await supabase.rpc('exec_sql', { sql: sqlCrearTabla });

    if (errorTabla) {
      console.error('Error creando tabla de lecturas:', errorTabla);
      // Si falla la creación de tabla, eliminar el registrador
      await supabase.from('registradores').delete().eq('id', registrador.id);
      return res.status(500).json({
        error: 'Error creando tabla de lecturas. Verifica que la función exec_sql existe en Supabase.',
        detalle: errorTabla.message
      });
    }

    res.status(201).json({
      registrador,
      tablaCreada: nombreTabla,
      columnas: Array.from({ length: parseInt(cantidadRegistros) }, (_, i) => parseInt(indiceInicial) + i)
    });

  } catch (err) {
    console.error('Error en crearRegistrador:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PUT /api/registradores/:id
 * Actualiza un registrador existente
 */
async function actualizarRegistrador(req, res) {
  try {
    const { id } = req.params;
    const { workspaceId, nombre, tipo, ubicacion, ip, puerto, indiceInicial, cantidadRegistros, intervaloSegundos } = req.body;
    const usuarioId = req.user.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es requerido' });
    }

    // Verificar permisos (solo superadmin y admin)
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId, ['superadmin', 'admin']);

    if (!tienePermiso) {
      return res.status(403).json({ error: 'Solo administradores pueden editar registradores' });
    }

    // Actualizar (no permitimos cambiar indice_inicial ni cantidad_registros ya que afectaría la tabla)
    const { data: registrador, error: errorActualizar } = await supabase
      .from('registradores')
      .update({
        nombre,
        tipo,
        ubicacion,
        ip,
        puerto: parseInt(puerto),
        intervalo_segundos: parseInt(intervaloSegundos) || 60,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (errorActualizar) {
      console.error('Error actualizando registrador:', errorActualizar);
      return res.status(500).json({ error: 'Error actualizando registrador' });
    }

    res.json({ registrador });

  } catch (err) {
    console.error('Error en actualizarRegistrador:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE /api/registradores/:id
 * Elimina un registrador y su tabla de lecturas
 */
async function eliminarRegistrador(req, res) {
  try {
    const { id } = req.params;
    const { workspaceId } = req.query;
    const usuarioId = req.user.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es requerido' });
    }

    // Verificar permisos (solo superadmin y admin)
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId, ['superadmin', 'admin']);

    if (!tienePermiso) {
      return res.status(403).json({ error: 'Solo administradores pueden eliminar registradores' });
    }

    // Obtener registrador para saber el nombre de la tabla
    const { data: registrador, error: errorObtener } = await supabase
      .from('registradores')
      .select('tabla_lecturas')
      .eq('id', id)
      .single();

    if (errorObtener || !registrador) {
      return res.status(404).json({ error: 'Registrador no encontrado' });
    }

    // Eliminar tabla de lecturas si existe
    if (registrador.tabla_lecturas) {
      const sqlEliminar = `DROP TABLE IF EXISTS "${registrador.tabla_lecturas}" CASCADE;`;
      await supabase.rpc('exec_sql', { sql: sqlEliminar });
    }

    // Eliminar registrador
    const { error: errorEliminar } = await supabase
      .from('registradores')
      .delete()
      .eq('id', id);

    if (errorEliminar) {
      console.error('Error eliminando registrador:', errorEliminar);
      return res.status(500).json({ error: 'Error eliminando registrador' });
    }

    res.json({ mensaje: 'Registrador eliminado correctamente' });

  } catch (err) {
    console.error('Error en eliminarRegistrador:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/registradores/:id/toggle-activo
 * Activa o desactiva la medición de un registrador
 */
async function toggleActivo(req, res) {
  try {
    const { id } = req.params;
    const { workspaceId, activo } = req.body;
    const usuarioId = req.user.id;

    if (!workspaceId || activo === undefined) {
      return res.status(400).json({ error: 'workspaceId y activo son requeridos' });
    }

    // Verificar permisos (cualquier rol con acceso al workspace puede toggle)
    const { tienePermiso } = await verificarPermisoWorkspace(usuarioId, workspaceId);

    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos sobre este workspace' });
    }

    // Actualizar estado
    const { data: registrador, error: errorActualizar } = await supabase
      .from('registradores')
      .update({
        activo: activo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (errorActualizar) {
      console.error('Error actualizando estado:', errorActualizar);
      return res.status(500).json({ error: 'Error actualizando estado' });
    }

    // El agente detectará el cambio en su próximo polling de config

    res.json({
      registrador,
      mensaje: activo ? 'Medición iniciada' : 'Medición detenida'
    });

  } catch (err) {
    console.error('Error en toggleActivo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/registradores/:id/funcionalidades
 * Obtiene las funcionalidades disponibles de un registrador basándose en su plantilla
 */
async function obtenerFuncionalidadesRegistrador(req, res) {
  const { id } = req.params;

  try {
    // 1. Obtener registrador con su configuración
    const { data: registrador, error: errorReg } = await supabase
      .from('registradores')
      .select(`
        id,
        nombre,
        ip,
        puerto,
        plantilla_id,
        configuracion_completa
      `)
      .eq('id', id)
      .single();

    if (errorReg || !registrador) {
      return res.status(404).json({
        error: 'Registrador no encontrado',
        details: errorReg?.message
      });
    }

    // 2. Verificar que tiene plantilla
    if (!registrador.plantilla_id) {
      return res.json({
        registrador: {
          id: registrador.id,
          nombre: registrador.nombre,
          ip: registrador.ip,
          puerto: registrador.puerto
        },
        plantilla: null,
        funcionalidades: [],
        mensaje: 'El registrador no tiene plantilla configurada'
      });
    }

    // 3. Obtener la plantilla
    const { data: plantilla, error: errorPlantilla } = await supabase
      .from('plantillas_dispositivo')
      .select('id, nombre, tipo_dispositivo, funcionalidades')
      .eq('id', registrador.plantilla_id)
      .single();

    if (errorPlantilla || !plantilla) {
      return res.json({
        registrador: {
          id: registrador.id,
          nombre: registrador.nombre,
          ip: registrador.ip,
          puerto: registrador.puerto
        },
        plantilla: null,
        funcionalidades: [],
        mensaje: 'La plantilla asociada no existe'
      });
    }

    // 4. Obtener funcionalidades activas desde configuracion_completa
    const configCompleta = registrador.configuracion_completa || {};
    const funcionalidadesActivas = configCompleta.funcionalidadesActivas || {};

    // 5. Filtrar y formatear funcionalidades habilitadas
    const funcionalidadesDisponibles = [];

    if (plantilla.funcionalidades) {
      for (const [funcId, func] of Object.entries(plantilla.funcionalidades)) {
        // Solo incluir si está activa en la configuración del registrador
        const funcActiva = funcionalidadesActivas[funcId];
        if (funcActiva && funcActiva.habilitado) {
          funcionalidadesDisponibles.push({
            id: funcId,
            nombre: funcActiva.nombre || func.nombre,
            categoria: func.categoria || 'general',
            registros: (funcActiva.registros || func.registros || []).map(reg => ({
              etiqueta: reg.etiqueta,
              registro: reg.valor,
              transformadorId: reg.transformadorId || null
            }))
          });
        }
      }
    }

    // 6. Responder
    res.json({
      registrador: {
        id: registrador.id,
        nombre: registrador.nombre,
        ip: registrador.ip,
        puerto: registrador.puerto
      },
      plantilla: {
        id: plantilla.id,
        nombre: plantilla.nombre,
        tipo: plantilla.tipo_dispositivo
      },
      funcionalidades: funcionalidadesDisponibles
    });

  } catch (error) {
    console.error('Error obteniendo funcionalidades:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

module.exports = {
  obtenerRegistradores,
  crearRegistrador,
  actualizarRegistrador,
  eliminarRegistrador,
  toggleActivo,
  obtenerFuncionalidadesRegistrador,
};
