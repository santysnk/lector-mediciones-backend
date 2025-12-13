-- Migración: Renombrar tabla configuraciones a workspaces
-- Fecha: 2025-12-13
-- Descripción: Renombra la tabla configuraciones a workspaces para mejor semántica

-- 1. Renombrar la tabla
ALTER TABLE configuraciones RENAME TO workspaces;

-- 2. Renombrar la columna de foreign key en la tabla puestos
ALTER TABLE puestos RENAME COLUMN configuracion_id TO workspace_id;

-- 3. Renombrar el constraint de foreign key
ALTER TABLE puestos
  DROP CONSTRAINT IF EXISTS puestos_configuracion_id_fkey;

ALTER TABLE puestos
  ADD CONSTRAINT puestos_workspace_id_fkey
  FOREIGN KEY (workspace_id)
  REFERENCES workspaces(id)
  ON DELETE CASCADE;

-- 4. Renombrar la columna de foreign key en la tabla preferencias_usuario
ALTER TABLE preferencias_usuario RENAME COLUMN configuracion_id TO workspace_id;

-- 5. Renombrar el constraint de foreign key en preferencias_usuario
ALTER TABLE preferencias_usuario
  DROP CONSTRAINT IF EXISTS preferencias_usuario_configuracion_id_fkey;

ALTER TABLE preferencias_usuario
  ADD CONSTRAINT preferencias_usuario_workspace_id_fkey
  FOREIGN KEY (workspace_id)
  REFERENCES workspaces(id)
  ON DELETE CASCADE;

-- 6. Renombrar índices si existen
DROP INDEX IF EXISTS idx_puestos_configuracion_id;
CREATE INDEX idx_puestos_workspace_id ON puestos(workspace_id);

DROP INDEX IF EXISTS idx_preferencias_configuracion_id;
CREATE INDEX idx_preferencias_workspace_id ON preferencias_usuario(workspace_id);

-- 7. Actualizar comentarios de la tabla
COMMENT ON TABLE workspaces IS 'Espacios de trabajo que contienen puestos y alimentadores';
COMMENT ON COLUMN puestos.workspace_id IS 'ID del workspace al que pertenece este puesto';
COMMENT ON COLUMN preferencias_usuario.workspace_id IS 'ID del workspace para estas preferencias';
