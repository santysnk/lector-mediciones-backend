// src/controllers/adminUsuariosController.js
// Controlador para administración de usuarios y permisos de agentes (solo superadmin)

const supabase = require('../config/supabase');

/**
 * Helper: Verifica si el usuario actual es superadmin
 */
async function esSuperadmin(userId) {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('roles(codigo)')
    .eq('id', userId)
    .single();

  return usuario?.roles?.codigo === 'superadmin';
}

/**
 * Listar todos los usuarios (excepto superadmins)
 * GET /api/admin/usuarios
 */
async function listarUsuarios(req, res) {
  try {
    const userId = req.user.id;

    // Verificar que es superadmin
    if (!(await esSuperadmin(userId))) {
      return res.status(403).json({ error: 'Se requiere rol superadmin' });
    }

    // Obtener todos los usuarios con su rol
    const { data: usuarios, error: errorUsuarios } = await supabase
      .from('usuarios')
      .select(`
        id,
        email,
        nombre,
        activo,
        created_at,
        roles (
          id,
          codigo,
          nombre,
          nivel
        )
      `)
      .order('created_at', { ascending: true });

    if (errorUsuarios) {
      console.error('Error obteniendo usuarios:', errorUsuarios);
      return res.status(500).json({ error: 'Error al obtener usuarios' });
    }

    // Filtrar superadmins de la respuesta
    const usuariosFiltrados = usuarios.filter(u => u.roles?.codigo !== 'superadmin');

    // Obtener permisos de agentes para cada usuario
    const { data: permisos, error: errorPermisos } = await supabase
      .from('usuario_agentes')
      .select(`
        usuario_id,
        agente_id,
        acceso_total,
        agentes (
          id,
          nombre,
          activo
        )
      `);

    if (errorPermisos) {
      console.error('Error obteniendo permisos:', errorPermisos);
      // Continuar sin permisos si hay error
    }

    // Mapear permisos a cada usuario
    const usuariosConPermisos = usuariosFiltrados.map(usuario => {
      const permisosUsuario = permisos?.filter(p => p.usuario_id === usuario.id) || [];
      const tieneAccesoTotal = permisosUsuario.some(p => p.acceso_total);

      return {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        activo: usuario.activo,
        rolGlobal: usuario.roles?.codigo || 'observador',
        rolNombre: usuario.roles?.nombre || 'Observador',
        nivelRol: usuario.roles?.nivel || 4,
        permisoAgentes: {
          accesoTotal: tieneAccesoTotal,
          agentes: tieneAccesoTotal
            ? []
            : permisosUsuario
                .filter(p => p.agente_id && p.agentes)
                .map(p => ({
                  id: p.agentes.id,
                  nombre: p.agentes.nombre,
                  activo: p.agentes.activo,
                })),
        },
      };
    });

    res.json(usuariosConPermisos);
  } catch (error) {
    console.error('Error en listarUsuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Cambiar rol global de un usuario
 * PUT /api/admin/usuarios/:id/rol
 * Body: { rolCodigo: 'admin' | 'operador' | 'observador' }
 */
async function cambiarRolUsuario(req, res) {
  try {
    const userId = req.user.id;
    const { id: usuarioId } = req.params;
    const { rolCodigo } = req.body;

    // Verificar que es superadmin
    if (!(await esSuperadmin(userId))) {
      return res.status(403).json({ error: 'Se requiere rol superadmin' });
    }

    // Validar rol
    const rolesPermitidos = ['admin', 'operador', 'observador'];
    if (!rolesPermitidos.includes(rolCodigo)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }

    // Verificar que el usuario objetivo no es superadmin
    const { data: usuarioObjetivo } = await supabase
      .from('usuarios')
      .select('roles(codigo)')
      .eq('id', usuarioId)
      .single();

    if (usuarioObjetivo?.roles?.codigo === 'superadmin') {
      return res.status(400).json({ error: 'No se puede modificar el rol de un superadmin' });
    }

    // Obtener ID del rol por código
    const { data: rol, error: errorRol } = await supabase
      .from('roles')
      .select('id')
      .eq('codigo', rolCodigo)
      .single();

    if (errorRol || !rol) {
      console.error('Error obteniendo rol:', errorRol);
      return res.status(500).json({ error: 'Rol no encontrado' });
    }

    // Actualizar rol del usuario
    const { error: errorUpdate } = await supabase
      .from('usuarios')
      .update({ rol_id: rol.id, updated_at: new Date().toISOString() })
      .eq('id', usuarioId);

    if (errorUpdate) {
      console.error('Error actualizando rol:', errorUpdate);
      return res.status(500).json({ error: 'Error al actualizar rol' });
    }

    console.log(`[AdminUsuarios] Rol de usuario ${usuarioId} cambiado a ${rolCodigo}`);
    res.json({ success: true, rolCodigo });
  } catch (error) {
    console.error('Error en cambiarRolUsuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Actualizar permisos de agentes de un usuario
 * PUT /api/admin/usuarios/:id/agentes
 * Body: { accesoTotal: boolean, agentesIds: string[] }
 */
async function actualizarAgentesUsuario(req, res) {
  try {
    const userId = req.user.id;
    const { id: usuarioId } = req.params;
    const { accesoTotal, agentesIds = [] } = req.body;

    // Verificar que es superadmin
    if (!(await esSuperadmin(userId))) {
      return res.status(403).json({ error: 'Se requiere rol superadmin' });
    }

    // Verificar que el usuario objetivo no es superadmin
    const { data: usuarioObjetivo } = await supabase
      .from('usuarios')
      .select('roles(codigo)')
      .eq('id', usuarioId)
      .single();

    if (usuarioObjetivo?.roles?.codigo === 'superadmin') {
      return res.status(400).json({ error: 'No se puede modificar permisos de un superadmin' });
    }

    // Eliminar permisos existentes del usuario
    const { error: errorDelete } = await supabase
      .from('usuario_agentes')
      .delete()
      .eq('usuario_id', usuarioId);

    if (errorDelete) {
      console.error('Error eliminando permisos:', errorDelete);
      return res.status(500).json({ error: 'Error al eliminar permisos existentes' });
    }

    // Insertar nuevos permisos
    if (accesoTotal) {
      // Acceso a todos los agentes
      const { error: errorInsert } = await supabase
        .from('usuario_agentes')
        .insert({
          usuario_id: usuarioId,
          agente_id: null,
          acceso_total: true,
        });

      if (errorInsert) {
        console.error('Error insertando acceso total:', errorInsert);
        return res.status(500).json({ error: 'Error al guardar permisos' });
      }
    } else if (agentesIds.length > 0) {
      // Agentes específicos
      const registros = agentesIds.map(agenteId => ({
        usuario_id: usuarioId,
        agente_id: agenteId,
        acceso_total: false,
      }));

      const { error: errorInsert } = await supabase
        .from('usuario_agentes')
        .insert(registros);

      if (errorInsert) {
        console.error('Error insertando agentes:', errorInsert);
        return res.status(500).json({ error: 'Error al guardar permisos' });
      }
    }
    // Si accesoTotal=false y agentesIds=[], no se insertan permisos (sin acceso)

    console.log(`[AdminUsuarios] Permisos de usuario ${usuarioId} actualizados: accesoTotal=${accesoTotal}, agentes=${agentesIds.length}`);
    res.json({ success: true, accesoTotal, agentesCount: agentesIds.length });
  } catch (error) {
    console.error('Error en actualizarAgentesUsuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Listar todos los agentes disponibles para asignar
 * GET /api/admin/agentes-disponibles
 */
async function listarAgentesDisponibles(req, res) {
  try {
    const userId = req.user.id;

    // Verificar que es superadmin
    if (!(await esSuperadmin(userId))) {
      return res.status(403).json({ error: 'Se requiere rol superadmin' });
    }

    const { data: agentes, error } = await supabase
      .from('agentes')
      .select('id, nombre, activo')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error obteniendo agentes:', error);
      return res.status(500).json({ error: 'Error al obtener agentes' });
    }

    res.json(agentes || []);
  } catch (error) {
    console.error('Error en listarAgentesDisponibles:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  listarUsuarios,
  cambiarRolUsuario,
  actualizarAgentesUsuario,
  listarAgentesDisponibles,
};
