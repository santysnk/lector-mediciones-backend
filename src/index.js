// src/index.js
// Punto de entrada del backend

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ============================================
// Socket.IO - Conexión con agentes
// ============================================

// Orígenes permitidos para CORS
const origensPermitidos = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

// Agregar frontend en producción si está configurado
if (process.env.FRONTEND_URL) {
  origensPermitidos.push(process.env.FRONTEND_URL);
}

const io = new Server(server, {
  cors: {
    origin: origensPermitidos,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Estado de agentes conectados
const agentesConectados = new Map();

// Manejar conexiones de agentes
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Nueva conexión: ${socket.id}`);

  // El agente se registra con su identificación
  socket.on('agente:registrar', (datos) => {
    const { agenteId, configuracionId } = datos;

    agentesConectados.set(socket.id, {
      agenteId,
      configuracionId,
      conectadoEn: new Date(),
      socket,
    });

    console.log(`[Socket.IO] Agente registrado: ${agenteId} (config: ${configuracionId?.substring(0, 8)}...)`);

    socket.emit('agente:registrado', {
      exito: true,
      mensaje: 'Agente registrado correctamente',
    });
  });

  // El agente responde a un test de conexión Modbus
  socket.on('modbus:test:respuesta', (datos) => {
    const { requestId, resultado } = datos;
    console.log(`[Socket.IO] Respuesta de test recibida: ${requestId}`);

    // Procesar la respuesta usando el callback pendiente
    const { procesarRespuestaTest } = module.exports;
    if (procesarRespuestaTest) {
      procesarRespuestaTest(requestId, resultado);
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    const agente = agentesConectados.get(socket.id);
    if (agente) {
      console.log(`[Socket.IO] Agente desconectado: ${agente.agenteId}`);
      agentesConectados.delete(socket.id);
    } else {
      console.log(`[Socket.IO] Conexión cerrada: ${socket.id}`);
    }
  });
});

// Exportar io y agentes para usar en controladores
module.exports.io = io;
module.exports.agentesConectados = agentesConectados;

// Map para callbacks pendientes de respuestas de test
const pendingCallbacks = new Map();

// Función para enviar comando de test a un agente
module.exports.enviarTestConexion = (requestId, datosTest) => {
  return new Promise((resolve) => {
    // Si no hay agentes conectados
    if (agentesConectados.size === 0) {
      resolve({ exito: false, error: 'No hay agentes conectados' });
      return;
    }

    // Timeout de 10 segundos
    const timeout = setTimeout(() => {
      pendingCallbacks.delete(requestId);
      resolve({ exito: false, error: 'Timeout: el agente no respondió' });
    }, 10000);

    // Guardar el callback para cuando llegue la respuesta
    pendingCallbacks.set(requestId, (resultado) => {
      clearTimeout(timeout);
      pendingCallbacks.delete(requestId);
      resolve(resultado);
    });

    // Enviar el comando a todos los agentes (el que tenga acceso a la IP responderá)
    io.emit('modbus:test:solicitud', { requestId, ...datosTest });
  });
};

// Función para procesar respuestas de test (llamada desde el evento socket)
module.exports.procesarRespuestaTest = (requestId, resultado) => {
  const callback = pendingCallbacks.get(requestId);
  if (callback) {
    callback(resultado);
  }
};

// ============================================
// Middlewares
// ============================================

// CORS - permitir requests desde el frontend
app.use(cors({
  origin: origensPermitidos,
  credentials: true,
}));

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
    agentesConectados: agentesConectados.size,
    endpoints: {
      health: '/api/health',
      configuraciones: '/api/configuraciones',
      puestos: '/api/configuraciones/:id/puestos',
      alimentadores: '/api/puestos/:id/alimentadores',
      permisos: '/api/configuraciones/:id/permisos',
      preferencias: '/api/configuraciones/:id/preferencias',
      testConexion: '/api/test-conexion',
    },
  });
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

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   Lector Mediciones Backend                ║
║   Servidor corriendo en puerto ${PORT}         ║
║   http://localhost:${PORT}                     ║
║   WebSocket habilitado para agentes        ║
╚════════════════════════════════════════════╝
  `);
});
