// src/controllers/usuariosController.js
// Controlador para gestionar usuarios

const supabase = require('../config/supabase');

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
        .select('id, nombre, nivel, descripcion')
        .eq('nombre', 'observador')
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
        rolGlobal: rolObservador?.nombre || 'observador',
        nivelRol: rolObservador?.nivel || 4,
        puedeCrearWorkspaces: false,
      });
    }

    if (error) throw error;

    // Determinar permisos basados en el rol global
    const rolNombre = usuario.roles?.nombre || 'observador';
    const nivelRol = usuario.roles?.nivel || 4;
    const puedeCrearWorkspaces = ['superadmin', 'admin'].includes(rolNombre);

    res.json({
      ...usuario,
      rolGlobal: rolNombre,
      nivelRol,
      puedeCrearWorkspaces,
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil de usuario' });
  }
};

module.exports = {
  obtenerPerfil,
};
