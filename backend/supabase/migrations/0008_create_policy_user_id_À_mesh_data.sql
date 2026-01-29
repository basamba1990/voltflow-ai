-- ============================================
-- SCRIPT DE CORRECTION - VOLTFLOW-AI
-- Appliquer les recommandations de compatibilité
-- ============================================

-- 1. AJOUTER LA COLONNE user_id À mesh_data
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mesh_data' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.mesh_data 
        ADD COLUMN user_id UUID REFERENCES auth.users(id);
        
        RAISE NOTICE '✅ Colonne user_id ajoutée à mesh_data';
        
        -- Mettre à jour les enregistrements existants
        UPDATE public.mesh_data md
        SET user_id = s.user_id
        FROM public.simulations s
        WHERE md.simulation_id = s.id
        AND md.user_id IS NULL;
        
        RAISE NOTICE '✅ Valeurs user_id mises à jour pour les enregistrements existants';
    ELSE
        RAISE NOTICE 'ℹ️ Colonne user_id déjà présente dans mesh_data';
    END IF;
END $$;

-- 2. ACTIVER RLS ET AJOUTER POLITIQUES POUR mesh_data
DO $$
BEGIN
    -- Activer RLS si ce n'est pas déjà fait
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'mesh_data' 
        AND rowsecurity = true
        AND schemaname = 'public'
    ) THEN
        ALTER TABLE public.mesh_data ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE '✅ RLS activé sur mesh_data';
    ELSE
        RAISE NOTICE 'ℹ️ RLS déjà activé sur mesh_data';
    END IF;
    
    -- Créer politique SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'mesh_data' 
        AND policyname = 'Users can only view their own mesh_data'
        AND schemaname = 'public'
    ) THEN
        CREATE POLICY "Users can only view their own mesh_data" 
        ON public.mesh_data FOR SELECT 
        USING (auth.uid() = user_id);
        
        RAISE NOTICE '✅ Politique SELECT créée pour mesh_data';
    ELSE
        RAISE NOTICE 'ℹ️ Politique SELECT déjà existante pour mesh_data';
    END IF;
    
    -- Créer politique INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'mesh_data' 
        AND policyname = 'Users can only insert their own mesh_data'
        AND schemaname = 'public'
    ) THEN
        CREATE POLICY "Users can only insert their own mesh_data" 
        ON public.mesh_data FOR INSERT 
        WITH CHECK (auth.uid() = user_id);
        
        RAISE NOTICE '✅ Politique INSERT créée pour mesh_data';
    ELSE
        RAISE NOTICE 'ℹ️ Politique INSERT déjà existante pour mesh_data';
    END IF;
    
    -- Créer politique UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'mesh_data' 
        AND policyname = 'Users can only update their own mesh_data'
        AND schemaname = 'public'
    ) THEN
        CREATE POLICY "Users can only update their own mesh_data" 
        ON public.mesh_data FOR UPDATE 
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
        
        RAISE NOTICE '✅ Politique UPDATE créée pour mesh_data';
    ELSE
        RAISE NOTICE 'ℹ️ Politique UPDATE déjà existante pour mesh_data';
    END IF;
    
    -- Créer politique DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'mesh_data' 
        AND policyname = 'Users can only delete their own mesh_data'
        AND schemaname = 'public'
    ) THEN
        CREATE POLICY "Users can only delete their own mesh_data" 
        ON public.mesh_data FOR DELETE 
        USING (auth.uid() = user_id);
        
        RAISE NOTICE '✅ Politique DELETE créée pour mesh_data';
    ELSE
        RAISE NOTICE 'ℹ️ Politique DELETE déjà existante pour mesh_data';
    END IF;
END $$;

-- 3. VÉRIFICATION FINALE
SELECT 
    'RAPPORT APRÈS CORRECTIONS' as rapport,
    'mesh_data - user_id' as élément,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'mesh_data' 
            AND column_name = 'user_id'
        ) THEN '✅ PRÉSENTE'
        ELSE '❌ ABSENTE'
    END as statut
UNION ALL
SELECT 
    'RAPPORT APRÈS CORRECTIONS',
    'mesh_data - RLS activé',
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE tablename = 'mesh_data' 
            AND rowsecurity = true
            AND schemaname = 'public'
        ) THEN '✅ ACTIVÉ'
        ELSE '❌ DÉSACTIVÉ'
    END
UNION ALL
SELECT 
    'RAPPORT APRÈS CORRECTIONS',
    'mesh_data - Politiques RLS',
    CASE 
        WHEN (
            SELECT COUNT(*) FROM pg_policies 
            WHERE tablename = 'mesh_data' 
            AND schemaname = 'public'
        ) >= 4 THEN '✅ COMPLÈTES'
        WHEN (
            SELECT COUNT(*) FROM pg_policies 
            WHERE tablename = 'mesh_data' 
            AND schemaname = 'public'
        ) > 0 THEN '⚠️ PARTIELLES'
        ELSE '❌ ABSENTES'
    END;

-- 4. INDEX POUR PERFORMANCE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'mesh_data' 
        AND indexname = 'idx_mesh_data_user_id'
        AND schemaname = 'public'
    ) THEN
        CREATE INDEX idx_mesh_data_user_id ON public.mesh_data(user_id);
        RAISE NOTICE '✅ Index idx_mesh_data_user_id créé';
    ELSE
        RAISE NOTICE 'ℹ️ Index idx_mesh_data_user_id déjà existant';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'mesh_data' 
        AND indexname = 'idx_mesh_data_simulation_id'
        AND schemaname = 'public'
    ) THEN
        CREATE INDEX idx_mesh_data_simulation_id ON public.mesh_data(simulation_id);
        RAISE NOTICE '✅ Index idx_mesh_data_simulation_id créé';
    ELSE
        RAISE NOTICE 'ℹ️ Index idx_mesh_data_simulation_id déjà existant';
    END IF;
END $$;

-- 5. SCRIPT DE VÉRIFICATION RAPIDE POST-CORRECTIONS
SELECT 
    table_name,
    COUNT(*) as nombre_colonnes,
    CASE 
        WHEN table_name = 'mesh_data' AND COUNT(*) >= 8 THEN '✅ COMPLÈTE'
        WHEN table_name = 'mesh_data' AND COUNT(*) >= 6 THEN '⚠️ PARTIELLE'
        ELSE '❌ INCOMPLÈTE'
    END as statut_structure
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'mesh_data'
GROUP BY table_name
UNION ALL
SELECT 
    'RLS Status' as table_name,
    COUNT(policyname) as nombre_colonnes,
    CASE 
        WHEN COUNT(policyname) >= 4 THEN '✅ COMPLÈTES'
        WHEN COUNT(policyname) > 0 THEN '⚠️ PARTIELLES'
        ELSE '❌ ABSENTES'
    END as statut_structure
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'mesh_data'
GROUP BY tablename;
