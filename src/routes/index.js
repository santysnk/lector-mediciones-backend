// src/routes/index.js
// Archivo principal de rutas

const express = require('express');
const router = express.Router();

const { verificarToken } = require('../middleware/auth');

// Importar controladores
const workspacesController = require('../controllers/workspacesController');
const puestosController = require('../controllers/puestosController');
const alimentadoresController = require('../controllers/alimentadoresController');
const permisosController = require('../controllers/permisosController');
const preferenciasController = require('../controllers/preferenciasController');
const lecturasController = require('../controllers/lecturasController');
const testConexionController = require('../controllers/testConexionController');
const agentesController = require('../controllers/agentesController');

// ============================================
// Rutas de salud/status
// ============================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

// ============================================
// Rutas de test de conexión Modbus
// ============================================
router.post('/test-conexion', verificarToken, testConexionController.testConexion);
router.get('/test-conexion/estado', verificarToken, testConexionController.obtenerEstado);

// ============================================
// Rutas de agentes
// ============================================
router.post('/agentes/solicitar-vinculacion', verificarToken, agentesController.solicitarVinculacion);
router.get('/agentes/estado', verificarToken, agentesController.obtenerEstadoVinculacion);
router.post('/agentes/desvincular', verificarToken, agentesController.desvincularAgente);
router.post('/agentes/rotar-clave', verificarToken, agentesController.rotarClave);

module.exports = router;
