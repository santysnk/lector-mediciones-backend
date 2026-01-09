// src/controllers/modelosDispositivoController.js
// Controlador para modelos de dispositivo y configuraciones de protección
// Este es principalmente un catálogo de solo lectura

const supabase = require('../config/supabase');

// ============================================
// Modelos de Dispositivo (catálogo)
// ============================================

/**
 * GET /api/modelos-dispositivo
 * Obtiene todos los modelos de dispositivo
 * Query params: tipo=rele|analizador (opcional)
 */
async function obtenerModelos(req, res) {
  try {
    const { tipo } = req.query;

    let query = supabase
      .from('modelos_dispositivo')
      .select('*')
      .order('fabricante', { ascending: true })
      .order('nombre', { ascending: true });

    // Filtrar por tipo si se especifica
    if (tipo && ['rele', 'analizador'].includes(tipo)) {
      query = query.eq('tipo_dispositivo', tipo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo modelos:', error);
      return res.status(500).json({ error: 'Error obteniendo modelos' });
    }

    res.json({ modelos: data || [] });

  } catch (err) {
    console.error('Error en obtenerModelos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/modelos-dispositivo/:id
 * Obtiene un modelo específico con sus configuraciones
 */
async function obtenerModelo(req, res) {
  try {
    const { id } = req.params;

    // Obtener modelo
    const { data: modelo, error: errorModelo } = await supabase
      .from('modelos_dispositivo')
      .select('*')
      .eq('id', id)
      .single();

    if (errorModelo || !modelo) {
      return res.status(404).json({ error: 'Modelo no encontrado' });
    }

    // Obtener configuraciones asociadas (solo para relés)
    let configuraciones = [];
    if (modelo.tipo_dispositivo === 'rele') {
      const { data: configs, error: errorConfigs } = await supabase
        .from('configuraciones_proteccion')
        .select('*')
        .eq('modelo_id', id)
        .order('nombre', { ascending: true });

      if (!errorConfigs) {
        configuraciones = configs || [];
      }
    }

    res.json({
      modelo,
      configuraciones
    });

  } catch (err) {
    console.error('Error en obtenerModelo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// Configuraciones de Protección
// ============================================

/**
 * GET /api/configuraciones-proteccion
 * Obtiene todas las configuraciones de protección
 * Query params: modelo_id (opcional)
 */
async function obtenerConfiguraciones(req, res) {
  try {
    const { modelo_id } = req.query;

    let query = supabase
      .from('configuraciones_proteccion')
      .select(`
        *,
        modelos_dispositivo (
          id,
          nombre,
          fabricante
        )
      `)
      .order('nombre', { ascending: true });

    // Filtrar por modelo si se especifica
    if (modelo_id) {
      query = query.eq('modelo_id', modelo_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo configuraciones:', error);
      return res.status(500).json({ error: 'Error obteniendo configuraciones' });
    }

    res.json({ configuraciones: data || [] });

  } catch (err) {
    console.error('Error en obtenerConfiguraciones:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/configuraciones-proteccion/:id
 * Obtiene una configuración específica
 */
async function obtenerConfiguracion(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('configuraciones_proteccion')
      .select(`
        *,
        modelos_dispositivo (
          id,
          nombre,
          fabricante,
          familia
        )
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    res.json({ configuracion: data });

  } catch (err) {
    console.error('Error en obtenerConfiguracion:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ============================================
// Admin: CRUD de Modelos (solo superadmin)
// ============================================

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
 * POST /api/admin/modelos-dispositivo
 * Crea un nuevo modelo (solo superadmin)
 */
async function crearModelo(req, res) {
  try {
    const usuarioId = req.user.id;

    // Verificar superadmin
    if (!await esSuperadmin(usuarioId)) {
      return res.status(403).json({ error: 'Solo superadmins pueden crear modelos' });
    }

    const { id, tipo_dispositivo, nombre, fabricante, familia, descripcion, icono, capacidades } = req.body;

    // Validar campos requeridos
    if (!id || !tipo_dispositivo || !nombre || !fabricante) {
      return res.status(400).json({ error: 'ID, tipo, nombre y fabricante son requeridos' });
    }

    const { data, error } = await supabase
      .from('modelos_dispositivo')
      .insert({
        id,
        tipo_dispositivo,
        nombre: nombre.trim(),
        fabricante: fabricante.trim(),
        familia: familia?.trim() || null,
        descripcion: descripcion?.trim() || null,
        icono: icono || null,
        capacidades: capacidades || {}
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando modelo:', error);
      return res.status(500).json({ error: 'Error creando modelo' });
    }

    res.status(201).json({ modelo: data });

  } catch (err) {
    console.error('Error en crearModelo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/admin/configuraciones-proteccion
 * Crea una nueva configuración de protección (solo superadmin)
 */
async function crearConfiguracion(req, res) {
  try {
    const usuarioId = req.user.id;

    // Verificar superadmin
    if (!await esSuperadmin(usuarioId)) {
      return res.status(403).json({ error: 'Solo superadmins pueden crear configuraciones' });
    }

    const { id, modelo_id, nombre, descripcion, capacidades, protecciones } = req.body;

    // Validar campos requeridos
    if (!id || !modelo_id || !nombre) {
      return res.status(400).json({ error: 'ID, modelo_id y nombre son requeridos' });
    }

    // Verificar que el modelo existe
    const { data: modelo, error: errorModelo } = await supabase
      .from('modelos_dispositivo')
      .select('id')
      .eq('id', modelo_id)
      .single();

    if (errorModelo || !modelo) {
      return res.status(404).json({ error: 'Modelo no encontrado' });
    }

    const { data, error } = await supabase
      .from('configuraciones_proteccion')
      .insert({
        id,
        modelo_id,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        capacidades: capacidades || {},
        protecciones: protecciones || []
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando configuración:', error);
      return res.status(500).json({ error: 'Error creando configuración' });
    }

    res.status(201).json({ configuracion: data });

  } catch (err) {
    console.error('Error en crearConfiguracion:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  // Lectura (público)
  obtenerModelos,
  obtenerModelo,
  obtenerConfiguraciones,
  obtenerConfiguracion,
  // Admin (solo superadmin)
  crearModelo,
  crearConfiguracion
};
