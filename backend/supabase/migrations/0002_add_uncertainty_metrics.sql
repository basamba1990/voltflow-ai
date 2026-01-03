-- 0002_add_uncertainty_metrics.sql

-- Ajout des colonnes pour la quantification de l'incertitude et la détection de domaine shift
ALTER TABLE simulation_results
ADD COLUMN uncertainty_score REAL,
ADD COLUMN domain_shift_alert BOOLEAN DEFAULT FALSE;

-- Mise à jour des politiques de sécurité pour permettre l'insertion de ces nouvelles colonnes
-- La politique existante "Service role can insert simulation results" couvre déjà cela.

-- Ajout d'un index pour la recherche rapide des alertes
CREATE INDEX IF NOT EXISTS idx_simulation_results_domain_shift ON simulation_results(domain_shift_alert) WHERE domain_shift_alert = TRUE;
