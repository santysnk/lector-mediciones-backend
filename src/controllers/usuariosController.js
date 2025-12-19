// src/controllers/usuariosController.js
// Controlador para gestionar usuarios

const supabase = require('../config/supabase');

/**
 * Crear perfil de usuario después del registro en Supabase Auth
 * Se llama desde el frontend después de signUp exitoso
 */
const crearPerfil = async (req, res) => {
  const userId = req.user.id;
  const userEmail = req.user.email;
  const { nombre } = req.body;

  try {
    // Verificar si ya existe el usuario
    const { data: existente } = await supabase
      .from('usuarios')
      .select('id')
      .eq('id', userId)
      .single();

    if (existente) {
      return res.status(409).json({ error: 'El perfil ya existe' });
    }

    // Obtener rol observador por defecto
    const { data: rolObservador, error: errorRol } = await supabase
      .from('roles')
      .select('id, codigo')
      .eq('codigo', 'observador')
      .single();

    if (errorRol) {
      console.error('Error obteniendo rol observador:', errorRol);
    }

    // Crear el perfil del usuario
    const { data: nuevoUsuario, error: errorCrear } = await supabase
      .from('usuarios')
      .insert({
        id: userId,
        email: userEmail,
        nombre: nombre || userEmail.split('@')[0],
        rol_id: rolObservador?.id || null,
        activo: true,
      })
      .select(`
        id,
        email,
        nombre,
        activo,
        rol_id,
        roles (
          id,
          codigo,
          nombre,
          nivel
        ),
        created_at
      `)
      .single();

    if (errorCrear) {
      console.error('Error creando perfil:', errorCrear);
      return res.status(500).json({ error: 'Error al crear perfil de usuario' });
    }

    console.log(`[Usuarios] Perfil creado para: ${userEmail}`);

    res.status(201).json({
      ...nuevoUsuario,
      rolGlobal: nuevoUsuario.roles?.codigo || 'observador',
      nivelRol: nuevoUsuario.roles?.nivel || 4,
      puedeCrearWorkspaces: false,
    });
  } catch (error) {
    console.error('Error en crearPerfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener perfil del usuario autenticado
 * Incluye rol global y permisos
 */
const obtenerPerfil = async (req, res) => {
  const userId = req.user.id;
  const userEmail = req.user.email;

  try {
    // Obtener usuario con su rol global
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select(`
        id,
        email,
        nombre,
        activo,
        rol_id,
        roles (
          id,
          codigo,
          nombre,
          nivel,
          descripcion
        ),
        created_at
      `)
      .eq('id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Usuario no existe en tabla usuarios, crearlo con rol observador
      const { data: rolObservador } = await supabase
        .from('roles')
        .select('id, codigo, nombre, nivel, descripcion')
        .eq('codigo', 'observador')
        .single();

      const { data: nuevoUsuario, error: errorCrear } = await supabase
        .from('usuarios')
        .insert({
          id: userId,
          email: userEmail,
          nombre: userEmail.split('@')[0],
          rol_id: rolObservador?.id,
        })
        .select(`
          id,
          email,
          nombre,
          activo,
          rol_id,
          roles (
            id,
            codigo,
            nombre,
            nivel,
            descripcion
          ),
          created_at
        `)
        .single();

      if (errorCrear) throw errorCrear;

      return res.json({
        ...nuevoUsuario,
        rolGlobal: rolObservador?.codigo || 'observador',
        nivelRol: rolObservador?.nivel || 4,
        puedeCrearWorkspaces: false,
      });
    }

    if (error) throw error;

    // Determinar permisos basados en el rol global (usar codigo, no nombre)
    const rolCodigo = usuario.roles?.codigo || 'observador';
    const nivelRol = usuario.roles?.nivel || 4;
    const puedeCrearWorkspaces = ['superadmin', 'admin'].includes(rolCodigo);

    res.json({
      ...usuario,
      rolGlobal: rolCodigo,
      nivelRol,
      puedeCrearWorkspaces,
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil de usuario' });
  }
};

module.exports = {
  crearPerfil,
  obtenerPerfil,
};
