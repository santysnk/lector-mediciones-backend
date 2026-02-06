// src/routes/index.js
// Archivo principal de rutas

const express = require('express');
const router = express.Router();

const { verificarToken } = require('../middleware/auth');
const { verificarTokenAgente } = require('../middleware/authAgente');
const { rateLimitAuth, rateLimitAgente, rateLimitPing } = require('../middleware/rateLimiter');
const { validar } = require('../middleware/validar');

// Importar esquemas de validación
const { esquemaCrearPerfil, esquemaActualizarWorkspaceDefault } = require('../esquemas/usuarios');
const { esquemaCrearWorkspace, esquemaActualizarWorkspace } = require('../esquemas/workspaces');
const { esquemaCrearPuesto, esquemaActualizarPuesto, esquemaReordenarPuestos } = require('../esquemas/puestos');
const { esquemaCrearAlimentador, esquemaActualizarAlimentador, esquemaReordenarAlimentadores, esquemaMoverAlimentador } = require('../esquemas/alimentadores');
const { esquemaAgregarPermiso, esquemaActualizarPermiso } = require('../esquemas/permisos');
const { esquemaGuardarPreferencias, esquemaActualizarPreferencias } = require('../esquemas/preferencias');
const { esquemaRegistrarDispositivo } = require('../esquemas/dispositivos');
const { esquemaSolicitarVinculacion, esquemaDesvincularAgente, esquemaRotarClave } = require('../esquemas/agentesLegacy');
const { esquemaCrearAgente, esquemaActualizarAgente, esquemaVincularAgenteWorkspace, esquemaCrearRegistradorAgente, esquemaActualizarRegistradorAgente } = require('../esquemas/adminAgentes');
const { esquemaCambiarRolUsuario, esquemaActualizarAgentesUsuario } = require('../esquemas/adminUsuarios');
const { esquemaCrearRegistrador, esquemaActualizarRegistrador, esquemaToggleActivo } = require('../esquemas/registradores');
const { esquemaSolicitarTest, esquemaSolicitarTestCoils, esquemaReportarResultadoTest } = require('../esquemas/testRegistrador');
const { esquemaCrearTransformador, esquemaActualizarTransformador, esquemaMigrarTransformadores } = require('../esquemas/transformadores');
const { esquemaCrearPlantilla, esquemaActualizarPlantilla, esquemaMigrarPlantillas } = require('../esquemas/plantillasDispositivo');
const { esquemaCrearModelo, esquemaCrearConfiguracion } = require('../esquemas/modelosDispositivo');
const { esquemaAuth, esquemaHeartbeat, esquemaLecturas, esquemaLog, esquemaVincular } = require('../esquemas/agente');

// Importar controladores
const workspacesController = require('../controllers/workspacesController');
const puestosController = require('../controllers/puestosController');
const alimentadoresController = require('../controllers/alimentadoresController');
const permisosController = require('../controllers/permisosController');
const preferenciasController = require('../controllers/preferenciasController');
const lecturasController = require('../controllers/lecturasController');
const agentesController = require('../controllers/agentesController');
const registradoresController = require('../controllers/registradoresController');
const agenteApiController = require('../controllers/agenteApiController');
const usuariosController = require('../controllers/usuariosController');
const adminAgentesController = require('../controllers/adminAgentesController');
const adminUsuariosController = require('../controllers/adminUsuariosController');
const testRegistradorController = require('../controllers/testRegistradorController');
const sseController = require('../controllers/sseController');
const dispositivosController = require('../controllers/dispositivosController');
const transformadoresController = require('../controllers/transformadoresController');
const plantillasDispositivoController = require('../controllers/plantillasDispositivoController');
const modelosDispositivoController = require('../controllers/modelosDispositivoController');

// ============================================
// Rutas de salud/status
// ============================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Endpoint de diagnóstico temporal (ELIMINAR DESPUÉS)
// ============================================
const supabase = require('../config/supabase');
router.get('/debug/usuario-agentes', async (req, res) => {
  try {
    // Intentar leer de la tabla
    const { data, error, count } = await supabase
      .from('usuario_agentes')
      .select('*', { count: 'exact' })
      .limit(5);

    if (error) {
      return res.json({
        tablaExiste: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        }
      });
    }

    // Intentar un insert de prueba (que fallaría por FK si no hay datos válidos)
    const { error: insertError } = await supabase
      .from('usuario_agentes')
      .insert({ usuario_id: '00000000-0000-0000-0000-000000000000', agente_id: null, acceso_total: true })
      .select();

    res.json({
      tablaExiste: true,
      registrosActuales: count,
      muestraDatos: data,
      testInsert: insertError ? {
        code: insertError.code,
        message: insertError.message,
        hint: insertError.hint
      } : 'Insert funcionaría (no ejecutado realmente)'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Rutas de usuarios
// ============================================
router.get('/usuarios/perfil', verificarToken, usuariosController.obtenerPerfil);
router.post('/usuarios/perfil', verificarToken, validar(esquemaCrearPerfil), usuariosController.crearPerfil);
router.put('/usuarios/workspace-default', verificarToken, validar(esquemaActualizarWorkspaceDefault), usuariosController.actualizarWorkspaceDefault);

// ============================================
// Rutas de workspaces
// ============================================
router.get('/workspaces', verificarToken, workspacesController.obtenerWorkspaces);
router.get('/workspaces/:id', verificarToken, workspacesController.obtenerWorkspace);
router.post('/workspaces', verificarToken, validar(esquemaCrearWorkspace), workspacesController.crearWorkspace);
router.put('/workspaces/:id', verificarToken, validar(esquemaActualizarWorkspace), workspacesController.actualizarWorkspace);
router.delete('/workspaces/:id', verificarToken, workspacesController.eliminarWorkspace);

// ============================================
// Rutas de puestos
// ============================================
router.get('/workspaces/:workspaceId/puestos', verificarToken, puestosController.obtenerPuestos);
router.post('/workspaces/:workspaceId/puestos', verificarToken, validar(esquemaCrearPuesto), puestosController.crearPuesto);
router.put('/workspaces/:workspaceId/puestos/reordenar', verificarToken, validar(esquemaReordenarPuestos), puestosController.reordenarPuestos);
router.put('/puestos/:id', verificarToken, validar(esquemaActualizarPuesto), puestosController.actualizarPuesto);
router.delete('/puestos/:id', verificarToken, puestosController.eliminarPuesto);

// ============================================
// Rutas de alimentadores
// ============================================
router.get('/puestos/:puestoId/alimentadores', verificarToken, alimentadoresController.obtenerAlimentadores);
router.post('/puestos/:puestoId/alimentadores', verificarToken, validar(esquemaCrearAlimentador), alimentadoresController.crearAlimentador);
router.put('/puestos/:puestoId/alimentadores/reordenar', verificarToken, validar(esquemaReordenarAlimentadores), alimentadoresController.reordenarAlimentadores);
router.put('/alimentadores/:id', verificarToken, validar(esquemaActualizarAlimentador), alimentadoresController.actualizarAlimentador);
router.put('/alimentadores/:id/mover', verificarToken, validar(esquemaMoverAlimentador), alimentadoresController.moverAlimentador);
router.delete('/alimentadores/:id', verificarToken, alimentadoresController.eliminarAlimentador);

// ============================================
// Rutas de permisos
// ============================================
router.get('/workspaces/:workspaceId/permisos', verificarToken, permisosController.obtenerPermisos);
router.post('/workspaces/:workspaceId/permisos', verificarToken, validar(esquemaAgregarPermiso), permisosController.agregarPermiso);
router.put('/permisos/:id', verificarToken, validar(esquemaActualizarPermiso), permisosController.actualizarPermiso);
router.delete('/permisos/:id', verificarToken, permisosController.eliminarPermiso);

// ============================================
// Rutas de preferencias de usuario
// ============================================
router.get('/workspaces/:workspaceId/preferencias', verificarToken, preferenciasController.obtenerPreferencias);
router.post('/workspaces/:workspaceId/preferencias', verificarToken, validar(esquemaGuardarPreferencias), preferenciasController.guardarPreferencias);
router.patch('/workspaces/:workspaceId/preferencias', verificarToken, validar(esquemaActualizarPreferencias), preferenciasController.actualizarPreferencias);
router.delete('/workspaces/:workspaceId/preferencias', verificarToken, preferenciasController.eliminarPreferencias);

// ============================================
// Rutas de lecturas
// ============================================
router.get('/alimentadores/:alimentadorId/lecturas', verificarToken, lecturasController.obtenerUltimasLecturas);
router.get('/alimentadores/:alimentadorId/lecturas/historico', verificarToken, lecturasController.obtenerLecturasHistoricas);
router.get('/workspaces/:workspaceId/lecturas/ultima', verificarToken, lecturasController.obtenerUltimaLecturaPorWorkspace);
router.get('/registradores/:registradorId/lecturas', verificarToken, lecturasController.obtenerUltimasLecturasPorRegistrador);
router.get('/registradores/:registradorId/lecturas/historico', verificarToken, lecturasController.obtenerLecturasHistoricasPorRegistrador);

// ============================================
// Rutas de dispositivos (Push Notifications)
// ============================================
router.post('/dispositivos/registrar', verificarToken, validar(esquemaRegistrarDispositivo), dispositivosController.registrarDispositivo);
router.delete('/dispositivos/desregistrar', verificarToken, dispositivosController.desregistrarDispositivo);
router.get('/dispositivos', verificarToken, dispositivosController.obtenerDispositivos);

// ============================================
// Rutas de agentes (legacy - mantener por compatibilidad)
// ============================================
router.post('/agentes/solicitar-vinculacion', verificarToken, validar(esquemaSolicitarVinculacion), agentesController.solicitarVinculacion);
router.get('/agentes/estado', verificarToken, agentesController.obtenerEstadoVinculacion);
router.post('/agentes/desvincular', verificarToken, validar(esquemaDesvincularAgente), agentesController.desvincularAgente);
router.post('/agentes/rotar-clave', verificarToken, validar(esquemaRotarClave), agentesController.rotarClave);

// ============================================
// Rutas de agentes (nueva arquitectura N:M)
// ============================================
// Panel Admin - CRUD de agentes (solo superadmin)
router.get('/admin/agentes', verificarToken, adminAgentesController.listarAgentes);
router.post('/admin/agentes', verificarToken, validar(esquemaCrearAgente), adminAgentesController.crearAgente);
router.put('/admin/agentes/:id', verificarToken, validar(esquemaActualizarAgente), adminAgentesController.actualizarAgente);
router.delete('/admin/agentes/:id', verificarToken, adminAgentesController.eliminarAgente);
router.post('/admin/agentes/:id/rotar-clave', verificarToken, adminAgentesController.rotarClaveAgente);

// Agentes disponibles para vincular (admin+)
router.get('/agentes/disponibles', verificarToken, adminAgentesController.listarAgentesDisponibles);

// Vinculación workspace-agente (N:M)
router.get('/workspaces/:workspaceId/agentes', verificarToken, adminAgentesController.listarAgentesWorkspace);
router.post('/workspaces/:workspaceId/agentes', verificarToken, validar(esquemaVincularAgenteWorkspace), adminAgentesController.vincularAgenteWorkspace);
router.delete('/workspaces/:workspaceId/agentes/:agenteId', verificarToken, adminAgentesController.desvincularAgenteWorkspace);

// Registradores de un agente específico (CRUD - solo superadmin)
router.get('/agentes/:agenteId/registradores', verificarToken, adminAgentesController.listarRegistradoresAgente);
router.post('/agentes/:agenteId/registradores', verificarToken, validar(esquemaCrearRegistradorAgente), adminAgentesController.crearRegistradorAgente);
router.put('/agentes/:agenteId/registradores/:registradorId', verificarToken, validar(esquemaActualizarRegistradorAgente), adminAgentesController.actualizarRegistradorAgente);
router.delete('/agentes/:agenteId/registradores/:registradorId', verificarToken, adminAgentesController.eliminarRegistradorAgente);
router.post('/agentes/:agenteId/registradores/:registradorId/toggle', verificarToken, adminAgentesController.toggleRegistradorAgente);

// Test de conexión de registrador (superadmin solicita, agente ejecuta)
router.post('/agentes/:agenteId/test-registrador', verificarToken, validar(esquemaSolicitarTest), testRegistradorController.solicitarTest);
router.post('/agentes/:agenteId/test-coils', verificarToken, validar(esquemaSolicitarTestCoils), testRegistradorController.solicitarTestCoils);
router.get('/agentes/:agenteId/test-registrador/:testId', verificarToken, testRegistradorController.consultarTest);

// ============================================
// Rutas de administración de usuarios (solo superadmin)
// ============================================
router.get('/admin/usuarios', verificarToken, adminUsuariosController.listarUsuarios);
router.get('/admin/usuarios/:id/detalles', verificarToken, adminUsuariosController.obtenerDetallesUsuario);
router.put('/admin/usuarios/:id/rol', verificarToken, validar(esquemaCambiarRolUsuario), adminUsuariosController.cambiarRolUsuario);
router.put('/admin/usuarios/:id/agentes', verificarToken, validar(esquemaActualizarAgentesUsuario), adminUsuariosController.actualizarAgentesUsuario);
router.get('/admin/agentes-disponibles', verificarToken, adminUsuariosController.listarAgentesDisponibles);

// ============================================
// Rutas de registradores
// ============================================
router.get('/registradores', verificarToken, registradoresController.obtenerRegistradores);
router.post('/registradores', verificarToken, validar(esquemaCrearRegistrador), registradoresController.crearRegistrador);
router.put('/registradores/:id', verificarToken, validar(esquemaActualizarRegistrador), registradoresController.actualizarRegistrador);
router.delete('/registradores/:id', verificarToken, registradoresController.eliminarRegistrador);
router.post('/registradores/:id/toggle-activo', verificarToken, validar(esquemaToggleActivo), registradoresController.toggleActivo);
router.get('/registradores/:id/funcionalidades', verificarToken, registradoresController.obtenerFuncionalidadesRegistrador);

// ============================================
// Rutas REST para agentes
// ============================================
// Sin autenticación
router.get('/agente/ping', rateLimitPing, agenteApiController.ping);
router.post('/agente/auth', rateLimitAuth, validar(esquemaAuth), agenteApiController.autenticar);

// Con autenticación JWT del agente
router.post('/agente/heartbeat', verificarTokenAgente, rateLimitAgente, validar(esquemaHeartbeat), agenteApiController.heartbeat);
router.get('/agente/config', verificarTokenAgente, rateLimitAgente, agenteApiController.obtenerConfiguracion);
router.post('/agente/lecturas', verificarTokenAgente, rateLimitAgente, validar(esquemaLecturas), agenteApiController.enviarLecturas);
router.post('/agente/log', verificarTokenAgente, rateLimitAgente, validar(esquemaLog), agenteApiController.enviarLog);
router.post('/agente/vincular', verificarTokenAgente, validar(esquemaVincular), agenteApiController.vincular);

// SSE para recibir comandos en tiempo real
router.get('/agente/eventos', verificarTokenAgente, sseController.conectarSSE);

// Tests de registrador (el agente reporta resultado)
router.post('/agente/tests/:testId/resultado', verificarTokenAgente, validar(esquemaReportarResultadoTest), testRegistradorController.reportarResultadoTest);

// ============================================
// Rutas de transformadores (TI/TV)
// ============================================
router.get('/workspaces/:workspaceId/transformadores', verificarToken, transformadoresController.obtenerTransformadores);
router.post('/workspaces/:workspaceId/transformadores', verificarToken, validar(esquemaCrearTransformador), transformadoresController.crearTransformador);
router.post('/workspaces/:workspaceId/transformadores/migrar', verificarToken, validar(esquemaMigrarTransformadores), transformadoresController.migrarTransformadores);
router.put('/transformadores/:id', verificarToken, validar(esquemaActualizarTransformador), transformadoresController.actualizarTransformador);
router.delete('/transformadores/:id', verificarToken, transformadoresController.eliminarTransformador);

// ============================================
// Rutas de plantillas de dispositivo (Relés y Analizadores)
// ============================================
router.get('/workspaces/:workspaceId/plantillas-dispositivo', verificarToken, plantillasDispositivoController.obtenerPlantillas);
router.post('/workspaces/:workspaceId/plantillas-dispositivo', verificarToken, validar(esquemaCrearPlantilla), plantillasDispositivoController.crearPlantilla);
router.post('/workspaces/:workspaceId/plantillas-dispositivo/migrar', verificarToken, validar(esquemaMigrarPlantillas), plantillasDispositivoController.migrarPlantillas);
router.get('/plantillas-dispositivo/:id', verificarToken, plantillasDispositivoController.obtenerPlantilla);
router.put('/plantillas-dispositivo/:id', verificarToken, validar(esquemaActualizarPlantilla), plantillasDispositivoController.actualizarPlantilla);
router.delete('/plantillas-dispositivo/:id', verificarToken, plantillasDispositivoController.eliminarPlantilla);

// ============================================
// Rutas de modelos de dispositivo (Catálogo - lectura)
// ============================================
router.get('/modelos-dispositivo', verificarToken, modelosDispositivoController.obtenerModelos);
router.get('/modelos-dispositivo/:id', verificarToken, modelosDispositivoController.obtenerModelo);

// ============================================
// Rutas de configuraciones de protección (Catálogo - lectura)
// ============================================
router.get('/configuraciones-proteccion', verificarToken, modelosDispositivoController.obtenerConfiguraciones);
router.get('/configuraciones-proteccion/:id', verificarToken, modelosDispositivoController.obtenerConfiguracion);

// ============================================
// Admin: Modelos y configuraciones (solo superadmin)
// ============================================
router.post('/admin/modelos-dispositivo', verificarToken, validar(esquemaCrearModelo), modelosDispositivoController.crearModelo);
router.post('/admin/configuraciones-proteccion', verificarToken, validar(esquemaCrearConfiguracion), modelosDispositivoController.crearConfiguracion);

module.exports = router;
