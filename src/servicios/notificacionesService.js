// src/servicios/notificacionesService.js
// Servicio para enviar push notifications via Firebase Cloud Messaging

const supabase = require('../config/supabase');

// Firebase Admin se inicializará cuando se configure
let firebaseAdmin = null;

/**
 * Inicializa Firebase Admin SDK
 * Debe llamarse al inicio del servidor si las credenciales están configuradas
 */
function inicializarFirebase() {
  if (firebaseAdmin) {
    console.log('[Notificaciones] Firebase ya inicializado');
    return true;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.log('[Notificaciones] Credenciales de Firebase no configuradas, push notifications deshabilitadas');
    return false;
  }

  try {
    const admin = require('firebase-admin');

    const serviceAccount = {
      type: 'service_account',
      project_id: projectId,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey.replace(/\\n/g, '\n'),
      client_email: clientEmail,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseAdmin = admin;
    console.log('[Notificaciones] Firebase Admin inicializado correctamente');
    return true;
  } catch (error) {
    console.error('[Notificaciones] Error inicializando Firebase:', error.message);
    return false;
  }
}

/**
 * Verifica si Firebase está disponible
 */
function firebaseDisponible() {
  return firebaseAdmin !== null;
}

/**
 * Envía una notificación push a un usuario específico
 * @param {string} usuarioId - ID del usuario
 * @param {string} titulo - Título de la notificación
 * @param {string} cuerpo - Cuerpo/mensaje de la notificación
 * @param {Object} datos - Datos adicionales para la notificación
 * @returns {Promise<{enviados: number, errores: number}>}
 */
async function enviarNotificacionAUsuario(usuarioId, titulo, cuerpo, datos = {}) {
  if (!firebaseAdmin) {
    console.log('[Notificaciones] Firebase no disponible, saltando notificación');
    return { enviados: 0, errores: 0, mensaje: 'Firebase no configurado' };
  }

  try {
    // Obtener tokens activos del usuario
    const { data: dispositivos, error } = await supabase
      .from('dispositivos_usuario')
      .select('fcm_token')
      .eq('usuario_id', usuarioId)
      .eq('activo', true);

    if (error || !dispositivos || dispositivos.length === 0) {
      console.log(`[Notificaciones] No hay dispositivos activos para usuario ${usuarioId}`);
      return { enviados: 0, errores: 0 };
    }

    const tokens = dispositivos.map(d => d.fcm_token);
    console.log(`[Notificaciones] Enviando a ${tokens.length} dispositivos de usuario ${usuarioId}`);

    // Construir mensaje
    const mensaje = {
      notification: {
        title: titulo,
        body: cuerpo,
      },
      data: {
        ...Object.fromEntries(
          Object.entries(datos).map(([k, v]) => [k, String(v)])
        ),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      tokens: tokens,
    };

    // Enviar a todos los dispositivos
    const response = await firebaseAdmin.messaging().sendEachForMulticast(mensaje);

    console.log(`[Notificaciones] Enviados: ${response.successCount}, Fallos: ${response.failureCount}`);

    // Desactivar tokens inválidos
    if (response.failureCount > 0) {
      const tokensInvalidos = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered') {
            tokensInvalidos.push(tokens[idx]);
          }
        }
      });

      if (tokensInvalidos.length > 0) {
        console.log(`[Notificaciones] Desactivando ${tokensInvalidos.length} tokens inválidos`);
        await supabase
          .from('dispositivos_usuario')
          .update({ activo: false })
          .in('fcm_token', tokensInvalidos);
      }
    }

    return {
      enviados: response.successCount,
      errores: response.failureCount,
    };
  } catch (error) {
    console.error('[Notificaciones] Error enviando notificación:', error);
    return { enviados: 0, errores: 1, error: error.message };
  }
}

/**
 * Envía notificación a todos los usuarios de un workspace
 * @param {string} workspaceId - ID del workspace
 * @param {string} titulo - Título de la notificación
 * @param {string} cuerpo - Cuerpo/mensaje de la notificación
 * @param {Object} datos - Datos adicionales para la notificación
 * @returns {Promise<{enviados: number, errores: number}>}
 */
async function enviarNotificacionAWorkspace(workspaceId, titulo, cuerpo, datos = {}) {
  if (!firebaseAdmin) {
    return { enviados: 0, errores: 0, mensaje: 'Firebase no configurado' };
  }

  try {
    // Obtener usuarios del workspace
    const { data: usuarios, error } = await supabase
      .from('usuario_workspaces')
      .select('usuario_id')
      .eq('workspace_id', workspaceId);

    if (error || !usuarios || usuarios.length === 0) {
      console.log(`[Notificaciones] No hay usuarios en workspace ${workspaceId}`);
      return { enviados: 0, errores: 0 };
    }

    console.log(`[Notificaciones] Enviando a ${usuarios.length} usuarios del workspace`);

    let totalEnviados = 0;
    let totalErrores = 0;

    for (const u of usuarios) {
      const resultado = await enviarNotificacionAUsuario(
        u.usuario_id,
        titulo,
        cuerpo,
        { ...datos, workspace_id: workspaceId }
      );
      totalEnviados += resultado.enviados;
      totalErrores += resultado.errores;
    }

    return { enviados: totalEnviados, errores: totalErrores };
  } catch (error) {
    console.error('[Notificaciones] Error enviando a workspace:', error);
    return { enviados: 0, errores: 1, error: error.message };
  }
}

/**
 * Envía alerta de alimentador sin servicio
 * @param {string} workspaceId - ID del workspace
 * @param {string} alimentadorNombre - Nombre del alimentador
 * @param {string} alimentadorId - ID del alimentador
 * @param {number} minutosSinLectura - Minutos sin lectura
 */
async function enviarAlertaAlimentadorSinServicio(workspaceId, alimentadorNombre, alimentadorId, minutosSinLectura) {
  return enviarNotificacionAWorkspace(
    workspaceId,
    `⚠️ Alerta: ${alimentadorNombre}`,
    `Sin lectura hace ${minutosSinLectura} minutos`,
    {
      tipo: 'alerta_sin_lectura',
      alimentador_id: alimentadorId,
      minutos_sin_lectura: minutosSinLectura,
    }
  );
}

module.exports = {
  inicializarFirebase,
  firebaseDisponible,
  enviarNotificacionAUsuario,
  enviarNotificacionAWorkspace,
  enviarAlertaAlimentadorSinServicio,
};
