-- Migración: Agregar campos de configuración a alimentadores
-- Fecha: 2025-12-18
-- Descripción: Agrega campos para color, vinculación con registrador,
--              intervalo de consulta y diseño de card

-- ============================================
-- 1. Agregar columna color
-- ============================================
-- Color hexadecimal para mostrar el alimentador en el dashboard
ALTER TABLE alimentadores
ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#3b82f6';

COMMENT ON COLUMN alimentadores.color IS 'Color hexadecimal para mostrar el alimentador en el dashboard';

-- ============================================
-- 2. Agregar columna registrador_id (FK)
-- ============================================
-- Vincula el alimentador con UN registrador específico
-- El registrador pertenece a un agente vinculado al workspace
ALTER TABLE alimentadores
ADD COLUMN IF NOT EXISTS registrador_id UUID REFERENCES registradores(id) ON DELETE SET NULL;

COMMENT ON COLUMN alimentadores.registrador_id IS 'ID del registrador que provee las lecturas para este alimentador';

-- Crear índice para búsquedas por registrador
CREATE INDEX IF NOT EXISTS idx_alimentadores_registrador ON alimentadores(registrador_id);

-- ============================================
-- 3. Agregar columna intervalo_consulta_ms
-- ============================================
-- Intervalo en milisegundos para consultar la última lectura desde el frontend
-- Por defecto 60000ms (60 segundos)
ALTER TABLE alimentadores
ADD COLUMN IF NOT EXISTS intervalo_consulta_ms INTEGER DEFAULT 60000;

COMMENT ON COLUMN alimentadores.intervalo_consulta_ms IS 'Intervalo en ms para que el frontend consulte la última lectura';

-- ============================================
-- 4. Agregar columna card_design (JSONB)
-- ============================================
-- Configuración del diseño visual de la tarjeta del alimentador
-- Estructura esperada:
-- {
--   "superior": {
--     "tituloId": "corriente_132",
--     "tituloCustom": "",
--     "cantidad": 3,
--     "boxes": [
--       { "enabled": true, "label": "R", "indice": 151, "formula": "x * 250 / 1000" },
--       { "enabled": true, "label": "S", "indice": 152, "formula": "x * 250 / 1000" },
--       { "enabled": true, "label": "T", "indice": 153, "formula": "x * 250 / 1000" },
--       { "enabled": false, "label": "", "indice": null, "formula": "" }
--     ]
--   },
--   "inferior": {
--     "tituloId": "tension_linea",
--     "tituloCustom": "",
--     "cantidad": 3,
--     "boxes": [
--       { "enabled": true, "label": "L1", "indice": 154, "formula": "x / 10" },
--       { "enabled": true, "label": "L2", "indice": 155, "formula": "x / 10" },
--       { "enabled": true, "label": "L3", "indice": 156, "formula": "x / 10" },
--       { "enabled": false, "label": "", "indice": null, "formula": "" }
--     ]
--   }
-- }
ALTER TABLE alimentadores
ADD COLUMN IF NOT EXISTS card_design JSONB DEFAULT '{}';

COMMENT ON COLUMN alimentadores.card_design IS 'Configuración JSONB del diseño de la tarjeta (boxes superior e inferior con índices y fórmulas)';

-- ============================================
-- 5. Agregar columna gap_horizontal
-- ============================================
-- Espacio horizontal entre esta card y la siguiente (en píxeles)
-- Por defecto 0 (sin gap adicional)
ALTER TABLE alimentadores
ADD COLUMN IF NOT EXISTS gap_horizontal INTEGER DEFAULT 0;

COMMENT ON COLUMN alimentadores.gap_horizontal IS 'Espacio horizontal en px entre esta card y la siguiente';

-- ============================================
-- 6. Limpiar columnas obsoletas (si existen)
-- ============================================
-- Estas columnas ya no se usan en la arquitectura v2
-- config_rele y config_analizador fueron reemplazados por registrador_id + card_design
ALTER TABLE alimentadores DROP COLUMN IF EXISTS config_rele;
ALTER TABLE alimentadores DROP COLUMN IF EXISTS config_analizador;

-- ============================================
-- Resumen de la tabla alimentadores después de la migración:
-- ============================================
-- id                    UUID PRIMARY KEY
-- puesto_id             UUID NOT NULL (FK a puestos)
-- nombre                VARCHAR(255) NOT NULL
-- descripcion           TEXT
-- orden                 INTEGER DEFAULT 0
-- activo                BOOLEAN DEFAULT true
-- color                 VARCHAR(20) DEFAULT '#3b82f6'      [NUEVO]
-- registrador_id        UUID (FK a registradores)          [NUEVO]
-- intervalo_consulta_ms INTEGER DEFAULT 60000              [NUEVO]
-- card_design           JSONB DEFAULT '{}'                 [NUEVO]
-- gap_horizontal        INTEGER DEFAULT 0                  [NUEVO]
-- created_at            TIMESTAMPTZ
-- updated_at            TIMESTAMPTZ
