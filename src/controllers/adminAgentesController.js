// src/controllers/adminAgentesController.js
// Controlador para gestión de agentes (Panel Superadmin)

const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * Genera una clave secreta para el agente
 */
function generarClaveSecreta() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verifica si el usuario es superadmin
 */
async function esSuperadmin(userId) {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol_id, roles (codigo)')
    .eq('id', userId)
    .single();

  return usuario?.roles?.codigo === 'superadmin';
}

/**
 * Verifica si el usuario es admin o superior
 */
async function esAdminOSuperior(userId) {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol_id, roles (codigo)')
    .eq('id', userId)
    .single();

  return ['superadmin', 'admin'].includes(usuario?.roles?.codigo);
}

// ============================================
// CRUD de Agentes (Solo Superadmin)
// ============================================

/**
 * GET /api/admin/agentes
 * Lista todos los agentes del sistema
 */
async function listarAgentes(req, res) {
  try {
    const userId = req.user.id;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede ver todos los agentes' });
    }

    const { data: agentes, error } = await supabase
      .from('agentes')
      .select(`
        id,
        nombre,
        descripcion,
        activo,
        ultimo_heartbeat,
        version_software,
        ip_ultima_conexion,
        created_at,
        updated_at
      `)
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error listando agentes:', error);
      return res.status(500).json({ error: 'Error obteniendo agentes' });
    }

    // Agregar info de conexión (conectado si heartbeat < 60s)
    const ahora = Date.now();
    const agentesConEstado = agentes.map(a => ({
      ...a,
      conectado: a.ultimo_heartbeat
        ? (ahora - new Date(a.ultimo_heartbeat).getTime()) < 60000
        : false,
    }));

    res.json(agentesConEstado);
  } catch (err) {
    console.error('Error en listarAgentes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/admin/agentes
 * Crea un nuevo agente
 */
async function crearAgente(req, res) {
  try {
    const userId = req.user.id;
    const { nombre, descripcion } = req.body;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede crear agentes' });
    }

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    // Generar clave secreta
    const claveSecreta = generarClaveSecreta();
    const claveHash = await bcrypt.hash(claveSecreta, 10);

    const { data: agente, error } = await supabase
      .from('agentes')
      .insert({
        nombre,
        descripcion: descripcion || null,
        clave_hash: claveHash,
        activo: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando agente:', error);
      return res.status(500).json({ error: 'Error creando agente' });
    }

    // Retornar con la clave en texto plano (solo esta vez)
    res.status(201).json({
      agente: {
        id: agente.id,
        nombre: agente.nombre,
        descripcion: agente.descripcion,
        activo: agente.activo,
        created_at: agente.created_at,
      },
      claveSecreta, // Solo se muestra al crear
      mensaje: 'Guarda esta clave, no se mostrará de nuevo.',
    });
  } catch (err) {
    console.error('Error en crearAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PUT /api/admin/agentes/:id
 * Actualiza un agente
 */
async function actualizarAgente(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { nombre, descripcion, activo } = req.body;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede editar agentes' });
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (activo !== undefined) updateData.activo = activo;

    const { data: agente, error } = await supabase
      .from('agentes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando agente:', error);
      return res.status(500).json({ error: 'Error actualizando agente' });
    }

    res.json(agente);
  } catch (err) {
    console.error('Error en actualizarAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE /api/admin/agentes/:id
 * Elimina un agente
 */
async function eliminarAgente(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede eliminar agentes' });
    }

    // Verificar que no tenga workspaces vinculados
    const { data: vinculaciones } = await supabase
      .from('workspace_agentes')
      .select('id')
      .eq('agente_id', id);

    if (vinculaciones && vinculaciones.length > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar un agente vinculado a workspaces. Desvincúlalo primero.',
        workspacesVinculados: vinculaciones.length,
      });
    }

    const { error } = await supabase
      .from('agentes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando agente:', error);
      return res.status(500).json({ error: 'Error eliminando agente' });
    }

    res.json({ mensaje: 'Agente eliminado correctamente' });
  } catch (err) {
    console.error('Error en eliminarAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/admin/agentes/:id/rotar-clave
 * Rota la clave de un agente
 */
async function rotarClaveAgente(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede rotar claves' });
    }

    // Obtener clave actual
    const { data: agente, error: errorGet } = await supabase
      .from('agentes')
      .select('clave_hash')
      .eq('id', id)
      .single();

    if (errorGet || !agente) {
      return res.status(404).json({ error: 'Agente no encontrado' });
    }

    // Generar nueva clave
    const nuevaClave = generarClaveSecreta();
    const nuevoHash = await bcrypt.hash(nuevaClave, 10);

    // Actualizar: mover actual a anterior, poner nueva
    const { error: errorUpdate } = await supabase
      .from('agentes')
      .update({
        clave_anterior_hash: agente.clave_hash,
        clave_hash: nuevoHash,
        clave_rotada_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (errorUpdate) {
      console.error('Error rotando clave:', errorUpdate);
      return res.status(500).json({ error: 'Error rotando clave' });
    }

    res.json({
      nuevaClave,
      mensaje: 'Clave rotada. La anterior será válida por 24 horas.',
    });
  } catch (err) {
    console.error('Error en rotarClaveAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// Agentes Disponibles (Admin+)
// ============================================

/**
 * GET /api/agentes/disponibles
 * Lista agentes disponibles para vincular (admin+)
 */
async function listarAgentesDisponibles(req, res) {
  try {
    const userId = req.user.id;

    if (!await esAdminOSuperior(userId)) {
      return res.status(403).json({ error: 'Solo admin o superadmin pueden ver agentes disponibles' });
    }

    // Obtener todos los agentes activos
    const { data: agentes, error } = await supabase
      .from('agentes')
      .select(`
        id,
        nombre,
        descripcion,
        activo,
        ultimo_heartbeat,
        created_at
      `)
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error listando agentes disponibles:', error);
      return res.status(500).json({ error: 'Error obteniendo agentes' });
    }

    // Agregar info de conexión
    const ahora = Date.now();
    const agentesConEstado = agentes.map(a => ({
      ...a,
      conectado: a.ultimo_heartbeat
        ? (ahora - new Date(a.ultimo_heartbeat).getTime()) < 60000
        : false,
    }));

    res.json(agentesConEstado);
  } catch (err) {
    console.error('Error en listarAgentesDisponibles:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// Vinculación Workspace-Agente (N:M)
// ============================================

/**
 * GET /api/workspaces/:workspaceId/agentes
 * Lista agentes vinculados a un workspace
 */
async function listarAgentesWorkspace(req, res) {
  try {
    const userId = req.user.id;
    const { workspaceId } = req.params;

    // Verificar acceso al workspace
    const { data: permiso } = await supabase
      .from('usuario_workspaces')
      .select('rol_id, roles (codigo)')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', userId)
      .single();

    // Si no tiene permiso directo, verificar si es superadmin
    if (!permiso) {
      if (!await esSuperadmin(userId)) {
        return res.status(403).json({ error: 'No tienes acceso a este workspace' });
      }
    }

    // Obtener agentes vinculados
    const { data: vinculaciones, error } = await supabase
      .from('workspace_agentes')
      .select(`
        id,
        created_at,
        agentes (
          id,
          nombre,
          descripcion,
          activo,
          ultimo_heartbeat,
          version_software
        )
      `)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error('Error obteniendo agentes del workspace:', error);
      return res.status(500).json({ error: 'Error obteniendo agentes' });
    }

    // Formatear respuesta
    const ahora = Date.now();
    const agentes = vinculaciones.map(v => ({
      vinculacionId: v.id,
      vinculadoEn: v.created_at,
      ...v.agentes,
      conectado: v.agentes.ultimo_heartbeat
        ? (ahora - new Date(v.agentes.ultimo_heartbeat).getTime()) < 60000
        : false,
    }));

    res.json(agentes);
  } catch (err) {
    console.error('Error en listarAgentesWorkspace:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/workspaces/:workspaceId/agentes
 * Vincula un agente a un workspace
 */
async function vincularAgenteWorkspace(req, res) {
  try {
    const userId = req.user.id;
    const { workspaceId } = req.params;
    const { agenteId } = req.body;

    if (!agenteId) {
      return res.status(400).json({ error: 'agenteId es requerido' });
    }

    // Verificar permisos (admin+ en el workspace o superadmin)
    const { data: permiso } = await supabase
      .from('usuario_workspaces')
      .select('rol_id, roles (codigo)')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', userId)
      .single();

    const tienePermiso = permiso && ['superadmin', 'admin'].includes(permiso.roles?.codigo);

    if (!tienePermiso && !await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo admin puede vincular agentes' });
    }

    // Verificar que el agente existe y está activo
    const { data: agente, error: errorAgente } = await supabase
      .from('agentes')
      .select('id, nombre, activo')
      .eq('id', agenteId)
      .single();

    if (errorAgente || !agente) {
      return res.status(404).json({ error: 'Agente no encontrado' });
    }

    if (!agente.activo) {
      return res.status(400).json({ error: 'El agente no está activo' });
    }

    // Verificar que no esté ya vinculado
    const { data: existente } = await supabase
      .from('workspace_agentes')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('agente_id', agenteId)
      .single();

    if (existente) {
      return res.status(400).json({ error: 'Este agente ya está vinculado al workspace' });
    }

    // Crear vinculación
    const { data: vinculacion, error } = await supabase
      .from('workspace_agentes')
      .insert({
        workspace_id: workspaceId,
        agente_id: agenteId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error vinculando agente:', error);
      return res.status(500).json({ error: 'Error vinculando agente' });
    }

    res.status(201).json({
      mensaje: 'Agente vinculado correctamente',
      vinculacion,
      agente,
    });
  } catch (err) {
    console.error('Error en vincularAgenteWorkspace:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE /api/workspaces/:workspaceId/agentes/:agenteId
 * Desvincula un agente de un workspace
 */
async function desvincularAgenteWorkspace(req, res) {
  try {
    const userId = req.user.id;
    const { workspaceId, agenteId } = req.params;

    // Verificar permisos (admin+ en el workspace o superadmin)
    const { data: permiso } = await supabase
      .from('usuario_workspaces')
      .select('rol_id, roles (codigo)')
      .eq('workspace_id', workspaceId)
      .eq('usuario_id', userId)
      .single();

    const tienePermiso = permiso && ['superadmin', 'admin'].includes(permiso.roles?.codigo);

    if (!tienePermiso && !await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo admin puede desvincular agentes' });
    }

    // Eliminar vinculación
    const { error } = await supabase
      .from('workspace_agentes')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('agente_id', agenteId);

    if (error) {
      console.error('Error desvinculando agente:', error);
      return res.status(500).json({ error: 'Error desvinculando agente' });
    }

    res.json({ mensaje: 'Agente desvinculado correctamente' });
  } catch (err) {
    console.error('Error en desvincularAgenteWorkspace:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// Registradores de un Agente (Solo Superadmin)
// ============================================

/**
 * GET /api/agentes/:agenteId/registradores
 * Lista registradores de un agente
 */
async function listarRegistradoresAgente(req, res) {
  try {
    const userId = req.user.id;
    const { agenteId } = req.params;

    // Superadmin puede ver todos, otros solo si el agente está vinculado a un workspace al que tienen acceso
    const esSuperadminUser = await esSuperadmin(userId);

    if (!esSuperadminUser) {
      // Verificar que el usuario tenga acceso a algún workspace vinculado a este agente
      const { data: workspacesUsuario } = await supabase
        .from('usuario_workspaces')
        .select('workspace_id')
        .eq('usuario_id', userId);

      if (!workspacesUsuario || workspacesUsuario.length === 0) {
        return res.status(403).json({ error: 'No tienes acceso a ningún workspace' });
      }

      const workspaceIds = workspacesUsuario.map(w => w.workspace_id);

      const { data: vinculacion } = await supabase
        .from('workspace_agentes')
        .select('id')
        .eq('agente_id', agenteId)
        .in('workspace_id', workspaceIds)
        .limit(1)
        .single();

      if (!vinculacion) {
        return res.status(403).json({ error: 'No tienes acceso a este agente' });
      }
    }

    // Obtener registradores
    const { data: registradores, error } = await supabase
      .from('registradores')
      .select('*')
      .eq('agente_id', agenteId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error obteniendo registradores:', error);
      return res.status(500).json({ error: 'Error obteniendo registradores' });
    }

    res.json(registradores || []);
  } catch (err) {
    console.error('Error en listarRegistradoresAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/agentes/:agenteId/registradores
 * Crea un registrador para un agente (solo superadmin)
 */
async function crearRegistradorAgente(req, res) {
  try {
    const userId = req.user.id;
    const { agenteId } = req.params;
    const { nombre, tipo, ip, puerto, unitId, indiceInicial, cantidadRegistros, intervaloSegundos, alimentadorId } = req.body;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede crear registradores' });
    }

    // Validaciones
    if (!nombre || !ip || !puerto || indiceInicial === undefined || !cantidadRegistros) {
      return res.status(400).json({ error: 'Faltan campos requeridos: nombre, ip, puerto, indiceInicial, cantidadRegistros' });
    }

    // Verificar que el agente existe
    const { data: agente, error: errorAgente } = await supabase
      .from('agentes')
      .select('id, nombre')
      .eq('id', agenteId)
      .single();

    if (errorAgente || !agente) {
      return res.status(404).json({ error: 'Agente no encontrado' });
    }

    // Crear registrador
    const { data: registrador, error: errorCrear } = await supabase
      .from('registradores')
      .insert({
        agente_id: agenteId,
        nombre,
        tipo: tipo || 'modbus',
        ip,
        puerto: parseInt(puerto),
        unit_id: parseInt(unitId) || 1,
        indice_inicial: parseInt(indiceInicial),
        cantidad_registros: parseInt(cantidadRegistros),
        intervalo_segundos: parseInt(intervaloSegundos) || 60,
        alimentador_id: alimentadorId || null,
        activo: false,
      })
      .select()
      .single();

    if (errorCrear) {
      console.error('Error creando registrador:', errorCrear);
      return res.status(500).json({ error: 'Error creando registrador', detalle: errorCrear.message });
    }

    res.status(201).json(registrador);
  } catch (err) {
    console.error('Error en crearRegistradorAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PUT /api/agentes/:agenteId/registradores/:registradorId
 * Actualiza un registrador (solo superadmin)
 */
async function actualizarRegistradorAgente(req, res) {
  try {
    const userId = req.user.id;
    const { agenteId, registradorId } = req.params;
    const { nombre, tipo, ip, puerto, unitId, indiceInicial, cantidadRegistros, intervaloSegundos, activo, alimentadorId } = req.body;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede editar registradores' });
    }

    // Verificar que el registrador pertenece al agente
    const { data: regExistente, error: errorVerificar } = await supabase
      .from('registradores')
      .select('id')
      .eq('id', registradorId)
      .eq('agente_id', agenteId)
      .single();

    if (errorVerificar || !regExistente) {
      return res.status(404).json({ error: 'Registrador no encontrado para este agente' });
    }

    // Construir objeto de actualización
    const updateData = { updated_at: new Date().toISOString() };
    if (nombre !== undefined) updateData.nombre = nombre;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (ip !== undefined) updateData.ip = ip;
    if (puerto !== undefined) updateData.puerto = parseInt(puerto);
    if (unitId !== undefined) updateData.unit_id = parseInt(unitId);
    if (indiceInicial !== undefined) updateData.indice_inicial = parseInt(indiceInicial);
    if (cantidadRegistros !== undefined) updateData.cantidad_registros = parseInt(cantidadRegistros);
    if (intervaloSegundos !== undefined) updateData.intervalo_segundos = parseInt(intervaloSegundos);
    if (activo !== undefined) updateData.activo = activo;
    if (alimentadorId !== undefined) updateData.alimentador_id = alimentadorId || null;

    const { data: registrador, error: errorActualizar } = await supabase
      .from('registradores')
      .update(updateData)
      .eq('id', registradorId)
      .select()
      .single();

    if (errorActualizar) {
      console.error('Error actualizando registrador:', errorActualizar);
      return res.status(500).json({ error: 'Error actualizando registrador' });
    }

    res.json(registrador);
  } catch (err) {
    console.error('Error en actualizarRegistradorAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE /api/agentes/:agenteId/registradores/:registradorId
 * Elimina un registrador (solo superadmin)
 */
async function eliminarRegistradorAgente(req, res) {
  try {
    const userId = req.user.id;
    const { agenteId, registradorId } = req.params;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede eliminar registradores' });
    }

    // Verificar que el registrador pertenece al agente
    const { data: regExistente, error: errorVerificar } = await supabase
      .from('registradores')
      .select('id, nombre')
      .eq('id', registradorId)
      .eq('agente_id', agenteId)
      .single();

    if (errorVerificar || !regExistente) {
      return res.status(404).json({ error: 'Registrador no encontrado para este agente' });
    }

    // Eliminar registrador (las lecturas se eliminan por CASCADE si está configurado)
    const { error: errorEliminar } = await supabase
      .from('registradores')
      .delete()
      .eq('id', registradorId);

    if (errorEliminar) {
      console.error('Error eliminando registrador:', errorEliminar);
      return res.status(500).json({ error: 'Error eliminando registrador' });
    }

    res.json({ mensaje: `Registrador "${regExistente.nombre}" eliminado correctamente` });
  } catch (err) {
    console.error('Error en eliminarRegistradorAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/agentes/:agenteId/registradores/:registradorId/toggle
 * Activa/desactiva un registrador (solo superadmin)
 */
async function toggleRegistradorAgente(req, res) {
  try {
    const userId = req.user.id;
    const { agenteId, registradorId } = req.params;

    if (!await esSuperadmin(userId)) {
      return res.status(403).json({ error: 'Solo superadmin puede cambiar estado de registradores' });
    }

    // Obtener estado actual
    const { data: regExistente, error: errorVerificar } = await supabase
      .from('registradores')
      .select('id, activo, nombre')
      .eq('id', registradorId)
      .eq('agente_id', agenteId)
      .single();

    if (errorVerificar || !regExistente) {
      return res.status(404).json({ error: 'Registrador no encontrado para este agente' });
    }

    // Toggle estado
    const nuevoEstado = !regExistente.activo;
    const { data: registrador, error: errorActualizar } = await supabase
      .from('registradores')
      .update({ activo: nuevoEstado, updated_at: new Date().toISOString() })
      .eq('id', registradorId)
      .select()
      .single();

    if (errorActualizar) {
      console.error('Error actualizando estado:', errorActualizar);
      return res.status(500).json({ error: 'Error actualizando estado' });
    }

    res.json({
      registrador,
      mensaje: nuevoEstado ? 'Registrador activado' : 'Registrador desactivado',
    });
  } catch (err) {
    console.error('Error en toggleRegistradorAgente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  // Admin CRUD
  listarAgentes,
  crearAgente,
  actualizarAgente,
  eliminarAgente,
  rotarClaveAgente,

  // Disponibles para vincular
  listarAgentesDisponibles,

  // Vinculación N:M
  listarAgentesWorkspace,
  vincularAgenteWorkspace,
  desvincularAgenteWorkspace,

  // Registradores
  listarRegistradoresAgente,
  crearRegistradorAgente,
  actualizarRegistradorAgente,
  eliminarRegistradorAgente,
  toggleRegistradorAgente,
};
