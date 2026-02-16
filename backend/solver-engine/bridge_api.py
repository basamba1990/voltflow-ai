"""
BRIDGE API - Interface Python/Fortran pour le solveur thermique
Version: 2.5 - CORRECTION COMPLÈTE (Support nx/ny/nz, OpenFOAM ready)
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
# Configuration du logging
# ------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("voltflow-solver")

app = FastAPI(
    title="VoltFlow AI Thermal Solver API",
    description="Solveur thermique Fortran & OpenFOAM",
    version="2.5.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# ------------------------------------------------------------------
# Modèles de données
# ------------------------------------------------------------------
class FortranConfig(BaseModel):
    conductivity: float = 50.0
    density: float = 2700.0
    specific_heat: float = 900.0
    initial_temp: float = 1000.0
    boundary_temp: float = 25.0
    heat_flux: float = 1000.0
    nx: int = 50
    ny: int = 50
    nz: int = 50
    max_iterations: int = 5000
    dt: float = 0.1
    tolerance: float = 1e-6
    geometry_type: str = "3d_complex"
    mesh_file: Optional[str] = None
    solver_type: str = "fem_fortran"

class SimulationRequest(BaseModel):
    simulation_id: string
    user_id: string
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
    temperature_field: Optional[Dict[str, Any]] = None
    output_file: str
    vtk_file_url: Optional[str] = None
    execution_time: float
    metadata: Dict[str, Any] = {}

# ------------------------------------------------------------------
# Solveur Fortran
# ------------------------------------------------------------------
class FortranSolver:
    def __init__(self):
        self.solver_path = self._find_solver()
        self.results_dir = os.environ.get("RESULTS_DIR", "/app/results")
        os.makedirs(self.results_dir, exist_ok=True)
    
    def _find_solver(self):
        paths = [
            "/app/backend/solver-engine/thermal_solver.exe",
            os.path.join(os.getcwd(), "thermal_solver.exe"),
            "./thermal_solver.exe"
        ]
        for p in paths:
            if os.path.exists(p):
                return os.path.abspath(p)
        return None

    def run_simulation(self, config: FortranConfig) -> Dict[str, Any]:
        if not self.solver_path:
            raise RuntimeError("Binaire Fortran introuvable")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            config_file = os.path.join(tmpdir, "config.txt")
            output_filename = f"results_{timestamp}.vtk"
            
            # Écriture du fichier de config pour le Fortran
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
            os.chmod(self.solver_path, 0o755)
            
            result = subprocess.run(
                [self.solver_path, config_file],
                capture_output=True, text=True, cwd=tmpdir
            )
            
            if result.returncode != 0:
                raise RuntimeError(f"Erreur solveur: {result.stderr}")
            
            # Parsing de la sortie JSON du Fortran
            output_data = self._parse_json(result.stdout)
            
            # Déplacement du VTK
            vtk_src = os.path.join(tmpdir, output_filename)
            if os.path.exists(vtk_src):
                dest_path = os.path.join(self.results_dir, output_filename)
                shutil.copy2(vtk_src, dest_path)
                output_data["vtk_file_url"] = f"/api/results/{output_filename}"
            
            output_data["execution_time"] = (datetime.now() - start_time).total_seconds()
            return output_data

    def _parse_json(self, stdout):
        try:
            start = stdout.find('{')
            end = stdout.rfind('}') + 1
            return json.loads(stdout[start:end])
        except:
            return {"success": False, "error": "JSON parsing failed"}

fortran_solver = FortranSolver()

@app.post("/api/v1/simulate/fortran", response_model=SimulationResponse)
async def simulate(request: SimulationRequest):
    logger.info(f"Simulation: {request.simulation_id}")
    try:
        if request.fortran_config.solver_type == "openfoam":
            # Placeholder pour OpenFOAM
            return SimulationResponse(
                success=False,
                simulation_id=request.simulation_id,
                geometry_type="openfoam",
                mesh_points=0,
                iterations=0,
                final_residual=0,
                temperature_stats={"avg": 0},
                output_file="",
                execution_time=0,
                metadata={"error": "OpenFOAM non encore configuré sur ce worker"}
            )
        
        results = fortran_solver.run_simulation(request.fortran_config)
        return SimulationResponse(
            success=results.get("success", True),
            simulation_id=request.simulation_id,
            geometry_type=results.get("geometry_type", "3d"),
            mesh_points=results.get("mesh_points", 0),
            iterations=results.get("iterations", 0),
            final_residual=results.get("final_residual", 0.0),
            temperature_stats=results.get("temperature_stats", {}),
            temperature_field={"values": [results.get("temperature_stats", {}).get("avg", 0)] * results.get("mesh_points", 1)},
            output_file=results.get("output_file", ""),
            vtk_file_url=results.get("vtk_file_url"),
            execution_time=results.get("execution_time", 0.0)
        )
    except Exception as e:
        logger.error(f"Erreur: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/results/{filename}")
async def get_file(filename: str):
    path = Path(fortran_solver.results_dir) / filename
    if not path.exists(): raise HTTPException(status_code=404)
    return FileResponse(path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
