-- ============================================
-- FIX TRIGGER SAFETY FOR VOLTFLOW AI
-- ============================================

-- 1. Recréation de la fonction de trigger avec vérification de l'existence de la colonne
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- On vérifie si la colonne updated_at existe dans la table qui déclenche le trigger
    -- Cela évite l'erreur "record new has no field updated_at"
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = TG_TABLE_SCHEMA 
        AND table_name = TG_TABLE_NAME 
        AND column_name = 'updated_at'
    ) THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Ajout de la colonne updated_at manquante sur les tables critiques pour la cohérence
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.simulation_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.simulation_metrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Application systématique du trigger sur toutes les tables de données
DROP TRIGGER IF EXISTS update_materials_updated_at ON public.materials;
CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_simulation_results_updated_at ON public.simulation_results;
CREATE TRIGGER update_simulation_results_updated_at BEFORE UPDATE ON public.simulation_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_simulation_metrics_updated_at ON public.simulation_metrics;
CREATE TRIGGER update_simulation_metrics_updated_at BEFORE UPDATE ON public.simulation_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
