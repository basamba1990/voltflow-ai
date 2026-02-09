# ============================================================================
# DOCKERFILE FOR VOLTFLOW AI THERMAL SOLVER - FIXED
# ============================================================================

FROM python:3.11-slim-bullseye

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8000

# Installer les dépendances système
RUN apt-get update && apt-get install -y \
    gfortran \
    build-essential \
    libopenblas-dev \
    liblapack-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier les dépendances Python d'abord pour le cache
COPY backend/solver-engine/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copier tout le code source
COPY . .

# Compiler le solveur Fortran
WORKDIR /app/backend/solver-engine
RUN gfortran -O3 thermal_solver.f90 -o thermal_solver.exe && \
    chmod +x thermal_solver.exe

# Créer le répertoire des résultats
RUN mkdir -p /app/results && chmod 777 /app/results

# Exposer le port
EXPOSE 8000

# Lancer l'API depuis le bon répertoire
CMD ["uvicorn", "bridge_api:app", "--host", "0.0.0.0", "--port", "8000"]
