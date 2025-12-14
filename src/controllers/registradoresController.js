// src/controllers/registradoresController.js
// Controlador para CRUD de registradores y creación de tablas dinámicas

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // Verificar permisos
    const { data: permiso, error: errorPermiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (errorPermiso || !permiso) {
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

    // Verificar permisos (solo admin)
    const { data: permiso, error: errorPermiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (errorPermiso || !permiso || permiso.rol !== 'admin') {
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
      console.error('Error creando registrador:', errorCrear);
      return res.status(500).json({ error: `Error creando registrador: ${errorCrear.message}` });
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

    // Verificar permisos (solo admin)
    const { data: permiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (!permiso || permiso.rol !== 'admin') {
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

    // Verificar permisos (solo admin)
    const { data: permiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (!permiso || permiso.rol !== 'admin') {
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

    // Verificar permisos
    const { data: permiso } = await supabase
      .from('permisos_configuracion')
      .select('rol')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', usuarioId)
      .single();

    if (!permiso) {
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
 * POST /api/registradores/test-conexion
 * Prueba la conexión Modbus a un registrador via el agente conectado por WebSocket
 * Reutiliza la lógica de testConexionController con rate limiting de 60s por IP
 */
async function testConexion(req, res) {
  try {
    const { ip, puerto, indiceInicial, cantidadRegistros, unitId = 1 } = req.body;

    if (!ip || !puerto || indiceInicial === undefined || !cantidadRegistros) {
      return res.status(400).json({ error: 'Faltan parámetros de conexión' });
    }

    // Importar la lógica de test conexión existente (que usa WebSocket al agente)
    const testConexionController = require('./testConexionController');

    // Crear un req simulado para reutilizar la lógica
    const reqSimulado = {
      body: {
        ip,
        puerto: parseInt(puerto),
        unitId: parseInt(unitId),
        indiceInicial: parseInt(indiceInicial),
        cantRegistros: parseInt(cantidadRegistros),
      }
    };

    // Llamar al controlador existente que maneja todo: rate limiting, WebSocket, etc.
    await testConexionController.testConexion(reqSimulado, res);

  } catch (err) {
    console.error('Error en testConexion registradores:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}

module.exports = {
  obtenerRegistradores,
  crearRegistrador,
  actualizarRegistrador,
  eliminarRegistrador,
  toggleActivo,
  testConexion,
};
