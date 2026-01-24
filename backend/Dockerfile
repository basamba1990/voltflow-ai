# Utiliser une image Python officielle comme base
FROM python:3.11-slim

# Installer les dépendances système (gfortran pour le moteur physique)
# Ici, pas besoin de sudo car nous sommes root dans le container Docker
RUN apt-get update && apt-get install -y \
    gfortran \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances Python
COPY backend/solver-engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier tout le code source
COPY . .

# Compiler le moteur thermique Fortran
WORKDIR /app/backend/solver-engine
RUN gfortran -O3 thermal_solver.f90 -o thermal_solver.exe

# Revenir à la racine pour lancer l'API
WORKDIR /app/backend/solver-engine

# Exposer le port utilisé par FastAPI
EXPOSE 8000

# Commande pour lancer l'API
# On utilise l'hôte 0.0.0.0 pour que Render puisse router le trafic
CMD ["uvicorn", "bridge_api:app", "--host", "0.0.0.0", "--port", "8000"]
