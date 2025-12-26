// src/routes/index.js
// Archivo principal de rutas

const express = require('express');
const router = express.Router();

const { verificarToken } = require('../middleware/auth');
const { verificarTokenAgente } = require('../middleware/authAgente');

// Importar controladores
const workspacesController = require('../controllers/workspacesController');
const puestosController = require('../controllers/puestosController');
const alimentadoresController = require('../controllers/alimentadoresController');
const permisosController = require('../controllers/permisosController');
const preferenciasController = require('../controllers/preferenciasController');
const lecturasController = require('../controllers/lecturasController');
const testConexionController = require('../controllers/testConexionController');
const agentesController = require('../controllers/agentesController');
const registradoresController = require('../controllers/registradoresController');
const agenteApiController = require('../controllers/agenteApiController');
const usuariosController = require('../controllers/usuariosController');
const adminAgentesController = require('../controllers/adminAgentesController');
const adminUsuariosController = require('../controllers/adminUsuariosController');
const testRegistradorController = require('../controllers/testRegistradorController');

// ============================================
// Rutas de salud/status
// ============================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Rutas de usuarios
// ============================================
router.get('/usuarios/perfil', verificarToken, usuariosController.obtenerPerfil);
router.post('/usuarios/perfil', verificarToken, usuariosController.crearPerfil);

// ============================================
// Rutas de workspaces
// ============================================
router.get('/workspaces', verificarToken, workspacesController.obtenerWorkspaces);
router.get('/workspaces/:id', verificarToken, workspacesController.obtenerWorkspace);
router.post('/workspaces', verificarToken, workspacesController.crearWorkspace);
router.put('/workspaces/:id', verificarToken, workspacesController.actualizarWorkspace);
router.delete('/workspaces/:id', verificarToken, workspacesController.eliminarWorkspace);

// ============================================
// Rutas de puestos
// ============================================
router.get('/workspaces/:workspaceId/puestos', verificarToken, puestosController.obtenerPuestos);
router.post('/workspaces/:workspaceId/puestos', verificarToken, puestosController.crearPuesto);
router.put('/workspaces/:workspaceId/puestos/reordenar', verificarToken, puestosController.reordenarPuestos);
router.put('/puestos/:id', verificarToken, puestosController.actualizarPuesto);
router.delete('/puestos/:id', verificarToken, puestosController.eliminarPuesto);

// ============================================
// Rutas de alimentadores
// ============================================
router.get('/puestos/:puestoId/alimentadores', verificarToken, alimentadoresController.obtenerAlimentadores);
router.post('/puestos/:puestoId/alimentadores', verificarToken, alimentadoresController.crearAlimentador);
router.put('/puestos/:puestoId/alimentadores/reordenar', verificarToken, alimentadoresController.reordenarAlimentadores);
router.put('/alimentadores/:id', verificarToken, alimentadoresController.actualizarAlimentador);
router.put('/alimentadores/:id/mover', verificarToken, alimentadoresController.moverAlimentador);
router.delete('/alimentadores/:id', verificarToken, alimentadoresController.eliminarAlimentador);

// ============================================
// Rutas de permisos
// ============================================
router.get('/workspaces/:workspaceId/permisos', verificarToken, permisosController.obtenerPermisos);
router.post('/workspaces/:workspaceId/permisos', verificarToken, permisosController.agregarPermiso);
router.put('/permisos/:id', verificarToken, permisosController.actualizarPermiso);
router.delete('/permisos/:id', verificarToken, permisosController.eliminarPermiso);

// ============================================
// Rutas de preferencias de usuario
// ============================================
router.get('/workspaces/:workspaceId/preferencias', verificarToken, preferenciasController.obtenerPreferencias);
router.post('/workspaces/:workspaceId/preferencias', verificarToken, preferenciasController.guardarPreferencias);
router.patch('/workspaces/:workspaceId/preferencias', verificarToken, preferenciasController.actualizarPreferencias);
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
// Rutas de test de conexión Modbus
// ============================================
router.post('/test-conexion', verificarToken, testConexionController.testConexion);
router.get('/test-conexion/estado', verificarToken, testConexionController.obtenerEstado);

// ============================================
// Rutas de agentes (legacy - mantener por compatibilidad)
// ============================================
router.post('/agentes/solicitar-vinculacion', verificarToken, agentesController.solicitarVinculacion);
router.get('/agentes/estado', verificarToken, agentesController.obtenerEstadoVinculacion);
router.post('/agentes/desvincular', verificarToken, agentesController.desvincularAgente);
router.post('/agentes/rotar-clave', verificarToken, agentesController.rotarClave);

// ============================================
// Rutas de agentes (nueva arquitectura N:M)
// ============================================
// Panel Admin - CRUD de agentes (solo superadmin)
router.get('/admin/agentes', verificarToken, adminAgentesController.listarAgentes);
router.post('/admin/agentes', verificarToken, adminAgentesController.crearAgente);
router.put('/admin/agentes/:id', verificarToken, adminAgentesController.actualizarAgente);
router.delete('/admin/agentes/:id', verificarToken, adminAgentesController.eliminarAgente);
router.post('/admin/agentes/:id/rotar-clave', verificarToken, adminAgentesController.rotarClaveAgente);

// Agentes disponibles para vincular (admin+)
router.get('/agentes/disponibles', verificarToken, adminAgentesController.listarAgentesDisponibles);

// Vinculación workspace-agente (N:M)
router.get('/workspaces/:workspaceId/agentes', verificarToken, adminAgentesController.listarAgentesWorkspace);
router.post('/workspaces/:workspaceId/agentes', verificarToken, adminAgentesController.vincularAgenteWorkspace);
router.delete('/workspaces/:workspaceId/agentes/:agenteId', verificarToken, adminAgentesController.desvincularAgenteWorkspace);

// Registradores de un agente específico (CRUD - solo superadmin)
router.get('/agentes/:agenteId/registradores', verificarToken, adminAgentesController.listarRegistradoresAgente);
router.post('/agentes/:agenteId/registradores', verificarToken, adminAgentesController.crearRegistradorAgente);
router.put('/agentes/:agenteId/registradores/:registradorId', verificarToken, adminAgentesController.actualizarRegistradorAgente);
router.delete('/agentes/:agenteId/registradores/:registradorId', verificarToken, adminAgentesController.eliminarRegistradorAgente);
router.post('/agentes/:agenteId/registradores/:registradorId/toggle', verificarToken, adminAgentesController.toggleRegistradorAgente);

// Test de conexión de registrador (superadmin solicita, agente ejecuta)
router.post('/agentes/:agenteId/test-registrador', verificarToken, testRegistradorController.solicitarTest);
router.get('/agentes/:agenteId/test-registrador/:testId', verificarToken, testRegistradorController.consultarTest);

// ============================================
// Rutas de administración de usuarios (solo superadmin)
// ============================================
router.get('/admin/usuarios', verificarToken, adminUsuariosController.listarUsuarios);
router.get('/admin/usuarios/:id/detalles', verificarToken, adminUsuariosController.obtenerDetallesUsuario);
router.put('/admin/usuarios/:id/rol', verificarToken, adminUsuariosController.cambiarRolUsuario);
router.put('/admin/usuarios/:id/agentes', verificarToken, adminUsuariosController.actualizarAgentesUsuario);
router.get('/admin/agentes-disponibles', verificarToken, adminUsuariosController.listarAgentesDisponibles);

// ============================================
// Rutas de registradores
// ============================================
router.get('/registradores', verificarToken, registradoresController.obtenerRegistradores);
router.post('/registradores', verificarToken, registradoresController.crearRegistrador);
router.put('/registradores/:id', verificarToken, registradoresController.actualizarRegistrador);
router.delete('/registradores/:id', verificarToken, registradoresController.eliminarRegistrador);
router.post('/registradores/:id/toggle-activo', verificarToken, registradoresController.toggleActivo);
router.post('/registradores/test-conexion', verificarToken, registradoresController.testConexion);

// ============================================
// Rutas REST para agentes (reemplaza WebSocket)
// ============================================
// Sin autenticación (el agente se autentica con clave secreta)
router.post('/agente/auth', agenteApiController.autenticar);

// Con autenticación JWT del agente
router.post('/agente/heartbeat', verificarTokenAgente, agenteApiController.heartbeat);
router.get('/agente/config', verificarTokenAgente, agenteApiController.obtenerConfiguracion);
router.post('/agente/lecturas', verificarTokenAgente, agenteApiController.enviarLecturas);
router.post('/agente/log', verificarTokenAgente, agenteApiController.enviarLog);
router.post('/agente/vincular', verificarTokenAgente, agenteApiController.vincular);

// Tests de registrador (el agente consulta y reporta)
router.get('/agente/tests-pendientes', verificarTokenAgente, testRegistradorController.obtenerTestsPendientes);
router.post('/agente/tests/:testId/resultado', verificarTokenAgente, testRegistradorController.reportarResultadoTest);

module.exports = router;
