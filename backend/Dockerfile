# Utiliser une image Python officielle comme base
FROM python:3.11-slim

# Installer les dépendances système (gfortran pour le moteur physique)
RUN apt-get update && apt-get install -y \
    gfortran \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances Python
COPY solver-engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code source du moteur et des agents
COPY solver-engine/ ./solver-engine/
COPY agents/ ./agents/
COPY shared/ ./shared/

# Compiler le moteur thermique Fortran
WORKDIR /app/solver-engine
RUN gfortran -O3 thermal_solver.f90 -o thermal_solver.exe

# Exposer le port utilisé par FastAPI
EXPOSE 8000

# Commande pour lancer l'API
CMD ["python", "bridge_api.py"]
