// src/routes/index.js
// Archivo principal de rutas

const express = require('express');
const router = express.Router();

const { verificarToken } = require('../middleware/auth');

// Importar controladores
const configuracionesController = require('../controllers/configuracionesController');
const puestosController = require('../controllers/puestosController');
const alimentadoresController = require('../controllers/alimentadoresController');
const permisosController = require('../controllers/permisosController');
const preferenciasController = require('../controllers/preferenciasController');

// ============================================
// Rutas de salud/status
// ============================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Rutas de configuraciones
// ============================================
router.get('/configuraciones', verificarToken, configuracionesController.obtenerConfiguraciones);
router.get('/configuraciones/:id', verificarToken, configuracionesController.obtenerConfiguracion);
router.post('/configuraciones', verificarToken, configuracionesController.crearConfiguracion);
router.put('/configuraciones/:id', verificarToken, configuracionesController.actualizarConfiguracion);
router.delete('/configuraciones/:id', verificarToken, configuracionesController.eliminarConfiguracion);

// ============================================
// Rutas de puestos
// ============================================
router.get('/configuraciones/:configuracionId/puestos', verificarToken, puestosController.obtenerPuestos);
router.post('/configuraciones/:configuracionId/puestos', verificarToken, puestosController.crearPuesto);
router.put('/configuraciones/:configuracionId/puestos/reordenar', verificarToken, puestosController.reordenarPuestos);
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
router.get('/configuraciones/:configuracionId/permisos', verificarToken, permisosController.obtenerPermisos);
router.post('/configuraciones/:configuracionId/permisos', verificarToken, permisosController.agregarPermiso);
router.put('/permisos/:id', verificarToken, permisosController.actualizarPermiso);
router.delete('/permisos/:id', verificarToken, permisosController.eliminarPermiso);

// ============================================
// Rutas de preferencias de usuario
// ============================================
router.get('/configuraciones/:configuracionId/preferencias', verificarToken, preferenciasController.obtenerPreferencias);
router.post('/configuraciones/:configuracionId/preferencias', verificarToken, preferenciasController.guardarPreferencias);
router.patch('/configuraciones/:configuracionId/preferencias', verificarToken, preferenciasController.actualizarPreferencias);
router.delete('/configuraciones/:configuracionId/preferencias', verificarToken, preferenciasController.eliminarPreferencias);

module.exports = router;
