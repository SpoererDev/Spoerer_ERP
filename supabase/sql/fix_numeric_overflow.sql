-- ==========================================================================
-- Migración: Ampliar precisión de campos numéricos para soportar montos CLP
-- Causa raíz: billing_installments.planned_amount_uf tenía tipo numeric(10, 4)
-- (límite < 1.000.000), provocando "numeric field overflow" al insertar cuotas
-- en CLP mayores o iguales a $1.000.000.
-- ==========================================================================

-- 1. Quitar restricción de precisión en planned_amount_uf de billing_installments
ALTER TABLE public.billing_installments
  ALTER COLUMN planned_amount_uf TYPE numeric;

-- 2. Ampliar campos de montos en budgets, budget_items, extra_costs y projects
ALTER TABLE public.budgets
  ALTER COLUMN total_amount TYPE numeric;

ALTER TABLE public.budget_items
  ALTER COLUMN unit_price TYPE numeric,
  ALTER COLUMN quantity TYPE numeric;

ALTER TABLE public.extra_costs
  ALTER COLUMN amount TYPE numeric,
  ALTER COLUMN superficie TYPE numeric;

ALTER TABLE public.projects
  ALTER COLUMN superficie TYPE numeric,
  ALTER COLUMN rentabilidad TYPE numeric;

-- 3. Sincronizar cuotas que hayan utilizado el respaldo en net_amount_clp
UPDATE public.billing_installments
SET
  planned_amount_uf = net_amount_clp,
  net_amount_clp = CASE
    WHEN status IN ('Facturada', 'Factura emitida', 'Pagada') OR total_amount_clp IS NOT NULL
      THEN net_amount_clp
    ELSE NULL
  END
WHERE (planned_amount_uf = 0 OR planned_amount_uf IS NULL)
  AND net_amount_clp IS NOT NULL
  AND net_amount_clp > 0;
