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

    // Eliminar permisos existentes del usuario (si existen)
    // Primero verificamos si hay permisos existentes
    const { data: permisosExistentes } = await supabase
      .from('usuario_agentes')
      .select('id')
      .eq('usuario_id', usuarioId);

    if (permisosExistentes && permisosExistentes.length > 0) {
      const { error: errorDelete } = await supabase
        .from('usuario_agentes')
        .delete()
        .eq('usuario_id', usuarioId);

      if (errorDelete) {
        console.error('Error eliminando permisos:', errorDelete);
        return res.status(500).json({ error: 'Error al eliminar permisos existentes' });
      }
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

      console.log(`[AdminUsuarios] Insertando permisos:`, JSON.stringify(registros, null, 2));

      const { data: insertedData, error: errorInsert } = await supabase
        .from('usuario_agentes')
        .insert(registros)
        .select();

      if (errorInsert) {
        console.error('Error insertando agentes:', errorInsert);
        console.error('Detalles del error:', JSON.stringify(errorInsert, null, 2));
        return res.status(500).json({ error: 'Error al guardar permisos', detalles: errorInsert.message });
      }

      console.log(`[AdminUsuarios] Permisos insertados:`, JSON.stringify(insertedData, null, 2));
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

/**
 * Obtener detalles completos de un usuario
 * GET /api/admin/usuarios/:id/detalles
 *
 * Retorna:
 * - Workspaces propios con puestos, agentes vinculados y permisos otorgados
 * - Workspaces donde es invitado con rol asignado
 */
async function obtenerDetallesUsuario(req, res) {
  try {
    const userId = req.user.id;
    const { id: usuarioId } = req.params;

    // Verificar que es superadmin
    if (!(await esSuperadmin(userId))) {
      return res.status(403).json({ error: 'Se requiere rol superadmin' });
    }

    // 1. Obtener workspaces propios del usuario (creado_por = ID del creador)
    const { data: workspacesPropios, error: errorWs } = await supabase
      .from('workspaces')
      .select(`
        id,
        nombre,
        created_at
      `)
      .eq('creado_por', usuarioId)
      .order('created_at', { ascending: true });

    if (errorWs) {
      console.error('Error obteniendo workspaces:', errorWs);
      return res.status(500).json({ error: 'Error al obtener workspaces' });
    }

    // 2. Para cada workspace propio, obtener puestos, agentes y permisos
    const workspacesConDetalles = await Promise.all(
      (workspacesPropios || []).map(async (ws) => {
        // Obtener puestos del workspace
        const { data: puestos } = await supabase
          .from('puestos')
          .select('id, nombre')
          .eq('workspace_id', ws.id)
          .order('orden', { ascending: true });

        // Obtener agentes vinculados al workspace
        const { data: agentesVinculados } = await supabase
          .from('workspace_agentes')
          .select(`
            agente_id,
            agentes (
              id,
              nombre,
              activo
            )
          `)
          .eq('workspace_id', ws.id);

        // Obtener permisos otorgados (invitados) en este workspace (usa tabla usuario_workspaces)
        const { data: permisosOtorgados } = await supabase
          .from('usuario_workspaces')
          .select(`
            id,
            rol_id,
            roles (
              id,
              codigo,
              nombre
            ),
            usuarios (
              id,
              nombre,
              email
            )
          `)
          .eq('workspace_id', ws.id);

        return {
          id: ws.id,
          nombre: ws.nombre,
          createdAt: ws.created_at,
          puestos: puestos || [],
          cantidadPuestos: puestos?.length || 0,
          agentes: (agentesVinculados || [])
            .filter(av => av.agentes)
            .map(av => ({
              id: av.agentes.id,
              nombre: av.agentes.nombre,
              activo: av.agentes.activo,
            })),
          invitados: (permisosOtorgados || [])
            .filter(p => p.usuarios)
            .map(p => ({
              id: p.usuarios.id,
              nombre: p.usuarios.nombre,
              email: p.usuarios.email,
              rol: p.roles?.codigo || 'observador',
            })),
        };
      })
    );

    // 3. Obtener workspaces donde el usuario es invitado (usa tabla usuario_workspaces)
    // Nota: workspaces usa creado_por para el propietario, no usuario_id
    const { data: permisosRecibidos, error: errorPermisos } = await supabase
      .from('usuario_workspaces')
      .select(`
        id,
        rol_id,
        workspace_id,
        roles (
          id,
          codigo,
          nombre
        ),
        workspaces (
          id,
          nombre,
          creado_por
        )
      `)
      .eq('usuario_id', usuarioId);

    if (errorPermisos) {
      console.error('Error obteniendo permisos recibidos:', errorPermisos);
    }

    console.log(`[AdminUsuarios] Permisos recibidos para ${usuarioId}:`, JSON.stringify(permisosRecibidos, null, 2));

    // Obtener información de los propietarios de los workspaces
    // IMPORTANTE: Filtrar para excluir workspaces donde el usuario es propietario (creado_por)
    const workspacesComoInvitado = await Promise.all(
      (permisosRecibidos || [])
        .filter(p => p.workspaces && p.workspaces.creado_por !== usuarioId)
        .map(async (p) => {
          // Obtener datos del propietario
          let propietario = null;
          if (p.workspaces.creado_por) {
            const { data: usuarioPropietario } = await supabase
              .from('usuarios')
              .select('id, nombre, email')
              .eq('id', p.workspaces.creado_por)
              .single();
            propietario = usuarioPropietario;
          }

          return {
            id: p.workspaces.id,
            nombre: p.workspaces.nombre,
            rol: p.roles?.codigo || 'observador',
            propietario,
          };
        })
    );

    res.json({
      workspacesPropios: workspacesConDetalles,
      workspacesComoInvitado,
      resumen: {
        totalWorkspacesPropios: workspacesConDetalles.length,
        totalPuestos: workspacesConDetalles.reduce((acc, ws) => acc + ws.cantidadPuestos, 0),
        totalWorkspacesInvitado: workspacesComoInvitado.length,
      },
    });
  } catch (error) {
    console.error('Error en obtenerDetallesUsuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  listarUsuarios,
  cambiarRolUsuario,
  actualizarAgentesUsuario,
  listarAgentesDisponibles,
  obtenerDetallesUsuario,
};
