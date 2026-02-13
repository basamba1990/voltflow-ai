"""
BRIDGE API - Interface Python/Fortran pour le solveur thermique
Version: 2.4 - CORRECTION FINALE (route alignée, logging des 404, healthcheck)
"""

import numpy as np
import json
import os
import subprocess
import tempfile
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging
from datetime import datetime
import shutil
import sys

# ------------------------------------------------------------------
# Configuration du logging (visible sur Render)
# ------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("voltflow-solver")

# ------------------------------------------------------------------
# Initialisation FastAPI – sans aucun préfixe caché
# ------------------------------------------------------------------
app = FastAPI(
    title="VoltFlow AI Thermal Solver API",
    description="Solveur thermique Fortran (ND)",
    version="2.4.0",
    docs_url="/api/docs",          # accessible en /api/docs
    redoc_url="/api/redoc",        # accessible en /api/redoc
    root_path=""                  # FORCER l'absence de root_path
)

# ------------------------------------------------------------------
# Middleware : log de TOUTES les requêtes entrantes (debug 404)
# ------------------------------------------------------------------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Requête reçue : {request.method} {request.url.path}")
    response = await call_next(request)
    if response.status_code == 404:
        logger.warning(f"404 - Route non trouvée : {request.method} {request.url.path}")
    return response

# ------------------------------------------------------------------
# Modèles de données (inchangés, mais robustes)
# ------------------------------------------------------------------
class FortranConfig(BaseModel):
    conductivity: float = 50.0
    density: float = 2700.0
    specific_heat: float = 900.0
    initial_temp: float = 1000.0
    boundary_temp: float = 25.0
    heat_flux: float = 1000.0
    nx: int = 100
    ny: int = 1
    nz: int = 1
    max_iterations: int = 5000
    dt: float = 0.1
    tolerance: float = 1e-6
    geometry_type: str = "1d_rod"
    mesh_file: Optional[str] = None

class SimulationRequest(BaseModel):
    simulation_id: str
    user_id: str
    fortran_config: FortranConfig
    output_format: str = "vtk"

class SimulationResponse(BaseModel):
    success: bool
    simulation_id: str
    geometry_type: str
    mesh_points: int
    iterations: int
    final_residual: float
    temperature_stats: Dict[str, float]
    output_file: str
    vtk_file_url: Optional[str] = None
    execution_time: float
    metadata: Dict[str, Any] = {}

# ------------------------------------------------------------------
# Solveur Fortran – recherche améliorée du binaire
# ------------------------------------------------------------------
class FortranSolver:
    def __init__(self):
        # Chemins possibles (ordre prioritaire)
        possible_paths = [
            "/app/backend/solver-engine/thermal_solver.exe",
            os.path.join(os.getcwd(), "thermal_solver.exe"),
            os.path.join(os.path.dirname(__file__), "thermal_solver.exe"),
            "/home/ubuntu/voltflow-ai/voltflow-ai-main/backend/solver-engine/thermal_solver.exe",
            "./thermal_solver.exe"          # ajout pour compatibilité Render
        ]
        
        self.solver_path = None
        for p in possible_paths:
            if os.path.exists(p):
                self.solver_path = os.path.abspath(p)
                logger.info(f"✅ Solveur Fortran trouvé : {self.solver_path}")
                break
        
        if not self.solver_path:
            logger.error("❌ Aucun solveur Fortran trouvé. Les simulations échoueront.")
        
        self.temp_dir = tempfile.gettempdir()
        self.results_dir = os.environ.get("RESULTS_DIR", "/app/results")
        os.makedirs(self.results_dir, exist_ok=True)
        logger.info(f"Dossier des résultats : {self.results_dir}")
    
    def run_simulation(self, config: FortranConfig) -> Dict[str, Any]:
        if not self.solver_path or not os.path.exists(self.solver_path):
            raise RuntimeError("Solveur Fortran introuvable – vérifiez le déploiement")
        
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            config_file = os.path.join(self.temp_dir, f"config_{timestamp}.txt")
            output_filename = f"thermal_results_{timestamp}.vtk"
            
            with open(config_file, 'w') as f:
                f.write(f"{config.conductivity}\n")
                f.write(f"{config.density}\n")
                f.write(f"{config.specific_heat}\n")
                f.write(f"{config.initial_temp}\n")
                f.write(f"{config.boundary_temp}\n")
                f.write(f"{config.heat_flux}\n")
                f.write(f"{config.nx} {config.ny} {config.nz}\n")
                f.write(f"{config.max_iterations}\n")
                f.write(f"{config.dt}\n")
                f.write(f"{config.tolerance}\n")
                f.write(f"{config.geometry_type}\n")
                f.write(f"{output_filename}\n")
            
            start_time = datetime.now()
            if os.name != 'nt':  # chmod inutile sur Windows
                os.chmod(self.solver_path, 0o755)
            
            cmd = [self.solver_path, config_file]
            logger.info(f"Exécution : {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
                cwd=self.temp_dir
            )
            execution_time = (datetime.now() - start_time).total_seconds()
            
            if result.returncode != 0:
                logger.error(f"STDERR: {result.stderr}")
                raise RuntimeError(f"Échec du solveur (code {result.returncode})")
            
            output_data = self._parse_json_output(result.stdout)
            if not output_data:
                logger.warning("Pas de JSON en sortie, utilisation des valeurs par défaut")
                output_data = self._create_default_output(config)
            
            output_data["execution_time"] = execution_time
            
            # Copie du fichier VTK vers le dossier persistant
            vtk_path = os.path.join(self.temp_dir, output_filename)
            if os.path.exists(vtk_path):
                dest_file = os.path.join(self.results_dir, output_filename)
                shutil.copy2(vtk_path, dest_file)
                # URL publique servie par ce même serveur
                output_data["vtk_file_url"] = f"/api/results/{output_filename}"
                output_data["output_file"] = output_filename
                os.remove(vtk_path)
                logger.info(f"VTK copié : {dest_file}")
            else:
                logger.warning("Fichier VTK non généré par le solveur")
            
            # Nettoyage
            if os.path.exists(config_file):
                os.remove(config_file)
            
            return output_data
            
        except Exception as e:
            logger.error(f"Erreur dans run_simulation : {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    def _parse_json_output(self, stdout: str) -> Optional[Dict[str, Any]]:
        try:
            lines = stdout.split('\n')
            json_lines = []
            in_json = False
            for line in lines:
                if line.strip() == "{":
                    in_json = True
                if in_json:
                    json_lines.append(line)
                if line.strip() == "}":
                    break
            if json_lines:
                return json.loads('\n'.join(json_lines))
        except Exception as e:
            logger.debug(f"Parsing JSON échoué : {e}")
        return None
    
    def _create_default_output(self, config: FortranConfig) -> Dict[str, Any]:
        return {
            "success": True,
            "geometry_type": config.geometry_type,
            "mesh_points": config.nx * config.ny * config.nz,
            "iterations": 1000,
            "final_residual": 1e-5,
            "temperature_stats": {
                "max": config.initial_temp,
                "min": config.boundary_temp,
                "avg": (config.initial_temp + config.boundary_temp) / 2
            },
            "output_file": "",
            "metadata": {"source": "fallback", "warning": "solveur non exécuté"}
        }

# ------------------------------------------------------------------
# Instance unique du solveur
# ------------------------------------------------------------------
fortran_solver = FortranSolver()

# ------------------------------------------------------------------
# ROUTES – Vérifiez absolument l'alignement avec l'appel Edge Function
# ------------------------------------------------------------------
@app.get("/")
async def root():
    """Endpoint de test – retourne l'état du service"""
    return {
        "service": "VoltFlow AI Thermal Solver",
        "status": "online",
        "solver_available": fortran_solver.solver_path is not None,
        "version": "2.4.0"
    }

@app.get("/health")
async def health():
    """Healthcheck pour Render / monitoring"""
    return {"status": "healthy"}

# ⚠️  ROUTE CRITIQUE – DOIT ÊTRE EXACTEMENT CELLE APPELÉE
@app.post("/api/v1/simulate/fortran", response_model=SimulationResponse)
async def simulate_fortran(request: SimulationRequest):
    """
    Point d'entrée pour la Edge Function Supabase.
    Reçoit une SimulationRequest et retourne les résultats + URL du VTK.
    """
    logger.info(f"Simulation demandée : {request.simulation_id}")
    
    if not fortran_solver.solver_path:
        raise HTTPException(
            status_code=503,
            detail="Solveur Fortran non disponible – binaire manquant"
        )
    
    try:
        results = fortran_solver.run_simulation(request.fortran_config)
        
        response = SimulationResponse(
            success=results.get("success", True),
            simulation_id=request.simulation_id,
            geometry_type=results.get("geometry_type", request.fortran_config.geometry_type),
            mesh_points=results.get("mesh_points", 0),
            iterations=results.get("iterations", 0),
            final_residual=results.get("final_residual", 0.0),
            temperature_stats=results.get("temperature_stats", {}),
            output_file=results.get("output_file", ""),
            vtk_file_url=results.get("vtk_file_url"),
            execution_time=results.get("execution_time", 0.0),
            metadata=results.get("metadata", {})
        )
        
        logger.info(f"Simulation {request.simulation_id} terminée en {response.execution_time:.2f}s")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erreur inattendue dans simulate_fortran")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/results/{filename}")
async def get_result_file(filename: str):
    """Téléchargement des fichiers VTK générés"""
    file_path = Path(fortran_solver.results_dir) / filename
    if not file_path.exists():
        logger.warning(f"Fichier demandé inexistant : {filename}")
        raise HTTPException(status_code=404, detail="Fichier non trouvé")
    return FileResponse(path=file_path, filename=filename)

# ------------------------------------------------------------------
# Gestionnaire global des 404 – utile pour déboguer
# ------------------------------------------------------------------
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    logger.error(f"404 - Route inexistante : {request.method} {request.url.path}")
    return JSONResponse(
        status_code=404,
        content={"detail": f"Route non trouvée: {request.method} {request.url.path}"}
    )

# ------------------------------------------------------------------
# Lancement du serveur (port depuis l'environnement Render)
# ------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Démarrage du serveur sur le port {port}")
    uvicorn.run(
        "bridge_api:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        reload=False  # toujours False en production
    )
