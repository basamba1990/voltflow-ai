"""
OPENFOAM BRIDGE - Interface pour les simulations OpenFOAM
Version: 1.1.0 - ULTRA-SOLID
"""

import os
import subprocess
import logging
import shutil
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger("voltflow-openfoam")

class OpenFOAMSolver:
    def __init__(self):
        self.results_dir = os.environ.get("RESULTS_DIR", "/app/results")
        self.templates_dir = os.environ.get("OPENFOAM_TEMPLATES", "/app/backend/solver-engine/templates/openfoam")
        os.makedirs(self.results_dir, exist_ok=True)
        self.openfoam_installed = self._check_openfoam()

    def _check_openfoam(self) -> bool:
        """Vérifie si OpenFOAM est accessible dans l'environnement (via blockMesh)"""
        try:
            # On vérifie la présence de blockMesh dans le PATH
            # Dans le nouveau Dockerfile, OpenFOAM est sourcé via entrypoint.sh
            result = subprocess.run(["which", "blockMesh"], capture_output=True, text=True)
            installed = result.returncode == 0
            if installed:
                logger.info(f"✅ OpenFOAM détecté : {result.stdout.strip()}")
            else:
                logger.warning("⚠️ OpenFOAM n'est pas détecté dans le PATH actuel.")
            return installed
        except Exception as e:
            logger.error(f"❌ Erreur lors de la vérification d'OpenFOAM : {str(e)}")
            return False

    def setup_case(self, case_dir: str, config: Dict[str, Any]):
        """Prépare le dossier de cas OpenFOAM à partir d'un template"""
        logger.info(f"Préparation du cas OpenFOAM dans {case_dir}")
        
        # Copie du template de base
        if os.path.exists(self.templates_dir) and os.listdir(self.templates_dir):
            shutil.copytree(self.templates_dir, case_dir, dirs_exist_ok=True)
        else:
            # Création d'une structure minimale de secours si le template est vide ou absent
            for d in ["0", "constant", "system"]:
                os.makedirs(os.path.join(case_dir, d), exist_ok=True)
            logger.warning("Template OpenFOAM vide ou introuvable, structure minimale créée")

    def run_simulation(self, case_dir: str) -> Dict[str, Any]:
        """Exécute la simulation OpenFOAM complète"""
        if not self.openfoam_installed:
            # Tentative de secours : vérifier si le binaire est à l'emplacement standard de l'image
            if os.path.exists("/usr/lib/openfoam/openfoam10/bin/blockMesh"):
                logger.info("OpenFOAM trouvé à l'emplacement standard, poursuite de l'exécution.")
            else:
                logger.error("OpenFOAM n'est pas installé ou non sourcé correctement.")
                return {"success": False, "error": "OpenFOAM not found in environment"}

        try:
            # Workflow standard de simulation thermique
            logger.info("Lancement du maillage (blockMesh)...")
            subprocess.run(["blockMesh"], cwd=case_dir, check=True, capture_output=True, text=True)
            
            # Note: Le solveur dépend de la config (ex: scalarTransportFoam ou simpleFoam)
            solver = "scalarTransportFoam" 
            logger.info(f"Lancement du solveur {solver}...")
            subprocess.run([solver], cwd=case_dir, check=True, capture_output=True, text=True)
            
            # Conversion pour le viewer VoltFlow
            logger.info("Conversion des résultats en format VTK...")
            subprocess.run(["foamToVTK"], cwd=case_dir, check=True, capture_output=True, text=True)
            
            # Recherche du fichier VTK généré
            vtk_dir = os.path.join(case_dir, "VTK")
            return {
                "success": True,
                "message": "Simulation OpenFOAM terminée avec succès",
                "vtk_path": vtk_dir if os.path.exists(vtk_dir) else None
            }
        except subprocess.CalledProcessError as e:
            logger.error(f"Erreur OpenFOAM (Code {e.returncode}): {e.stderr}")
            return {"success": False, "error": e.stderr or e.stdout}

openfoam_solver = OpenFOAMSolver()
