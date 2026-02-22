# ============================================================================
# DOCKERFILE VOLTFLOW AI - ARCHITECTURE UNIFIÉE (FORTRAN + OPENFOAM)
# Version: 3.0 - ULTRA-SOLID PRODUCTION READY
# ============================================================================

# Utilisation de l'image officielle OpenFOAM comme base pour garantir l'installation correcte
FROM openfoam/openfoam10

USER root

# Configuration des variables d'environnement
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8000 \
    WM_PROJECT_DIR=/usr/lib/openfoam/openfoam10

# Installation des dépendances système (Python, Fortran et bibliothèques scientifiques)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    gfortran \
    build-essential \
    libopenblas-dev \
    liblapack-dev \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installation des dépendances Python
# Note: On utilise pip3 car l'image de base est Ubuntu
COPY backend/solver-engine/requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copier l'intégralité du code source
COPY . .

# --- CONFIGURATION FORTRAN ---
WORKDIR /app/backend/solver-engine
RUN gfortran -O3 thermal_solver.f90 -o thermal_solver.exe && \
    chmod +x thermal_solver.exe

# --- CONFIGURATION OPENFOAM ---
# S'assurer que les répertoires OpenFOAM sont accessibles et créer les dossiers de résultats
RUN mkdir -p /app/results && chmod 777 /app/results && \
    mkdir -p /app/backend/solver-engine/templates/openfoam

# Script pour sourcer OpenFOAM avant de lancer l'API
RUN echo "#!/bin/bash\n\
source /usr/lib/openfoam/openfoam10/etc/bashrc\n\
export PATH=\$PATH:/usr/lib/openfoam/openfoam10/bin\n\
exec uvicorn bridge_api:app --host 0.0.0.0 --port \$PORT" > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Exposer le port de l'API
EXPOSE 8000

# Utiliser le script d'entrée pour garantir que l'environnement OpenFOAM est chargé
ENTRYPOINT ["/app/entrypoint.sh"]
