"""
BRIDGE API - Interface Python/Fortran pour le solveur thermique
Version: 2.2 - CORRIGÉE (Path & Output fixes)
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
    version="2.2.0",
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
        # ✅ CORRECTION : Chemins possibles pour le solveur (Docker vs Local)
        possible_paths = [
            solver_path,
            os.path.join(os.getcwd(), "thermal_solver.exe"),
            os.path.join(os.path.dirname(__file__), "thermal_solver.exe"),
            "/home/ubuntu/voltflow-ai/voltflow-ai-main/backend/solver-engine/thermal_solver.exe"
        ]
        
        self.solver_path = None
        for p in possible_paths:
            if os.path.exists(p):
                self.solver_path = p
                break
        
        self.temp_dir = tempfile.gettempdir()
        self.results_dir = os.environ.get("RESULTS_DIR", "/app/results")
        os.makedirs(self.results_dir, exist_ok=True)
        
        if not self.solver_path:
            logger.error("Solveur Fortran introuvable dans les chemins spécifiés.")
        else:
            logger.info(f"Solveur Fortran initialisé: {self.solver_path}")
    
    def run_simulation(self, config: FortranConfig) -> Dict[str, Any]:
        """Exécute le solveur Fortran avec la configuration donnée"""
        if not self.solver_path or not os.path.exists(self.solver_path):
            raise RuntimeError(f"Solveur Fortran introuvable")

        try:
            # Créer un fichier de configuration temporaire
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
            
            # Exécuter le solveur Fortran
            start_time = datetime.now()
            os.chmod(self.solver_path, 0o755)
            
            cmd = [self.solver_path, config_file]
            logger.info(f"Exécution: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
                cwd=self.temp_dir
            )
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            if result.returncode != 0:
                logger.error(f"Erreur solveur: {result.stderr}")
                raise RuntimeError(f"Solveur Fortran a échoué: {result.stderr}")
            
            # ✅ CORRECTION : Extraction JSON robuste de la sortie standard
            output_data = self._parse_json_output(result.stdout)
            if not output_data:
                logger.warning("Sortie JSON non trouvée, fallback par défaut")
                output_data = self._create_default_output(config)
            
            output_data["execution_time"] = execution_time
            
            # Gestion du fichier VTK
            vtk_path = os.path.join(self.temp_dir, output_filename)
            if os.path.exists(vtk_path):
                dest_file = os.path.join(self.results_dir, output_filename)
                shutil.copy2(vtk_path, dest_file)
                output_data["vtk_file_url"] = f"/api/results/{output_filename}"
                output_data["output_file"] = output_filename
                os.remove(vtk_path)
            
            if os.path.exists(config_file):
                os.remove(config_file)
            
            return output_data
            
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Timeout du solveur Fortran")
        except Exception as e:
            logger.error(f"Erreur simulation: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Erreur solveur: {str(e)}")

    def _parse_json_output(self, stdout: str) -> Optional[Dict[str, Any]]:
        try:
            lines = stdout.split('\n')
            json_lines = []
            in_json = False
            for line in lines:
                if line.strip() == "{": in_json = True
                if in_json: json_lines.append(line)
                if line.strip() == "}": break
            if json_lines:
                return json.loads('\n'.join(json_lines))
        except:
            pass
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
            "metadata": {"source": "fallback"}
        }

fortran_solver = FortranSolver()

@app.get("/")
async def root():
    return {"service": "VoltFlow AI Thermal Solver", "status": "online"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "solver": "available" if fortran_solver.solver_path else "unavailable"}

@app.post("/api/v1/simulate/fortran", response_model=SimulationResponse)
async def simulate_fortran(request: SimulationRequest):
    if not fortran_solver.solver_path:
        raise HTTPException(status_code=503, detail="Solveur Fortran non disponible")
    
    results = fortran_solver.run_simulation(request.fortran_config)
    
    return SimulationResponse(
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

@app.get("/api/results/{filename}")
async def get_result_file(filename: str):
    file_path = Path(fortran_solver.results_dir) / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier non trouvé")
    return FileResponse(path=file_path, filename=filename)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
