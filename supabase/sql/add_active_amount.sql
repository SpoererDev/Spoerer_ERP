-- =============================================================================
-- Migración: Agregar parámetro 'active_amount' (Monto Activo) a la tabla 'budgets'
-- Propósito: Reflejar el monto activo real en proyectos que se desarrollan por etapas
--            para estadísticas de productividad.
-- =============================================================================

-- 1. Agregar la columna 'active_amount' a la tabla 'budgets'
ALTER TABLE public.budgets
ADD COLUMN IF NOT EXISTS active_amount numeric;

-- 2. Poblar los registros existentes en la base de datos con un valor igual al monto total
UPDATE public.budgets
SET active_amount = total_amount
WHERE active_amount IS NULL;

-- 3. Comentario descriptivo de la columna
COMMENT ON COLUMN public.budgets.active_amount IS 'Monto activo del presupuesto utilizado para estadísticas de productividad en proyectos por etapas. Por defecto es igual a total_amount.';
