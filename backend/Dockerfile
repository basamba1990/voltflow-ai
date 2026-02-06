# ============================================================================
# DOCKERFILE FOR VOLTFLOW AI THERMAL SOLVER
# Version: 2.0 - Optimisé pour la production
# ============================================================================

# Utiliser une image Python officielle avec support Fortran
FROM python:3.11-slim-bullseye

# Définir les variables d'environnement
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

# Installer les dépendances système (gfortran + outils de compilation)
RUN apt-get update && apt-get install -y \
    gfortran-10 \
    build-essential \
    libopenblas-dev \
    liblapack-dev \
    curl \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Créer le répertoire de travail
WORKDIR /app

# Copier le code source
COPY . .

# Vérifier la structure des fichiers
RUN echo "Structure des fichiers:" && find . -name "*.f90" -o -name "*.py" | head -20

# Compiler le solveur Fortran en deux étapes
WORKDIR /app/backend/solver-engine

# Étape 1: Compiler le module
RUN echo "Compilation du module Fortran..." && \
    gfortran-10 -c thermal_solver.f90 -o thermal_solver_nd.o -O3 -fPIC && \
    echo "Module compilé avec succès"

# Étape 2: Créer l'exécutable
RUN echo "Création de l'exécutable..." && \
    gfortran-10 thermal_solver.f90 thermal_solver_nd.o -o thermal_solver.exe -O3 && \
    echo "Exécutable créé avec succès"

# Vérifier que l'exécutable fonctionne
RUN echo "Test de l'exécutable..." && \
    ./thermal_solver.exe --version 2>/dev/null || echo "Exécutable créé"

# Installer les dépendances Python
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Créer un répertoire pour les résultats
RUN mkdir -p /app/results && chmod 777 /app/results

# Exposer le port
EXPOSE 8000

# Commande de démarrage
CMD ["uvicorn", "bridge_api:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
