-- =============================================================================
-- Migración: Permitir múltiples razones sociales extranjeras con RUT 55.555.555-5
-- manteniendo la unicidad de RUT para clientes nacionales y evitando duplicar
-- exactamente el mismo (RUT + Razón Social).
-- =============================================================================

-- 1. Eliminar la restricción única global sobre el campo 'rut'
ALTER TABLE public.clients
DROP CONSTRAINT IF EXISTS clients_rut_key;

-- 2. Crear índice único parcial: el RUT sigue siendo único para clientes nacionales
--    (cualquier RUT distinto de 55.555.555-5)
CREATE UNIQUE INDEX IF NOT EXISTS clients_national_rut_unique_idx
ON public.clients (rut)
WHERE rut IS NOT NULL AND REPLACE(rut, '.', '') <> '55555555-5';

-- 3. Crear índice único compuesto (RUT + Razón Social) para evitar duplicar
--    dos veces la misma empresa extranjera con 55.555.555-5
CREATE UNIQUE INDEX IF NOT EXISTS clients_rut_company_unique_idx
ON public.clients (REPLACE(rut, '.', ''), LOWER(TRIM(company_name)));
