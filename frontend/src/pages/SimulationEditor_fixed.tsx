// SimulationEditor_fixed.tsx - Corrections majeures pour la sauvegarde et l'affichage
// Note: Ceci est une version corrigée des fonctions critiques.

// ... (imports restants identiques)

  // Sauvegarde de la simulation corrigée
  const handleSaveSimulation = useCallback(async () => {
    if (!user?.id) {
      toast.error('Vous devez être connecté pour sauvegarder une simulation.');
      return;
    }

    setIsSaving(true);
    try {
      // Construction de l'objet de données correspondant aux attentes de createSimulation/updateSimulation
      const simulationData = {
        name: formData.name,
        description: formData.description,
        geometryType: formData.geometryType,
        config: {
          geometry_config: {
            ...formData.geometryConfig,
          },
          boundary_conditions: {
            initial_temp: parseFloat(formData.initialTemp),
            ambient_temp: parseFloat(formData.ambientTemp),
            cooling_type: formData.coolingType,
            convection_coeff: parseFloat(formData.convectionCoeff),
            fluid_type: formData.fluidType,
            fluid_velocity: parseFloat(formData.fluidVelocity),
          },
          material_id: formData.materialId,
          mesh_density: formData.meshDensity,
          solver_type: formData.solverType,
          nx: formData.nx,
          ny: formData.ny,
          nz: formData.nz,
        },
      };

      let savedSimulation;
      if (id) {
        savedSimulation = await SimulationService.updateSimulation(id, simulationData);
        toast.success('Simulation mise à jour avec succès !');
      } else {
        savedSimulation = await SimulationService.createSimulation(simulationData);
        toast.success('Simulation créée avec succès !');
        setLocation(`/simulation/${savedSimulation.id}`);
      }
      refresh();
    } catch (error: any) {
      console.error('Erreur sauvegarde simulation:', error);
      toast.error(`Échec de la sauvegarde: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [formData, id, user, setLocation, refresh]);

  // Rendu des statistiques corrigé pour utiliser les bons champs
  // (Dans le JSX, assurez-vous d'utiliser results.max_temperature ou results.temperature_stats.max)
  
  // Exemple de correction pour l'affichage des températures dans le JSX:
  /*
  <span className="text-sm font-mono font-bold text-red-500">
    {(results?.max_temperature ?? results?.temperature_stats?.max ?? 0).toFixed(1)}°C
  </span>
  */
