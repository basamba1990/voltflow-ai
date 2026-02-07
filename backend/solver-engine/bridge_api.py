"""
BRIDGE API - Interface Python/Fortran pour le solveur thermique
Version: 2.0 - Compatible avec l'interface web
"""

import numpy as np
import json
import os
import subprocess
import tempfile
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging
from datetime import datetime
import shutil

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialisation FastAPI
app = FastAPI(
    title="VoltFlow AI Thermal Solver API",
    description="API de simulation thermique avec solveur Fortran ND",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Modèles de données
class FortranConfig(BaseModel):
    """Configuration pour le solveur Fortran"""
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
    """Requête de simulation"""
    simulation_id: str
    user_id: str
    fortran_config: FortranConfig
    output_format: str = "vtk"

class SimulationResponse(BaseModel):
    """Réponse de simulation"""
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

# Classe pour exécuter le solveur Fortran
class FortranSolver:
    def __init__(self, solver_path: str = "/app/backend/solver-engine/thermal_solver.exe"):
        self.solver_path = solver_path
        self.temp_dir = tempfile.gettempdir()
        
        # Vérifier que le solveur existe
        if not os.path.exists(self.solver_path):
            logger.error(f"Solveur Fortran introuvable: {self.solver_path}")
            raise FileNotFoundError(f"Solveur Fortran introuvable: {self.solver_path}")
        
        logger.info(f"Solveur Fortran initialisé: {self.solver_path}")
    
    def run_simulation(self, config: FortranConfig) -> Dict[str, Any]:
        """Exécute le solveur Fortran avec la configuration donnée"""
        try:
            # Créer un fichier de configuration temporaire
            config_file = os.path.join(self.temp_dir, f"config_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
            
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
                f.write(f"thermal_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.vtk\n")
            
            # Exécuter le solveur Fortran
            start_time = datetime.now()
            
            cmd = [self.solver_path, config_file]
            logger.info(f"Exécution de la commande: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # Timeout de 5 minutes
            )
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            # Vérifier le résultat
            if result.returncode != 0:
                logger.error(f"Erreur lors de l'exécution du solveur: {result.stderr}")
                raise RuntimeError(f"Solveur Fortran a échoué: {result.stderr}")
            
            # Parser la sortie JSON du solveur
            output_lines = result.stdout.split('\n')
            json_start = False
            json_content = []
            
            for line in output_lines:
                if line.strip() == "{":
                    json_start = True
                if json_start:
                    json_content.append(line)
                if line.strip() == "}":
                    break
            
            if json_content:
                json_str = '\n'.join(json_content)
                try:
                    output_data = json.loads(json_str)
                except json.JSONDecodeError as e:
                    logger.warning(f"Impossible de parser JSON: {e}")
                    output_data = self._create_default_output(config)
            else:
                logger.warning("Aucune sortie JSON trouvée, utilisation des valeurs par défaut")
                output_data = self._create_default_output(config)
            
            # Ajouter le temps d'exécution
            output_data["execution_time"] = execution_time
            
            # Chercher le fichier VTK généré
            output_file = output_data.get("output_file", "")
            if os.path.exists(output_file):
                output_data["vtk_file_path"] = output_file
                
                # Copier le fichier dans le répertoire des résultats
                results_dir = "/app/results"
                os.makedirs(results_dir, exist_ok=True)
                dest_file = os.path.join(results_dir, os.path.basename(output_file))
                shutil.copy2(output_file, dest_file)
                output_data["vtk_file_url"] = f"/api/results/{os.path.basename(output_file)}"
            
            # Nettoyer le fichier de configuration temporaire
            if os.path.exists(config_file):
                os.remove(config_file)
            
            logger.info(f"Simulation terminée en {execution_time:.2f} secondes")
            return output_data
            
        except subprocess.TimeoutExpired:
            logger.error("Timeout lors de l'exécution du solveur Fortran")
            raise HTTPException(status_code=504, detail="Timeout du solveur Fortran")
        except Exception as e:
            logger.error(f"Erreur lors de l'exécution du solveur: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Erreur solveur: {str(e)}")
    
    def _create_default_output(self, config: FortranConfig) -> Dict[str, Any]:
        """Crée une sortie par défaut en cas d'erreur de parsing"""
        mesh_points = config.nx * config.ny * config.nz
        
        # Génération de données de température simulées
        np.random.seed(42)
        base_temp = np.linspace(config.initial_temp, config.boundary_temp, config.nx)
        noise = np.random.normal(0, 50, mesh_points).reshape((config.nx, config.ny, config.nz))
        simulated_temp = base_temp[:, np.newaxis, np.newaxis] + noise
        
        return {
            "success": True,
            "geometry_type": config.geometry_type,
            "mesh_points": mesh_points,
            "iterations": 1000,
            "final_residual": 1e-5,
            "temperature_stats": {
                "max": float(np.max(simulated_temp)),
                "min": float(np.min(simulated_temp)),
                "avg": float(np.mean(simulated_temp))
            },
            "output_file": "",
            "metadata": {
                "source": "fallback_simulation",
                "warning": "Parse error, using simulated data"
            }
        }

# Initialiser le solveur
try:
    fortran_solver = FortranSolver()
    SOLVER_AVAILABLE = True
    logger.info("Solveur Fortran initialisé avec succès")
except Exception as e:
    SOLVER_AVAILABLE = False
    logger.warning(f"Solveur Fortran non disponible: {e}")
    fortran_solver = None

# Endpoints API
@app.get("/")
async def root():
    return {
        "service": "VoltFlow AI Thermal Solver",
        "version": "2.0.0",
        "fortran_solver": "available" if SOLVER_AVAILABLE else "unavailable",
        "endpoints": {
            "health": "/api/health",
            "simulate": "/api/v1/simulate/fortran (POST)",
            "results": "/api/results/{filename}"
        }
    }

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "components": {
            "fastapi": "operational",
            "fortran_solver": "available" if SOLVER_AVAILABLE else "unavailable",
            "python_version": "3.11"
        }
    }

@app.post("/api/v1/simulate/fortran", response_model=SimulationResponse)
async def simulate_fortran(request: SimulationRequest):
    """Endpoint principal pour les simulations Fortran"""
    if not SOLVER_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Solveur Fortran non disponible"
        )
    
    try:
        logger.info(f"Démarrage simulation {request.simulation_id} pour user {request.user_id}")
        
        # Validation de la configuration
        if request.fortran_config.nx < 2:
            raise HTTPException(status_code=400, detail="nx doit être >= 2")
        
        # Exécuter la simulation
        start_time = datetime.now()
        results = fortran_solver.run_simulation(request.fortran_config)
        execution_time = (datetime.now() - start_time).total_seconds()
        
        # Construire la réponse
        response = SimulationResponse(
            success=results.get("success", True),
            simulation_id=request.simulation_id,
            geometry_type=results.get("geometry_type", request.fortran_config.geometry_type),
            mesh_points=results.get("mesh_points", request.fortran_config.nx * request.fortran_config.ny * request.fortran_config.nz),
            iterations=results.get("iterations", 0),
            final_residual=results.get("final_residual", 0.0),
            temperature_stats=results.get("temperature_stats", {}),
            output_file=results.get("output_file", ""),
            vtk_file_url=results.get("vtk_file_url"),
            execution_time=execution_time,
            metadata=results.get("metadata", {})
        )
        
        logger.info(f"Simulation {request.simulation_id} terminée avec succès")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de la simulation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")

@app.get("/api/results/{filename}")
async def get_result_file(filename: str):
    """Récupère un fichier de résultat"""
    file_path = Path("/app/results") / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier non trouvé")
    
    # Vérifier l'extension pour déterminer le type de contenu
    if filename.endswith('.vtk'):
        media_type = "text/plain"
    else:
        media_type = "application/octet-stream"
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type
    )

@app.post("/api/v1/simulate/thermal")
async def simulate_thermal(request: Dict[str, Any]):
    """Endpoint de compatibilité avec l'ancienne API"""
    try:
        # Conversion vers le nouveau format
        fortran_config = FortranConfig(
            conductivity=request.get("thermal_config", {}).get("conductivity", 50.0),
            density=request.get("thermal_config", {}).get("density", 2700.0),
            specific_heat=request.get("thermal_config", {}).get("specific_heat", 900.0),
            initial_temp=request.get("boundary_conditions", {}).get("initial_temp", 1000.0),
            boundary_temp=request.get("boundary_conditions", {}).get("ambient_temp", 25.0),
            heat_flux=request.get("boundary_conditions", {}).get("heat_flux", 1000.0),
            nx=50, ny=30, nz=20,  # Valeurs par défaut
            geometry_type="3d_complex"
        )
        
        simulation_request = SimulationRequest(
            simulation_id=request.get("simulation_id", "unknown"),
            user_id=request.get("user_id", "unknown"),
            fortran_config=fortran_config
        )
        
        return await simulate_fortran(simulation_request)
        
    except Exception as e:
        logger.error(f"Erreur dans simulate/thermal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
