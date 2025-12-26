// src/index.js
// Punto de entrada del backend

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// Configuración CORS
// ============================================

// Orígenes permitidos para CORS
const origensPermitidos = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:4173', // Vite preview
];

// Agregar frontend en producción si está configurado
if (process.env.FRONTEND_URL) {
  // Soportar múltiples URLs separadas por coma
  const urls = process.env.FRONTEND_URL.split(',').map(url => url.trim());
  origensPermitidos.push(...urls);
}

// En producción (Render), permitir cualquier origen en desarrollo
// Esto se puede configurar con CORS_ALLOW_ALL=true en variables de entorno
if (process.env.CORS_ALLOW_ALL === 'true') {
  console.log('[CORS] Modo permisivo activado - aceptando todos los orígenes');
}

// ============================================
// Middlewares
// ============================================

// CORS - permitir requests desde el frontend
app.use(cors({
  origin: process.env.CORS_ALLOW_ALL === 'true' ? true : origensPermitidos,
  credentials: true,
}));

// Log de orígenes permitidos al iniciar
console.log('[CORS] Orígenes permitidos:', process.env.CORS_ALLOW_ALL === 'true' ? 'TODOS' : origensPermitidos);

// Parsear JSON
app.use(express.json());

// Logging básico de requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// Rutas
// ============================================

// Rutas de la API
app.use('/api', routes);

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    nombre: 'Lector Mediciones API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      configuraciones: '/api/configuraciones',
      puestos: '/api/configuraciones/:id/puestos',
      alimentadores: '/api/puestos/:id/alimentadores',
      permisos: '/api/configuraciones/:id/permisos',
      preferencias: '/api/configuraciones/:id/preferencias',
    },
  },
  );
});

// ============================================
// Manejo de errores
// ============================================

// 404 - Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================
// Iniciar servidor
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   Lector Mediciones Backend                ║
║   Servidor corriendo en puerto ${PORT}         ║
║   http://localhost:${PORT}                     ║
║   API REST para agentes                    ║
╚════════════════════════════════════════════╝
  `);
});
