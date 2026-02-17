"""
OPENFOAM BRIDGE - Interface pour les simulations OpenFOAM
Version: 1.0.0 - SOLID
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
        self.openfoam_installed = self._check_openfoam()
        self.results_dir = os.environ.get("RESULTS_DIR", "/app/results")
        self.templates_dir = os.environ.get("OPENFOAM_TEMPLATES", "/app/backend/solver-engine/templates/openfoam")
        os.makedirs(self.results_dir, exist_ok=True)

    def _check_openfoam(self) -> bool:
        """Vérifie si OpenFOAM est accessible dans l'environnement"""
        try:
            # On vérifie la présence de blockMesh ou simpleFoam
            result = subprocess.run(["which", "blockMesh"], capture_output=True, text=True)
            return result.returncode == 0
        except Exception:
            return False

    def setup_case(self, case_dir: str, config: Dict[str, Any]):
        """Prépare le dossier de cas OpenFOAM à partir d'un template"""
        logger.info(f"Préparation du cas OpenFOAM dans {case_dir}")
        
        # Copie du template de base
        if os.path.exists(self.templates_dir):
            shutil.copytree(self.templates_dir, case_dir, dirs_exist_ok=True)
        else:
            # Création d'une structure minimale si le template n'existe pas
            os.makedirs(os.path.join(case_dir, "0"), exist_ok=True)
            os.makedirs(os.path.join(case_dir, "constant"), exist_ok=True)
            os.makedirs(os.path.join(case_dir, "system"), exist_ok=True)
            logger.warning("Template OpenFOAM introuvable, structure minimale créée")

    def run_simulation(self, case_dir: str) -> Dict[str, Any]:
        """Exécute la simulation OpenFOAM"""
        if not self.openfoam_installed:
            logger.error("OpenFOAM n'est pas installé sur ce système")
            return {"success": False, "error": "OpenFOAM not installed"}

        try:
            # Exemple de workflow standard
            logger.info("Lancement de blockMesh...")
            subprocess.run(["blockMesh"], cwd=case_dir, check=True, capture_output=True)
            
            logger.info("Lancement du solveur thermique (ex: scalarTransportFoam)...")
            subprocess.run(["scalarTransportFoam"], cwd=case_dir, check=True, capture_output=True)
            
            # Conversion en VTK pour le viewer VoltFlow
            logger.info("Conversion en VTK...")
            subprocess.run(["foamToVTK"], cwd=case_dir, check=True, capture_output=True)
            
            return {
                "success": True,
                "message": "Simulation OpenFOAM terminée avec succès",
                "vtk_path": os.path.join(case_dir, "VTK")
            }
        except subprocess.CalledProcessError as e:
            logger.error(f"Erreur lors de l'exécution d'OpenFOAM : {e.stderr}")
            return {"success": False, "error": e.stderr}

openfoam_solver = OpenFOAMSolver()
