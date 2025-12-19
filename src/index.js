// src/index.js
// Punto de entrada del backend

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const routes = require('./routes');
const { verificarClaveAgente, validarVinculacion, registrarLogAgente } = require('./controllers/agentesController');
const supabase = require('./config/supabase');

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

// Configuración de CORS para Socket.IO
const corsConfigSocketIO = {
  origin: process.env.CORS_ALLOW_ALL === 'true' ? true : origensPermitidos,
  methods: ['GET', 'POST'],
  credentials: true,
};

const io = new Server(server, {
  cors: corsConfigSocketIO,
});

// Estado de agentes conectados
const agentesConectados = new Map();

// Manejar conexiones de agentes
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Nueva conexión: ${socket.id}`);
  const clientIp = socket.handshake.address;

  // El agente se autentica con su clave secreta
  socket.on('agente:autenticar', async (datos) => {
    const { claveSecreta } = datos;

    if (!claveSecreta) {
      socket.emit('agente:autenticado', {
        exito: false,
        error: 'Clave secreta requerida',
      });
      return;
    }

    // Verificar clave contra la BD
    const resultado = await verificarClaveAgente(claveSecreta);

    if (!resultado.valido) {
      console.log(`[Socket.IO] Autenticación fallida desde ${clientIp}`);
      socket.emit('agente:autenticado', {
        exito: false,
        error: resultado.error || 'Clave inválida',
      });
      return;
    }

    // Registrar agente conectado
    agentesConectados.set(socket.id, {
      agenteId: resultado.agente.id,
      nombre: resultado.agente.nombre,
      conectadoEn: new Date(),
      socket,
      ip: clientIp,
    });

    console.log(`[Socket.IO] Agente autenticado: ${resultado.agente.nombre} (${resultado.agente.id.substring(0, 8)}...)`);

    // Registrar log de autenticación
    await registrarLogAgente(resultado.agente.id, 'autenticacion', clientIp, {
      usoClavePrincipal: resultado.usoClavePrincipal,
    }, true);

    // Buscar si hay un workspace vinculado a este agente
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, nombre')
      .eq('agente_id', resultado.agente.id)
      .single();

    socket.emit('agente:autenticado', {
      exito: true,
      agente: resultado.agente,
      advertencia: resultado.advertencia,
      workspace: workspace || null,
    });
  });

  // El agente envía código de vinculación
  socket.on('agente:vincular', async (datos) => {
    const { codigo } = datos;
    const agenteInfo = agentesConectados.get(socket.id);

    if (!agenteInfo) {
      socket.emit('agente:vinculado', {
        exito: false,
        error: 'Agente no autenticado',
      });
      return;
    }

    const resultado = await validarVinculacion(codigo, agenteInfo.agenteId, clientIp);
    socket.emit('agente:vinculado', resultado);
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

  // El agente envía ping periódico para indicar que está vivo
  socket.on('agente:ping', async () => {
    const agenteInfo = agentesConectados.get(socket.id);

    if (agenteInfo) {
      // Actualizar ultimo_ping en la BD
      const { error } = await supabase
        .from('agentes')
        .update({ ultimo_ping: new Date().toISOString() })
        .eq('id', agenteInfo.agenteId);

      if (error) {
        console.error(`[Socket.IO] Error actualizando ping:`, error.message);
      }

      // Responder con pong
      socket.emit('agente:pong', { timestamp: Date.now() });
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    const agente = agentesConectados.get(socket.id);
    if (agente) {
      console.log(`[Socket.IO] Agente desconectado: ${agente.nombre || agente.agenteId}`);
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
