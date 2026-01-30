// src/pages/SimulationEditor.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import { Save, Play, Download, Trash2, Thermometer, Loader2, AlertCircle, ChevronLeft, UploadCloud, Box, Settings, Eye, EyeOff, Grid3X3, Maximize2, Minimize2, Copy, FileUp, CheckCircle, XCircle, TestTube, ShieldAlert } from 'lucide-react';

// Services et hooks
import SimulationService, { type MeshType } from '@/services/simulation.service';
import { useSimulation } from '@/hooks/useSimulation';
import { useMaterials } from '@/hooks/useMaterials';
import { useAuth } from '@/contexts/AuthContext';

// Composants UI
import { SimulationStatus } from '@/components/SimulationStatus';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import VTKViewer from '@/components/Viewers/VTKViewer';
import type { IndustrialField, IndustrialConfig, IndustrialLegend, UnitSystem } from '@/components/Viewers/VTKViewer';

export default function SimulationEditor() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { simulation, results, isRunning, progress, startSimulation, refresh } = useSimulation(id || '', {
    realtime: true,
  });
  
  const { data: materialsDataRaw } = useMaterials();
  const { user } = useAuth();
  const materialsData = Array.isArray(materialsDataRaw) ? materialsDataRaw : [];

  // État du formulaire
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    geometryType: 'complex' as 'simple' | 'complex',
    geometryConfig: {
      file_url: '',
      file_name: '',
      file_size: 0,
      file_path: '',
      dimensions: { width: 100, height: 100, depth: 100 }
    },
    materialId: '',
    meshDensity: 'medium' as 'low' | 'medium' | 'high',
    initialTemp: '1000',
    ambientTemp: '25',
    coolingType: 'natural_convection' as 'natural_convection' | 'forced_convection' | 'radiation',
    convectionCoeff: '10',
    fluidType: 'air' as 'air' | 'water' | 'oil',
    fluidVelocity: '1',
    solverType: 'fem_fortran' as 'fem_fortran' | 'openfoam' | 'ansys' | 'comsol' | 'abaqus' | 'starccm' | 'fluent' | 'cfx' | 'pinn' | 'custom',
  });

  // État de la vue
  const [viewState, setViewState] = useState({
    isFullscreen: false,
    showGrid: true,
    showAxes: true,
    viewMode: 'volume' as 'volume' | 'slice' | 'wireframe' | 'point_cloud',
    colorMap: 'heat' as 'heat' | 'coolwarm' | 'rainbow' | 'viridis',
    opacity: 0.8,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'finalizing'>('idle');
  const [selectedPoint, setSelectedPoint] = useState<{
    position: [number, number, number];
    field_values: Record<string, number>;
    element_id?: number;
  } | null>(null);
  const [meshType, setMeshType] = useState<MeshType>('tetrahedral');

  // Référence pour setTimeout
  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup des timeouts
  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }
    };
  }, []);

  // 🔄 MÉCANISME DE RÉVEIL AUTOMATIQUE DU BACKEND
  useEffect(() => {
    const wakeBackend = async () => {
      try {
        console.log('🔔 Ping backend pour pré-chauffage...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        await fetch('https://voltflow-ai.onrender.com/api/v1/health', {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        console.log('✅ Backend prêt');
      } catch (err) {
        console.log('⚠️ Backend peut-être en cours de démarrage...');
      }
    };

    const wakeupTimer = setTimeout(wakeBackend, 500);
    
    return () => {
      clearTimeout(wakeupTimer);
    };
  }, []);

  // Initialisation des données
  useEffect(() => {
    if (id && simulation) {
      const bc = simulation.boundary_conditions as any;
      const gc = simulation.geometry_config as any;
      
      setFormData({
        name: simulation.name || '',
        description: simulation.description || '',
        geometryType: simulation.geometry_type || 'complex',
        geometryConfig: {
          file_url: gc?.file_url || '',
          file_name: gc?.file_name || '',
          file_size: gc?.file_size || 0,
          file_path: gc?.file_path || '',
          dimensions: gc?.dimensions || { width: 100, height: 100, depth: 100 }
        },
        materialId: simulation.material_id || '',
        meshDensity: simulation.mesh_density || 'medium',
        initialTemp: bc?.initial_temp?.toString() || '200',
        ambientTemp: bc?.ambient_temp?.toString() || '25',
        coolingType: bc?.cooling_type || 'natural_convection',
        convectionCoeff: bc?.convection_coeff?.toString() || '10',
        fluidType: bc?.fluid_type || 'air',
        fluidVelocity: bc?.fluid_velocity?.toString() || '1',
        solverType: simulation.solver_type || 'fem_fortran',
      });
    }
  }, [id, simulation]);

  // Préparation des données pour le viewer
  const prepareViewerData = useMemo(() => {
    if (!results) return null;

    const fields: IndustrialField[] = [];
    if (results.temperature_field && results.temperature_field.values) {
      const tempValues = results.temperature_field.values;
      const tempArray = Array.isArray(tempValues) ? tempValues : Object.values(tempValues);
      
      fields.push({
        id: 'temperature',
        name: 'Temperature',
        type: 'temperature',
        values: new Float32Array(tempArray),
        units: '°C',
        min: Math.min(...tempArray),
        max: Math.max(...tempArray),
        timestamp: simulation?.created_at || new Date().toISOString(),
        material: formData.materialId ? 
          materialsData.find(m => m.id === formData.materialId)?.name.toLowerCase() as any : 'steel',
        thermal_conductivity: materialsData.find(m => m.id === formData.materialId)?.conductivity || 50,
      });
    }

    const config: Partial<IndustrialConfig> = {
      max_memory_mb: 2048,
      target_fps: 60,
      lod_enabled: true,
      default_view: 'isometric',
      lighting: 'engineering',
      background: 'dark',
      unit_system: 'si' as UnitSystem,
      precision: 2,
      annotations: true,
    };

    const legend: IndustrialLegend = {
      type: 'scientific',
      min: fields[0]?.min || 0,
      max: fields[0]?.max || 100,
      num_ticks: 7,
      format: '0.0',
      units: '°C',
      color_map: viewState.colorMap,
      show_gradient: true,
      show_values: true,
      show_units: true,
      safety_thresholds: {
        critical: 800,
        warning: 500,
        safe: 200,
      },
    };

    return {
      mesh: {
        url: results.vtk_file_url || results.geometry_url || '',
        type: results.vtk_file_url?.endsWith('.vtp') ? 'vtp' : 
              results.vtk_file_url?.endsWith('.stl') ? 'stl' : 'vtp',
        metadata: results.mesh_metadata,
      },
      fields,
      config,
      legend,
      simulation: simulation ? {
        engine: simulation.solver_type || 'fem_fortran',
        case_name: simulation.name,
        version: '1.0',
        timestamp: simulation.created_at || new Date().toISOString(),
      } : undefined,
    };
  }, [results, simulation, formData.materialId, materialsData, viewState.colorMap]);

  // 🔥 GESTION DES FICHIERS - VERSION CORRIGÉE
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Reset complet avant nouvel upload
    setUploadingFile(true);
    setUploadError(null);
    setUploadProgress(0);
    setUploadPhase('uploading');
    
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current);
      uploadTimeoutRef.current = null;
    }

    const file = e.target.files?.[0];
    if (!file || !user?.id) {
      setUploadingFile(false);
      setUploadPhase('idle');
      toast.error('Aucun fichier sélectionné ou utilisateur non connecté');
      return;
    }

    // Validation simplifiée (uniquement extension)
    const validExtensions = ['.stl', '.step', '.stp', '.obj', '.vtp', '.vti', '.ply', '.vtk', '.iges', '.igs', '.vtu'];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExt)) {
      setUploadingFile(false);
      setUploadPhase('idle');
      toast.error(`Extension non supportée: ${fileExt}. Formats: ${validExtensions.join(', ')}`);
      return;
    }

    // Validation taille
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadingFile(false);
      setUploadPhase('idle');
      toast.error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 50MB`);
      return;
    }

    try {
      console.log('🚀 Début upload:', file.name);
      
      // 🔥 Timeout ABSOLU de 45 secondes
      const timeoutPromise = new Promise<never>((_, reject) => {
        uploadTimeoutRef.current = setTimeout(() => {
          reject(new Error('Upload timeout: 45 secondes dépassées'));
        }, 45000);
      });

      // Simulation de progression
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 80) {
            return Math.min(prev + 5, 80);
          } else {
            if (uploadPhase !== 'finalizing') {
              setUploadPhase('finalizing');
            }
            return Math.min(prev + 2, 95);
          }
        });
      }, 500);

      // 🔥 UPLOAD VIA LE SERVICE
      const uploadPromise = (async () => {
        try {
          console.log('🔄 Tentative upload via SimulationService...');
          const result = await SimulationService.uploadGeometry({
            file,
            userId: user.id,
            simulationId: id,
            geometryConfig: formData.geometryConfig,
            meshType: meshType
          });
          
          clearInterval(progressInterval);
          setUploadPhase('idle');
          setUploadProgress(100);
          
          console.log('✅ Upload réussi:', result);
          
          // Mise à jour du formulaire
          setFormData(prev => ({
            ...prev,
            geometryConfig: {
              ...prev.geometryConfig,
              file_url: result.fileUrl,
              file_name: result.fileName || file.name,
              file_size: result.fileSize || file.size,
              file_path: result.path || '',
              dimensions: prev.geometryConfig.dimensions,
              uploaded_at: new Date().toISOString(),
              file_type: result.fileType || 'application/octet-stream',
            },
          }));
          
          toast.success('✅ Fichier téléchargé avec succès');
          
          // 🔥 Rafraîchir la simulation pour inclure les mesh_data
          if (id) {
            setTimeout(() => {
              refresh();
            }, 1000);
          }
          
          return result;
          
        } catch (error: any) {
          clearInterval(progressInterval);
          setUploadPhase('idle');
          throw error;
        }
      })();

      // Exécution avec timeout
      await Promise.race([uploadPromise, timeoutPromise]);
      
      // Petite pause pour montrer le 100%
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error: any) {
      console.error('❌ Upload échoué:', error);
      
      let errorMessage = error.message || 'Erreur inconnue';
      
      // Messages d'erreur explicites et précis
      if (errorMessage.includes('415') || errorMessage.includes('MIME')) {
        errorMessage = "Type de fichier non supporté par le serveur.";
      } else if (errorMessage.includes('403') || errorMessage.includes('permission')) {
        errorMessage = "Erreur de permissions. Contactez l'administrateur.";
      } else if (errorMessage.includes('timeout')) {
        errorMessage = "Le serveur n'a pas confirmé l'upload. Réessayez.";
      } else if (errorMessage.includes('already exists')) {
        errorMessage = "Un fichier avec ce nom existe déjà. Renommez votre fichier.";
      } else if (errorMessage.includes('User ID mismatch')) {
        errorMessage = "Vous ne pouvez uploader que pour votre propre compte.";
      }
      
      setUploadError(errorMessage);
      toast.error(`❌ Échec de l'upload: ${errorMessage}`);
    } finally {
      // Toujours reset l'état d'upload
      setUploadingFile(false);
      setUploadPhase('idle');
      setUploadProgress(0);
      
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }
      
      // Reset du champ fichier
      if (e.target) e.target.value = '';
    }
  };

  // 🔥 FONCTION DE TEST (génération fichier VTP simple)
  const generateTestVTP = () => {
    const testVTP = `<?xml version="1.0"?>
<VTKFile type="PolyData" version="1.0" byte_order="LittleEndian">
  <PolyData>
    <Piece NumberOfPoints="8" NumberOfPolys="12">
      <Points>
        <DataArray type="Float32" NumberOfComponents="3" format="ascii">
          0 0 0 1 0 0 1 1 0 0 1 0
          0 0 1 1 0 1 1 1 1 0 1 1
        </DataArray>
      </Points>
      <Polys>
        <DataArray type="Int32" Name="connectivity" format="ascii">
          0 1 2 0 2 3 4 5 6 4 6 7
          0 1 5 0 5 4 1 2 6 1 6 5
          2 3 7 2 7 6 3 0 4 3 4 7
        </DataArray>
        <DataArray type="Int32" Name="offsets" format="ascii">
          3 6 9 12 15 18 21 24 27 30 33 36
        </DataArray>
      </Polys>
      <PointData Scalars="Temperature">
        <DataArray type="Float32" Name="Temperature" format="ascii">
          200 180 160 140 120 100 80 60
        </DataArray>
      </PointData>
    </Piece>
  </PolyData>
</VTKFile>`;

    const blob = new Blob([testVTP], { type: 'application/xml' });
    const file = new File([blob], 'test_cube.vtp', { type: 'application/xml' });
    
    // Simuler upload
    const event = { target: { files: [file] } } as React.ChangeEvent<HTMLInputElement>;
    handleFileUpload(event);
  };

  // Sauvegarde
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom de la simulation est requis');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        geometryType: formData.geometryType,
        config: {
          geometry_config: formData.geometryConfig,
          material_id: formData.materialId,
          mesh_density: formData.meshDensity,
          boundary_conditions: {
            initial_temp: parseFloat(formData.initialTemp),
            ambient_temp: parseFloat(formData.ambientTemp),
            cooling_type: formData.coolingType,
            convection_coeff: parseFloat(formData.convectionCoeff),
            fluid_type: formData.fluidType,
            fluid_velocity: parseFloat(formData.fluidVelocity),
          },
          solver_type: formData.solverType,
        },
      };

      if (id) {
        await SimulationService.updateSimulation(id, payload);
        toast.success('✅ Simulation mise à jour');
        refresh();
      } else {
        const newSim = await SimulationService.createSimulation(payload);
        toast.success('✅ Simulation créée');
        setLocation(`/simulation/${newSim.id}`);
      }
    } catch (error: any) {
      console.error('❌ Save error:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // 🔥 FONCTION START SIMULATION COMPATIBLE
  const handleStartSimulation = async () => {
    if (!id || !user?.id) {
      toast.error('Simulation ou utilisateur non valide');
      return;
    }

    try {
      const config = {
        geometry_config: formData.geometryConfig,
        material_id: formData.materialId,
        mesh_density: formData.meshDensity,
        boundary_conditions: {
          initial_temp: parseFloat(formData.initialTemp),
          ambient_temp: parseFloat(formData.ambientTemp),
          cooling_type: formData.coolingType,
          convection_coeff: parseFloat(formData.convectionCoeff),
          fluid_type: formData.fluidType,
          fluid_velocity: parseFloat(formData.fluidVelocity),
        },
        solver_type: formData.solverType,
      };

      const result = await SimulationService.startSimulation(id, config);
      
      if (result.success) {
        toast.success('✅ Simulation lancée avec succès');
        refresh();
      } else {
        toast.error(`❌ Erreur: ${result.message || 'Échec du lancement'}`);
      }
    } catch (error: any) {
      console.error('❌ Start simulation error:', error);
      toast.error(error.message || 'Erreur lors du lancement de la simulation');
    }
  };

  // Export des résultats
  const handleExport = async (format: 'png' | 'pdf' | 'csv' | 'vtk') => {
    if (!results) return;

    try {
      setIsExporting(true);
      let url = '';
      let filename = `simulation_${id}_${Date.now()}_${format}`;

      switch (format) {
        case 'png':
          if (results.vtk_file_url) {
            url = results.vtk_file_url.replace('.vtp', '.png').replace('.stl', '.png');
            filename += '.png';
          } else {
            toast.error('Données de visualisation non disponibles');
            return;
          }
          break;
        case 'csv':
          if (results.temperature_data_url) {
            url = results.temperature_data_url;
            filename += '.csv';
          } else {
            toast.error('Données CSV non disponibles');
            return;
          }
          break;
        case 'vtk':
          url = results.vtk_file_url || '';
          filename += '.vtk';
          break;
      }

      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`✅ Export ${format} téléchargé`);
      }
    } catch (error) {
      console.error('❌ Export error:', error);
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  // Gestion de la sélection de points
  const handlePointSelected = useCallback((data: {
    position: [number, number, number];
    field_values: Record<string, number>;
    distance_to_boundary?: number;
    element_id?: number;
  }) => {
    setSelectedPoint(data);
    const temp = data.field_values.temperature;
    if (temp !== undefined) {
      toast.info(`📌 Température sélectionnée: ${temp.toFixed(1)}°C`, {
        description: `Position: ${data.position.map(v => v.toFixed(2)).join(', ')}`,
        duration: 3000,
      });
    }
  }, []);

  // Copie des données
  const copySelectedPointData = () => {
    if (!selectedPoint) return;
    const text = JSON.stringify(selectedPoint, null, 2);
    navigator.clipboard.writeText(text);
    toast.success('📋 Données copiées dans le presse-papier');
  };

  // Toggle plein écran
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setViewState(prev => ({ ...prev, isFullscreen: true }));
    } else {
      document.exitFullscreen();
      setViewState(prev => ({ ...prev, isFullscreen: false }));
    }
  }, []);

  // Formatage du nom de fichier
  const formatFileName = (fileName: string) => {
    if (fileName.length > 30) {
      return fileName.substring(0, 15) + '...' + fileName.substring(fileName.length - 10);
    }
    return fileName;
  };

  // Rendu du bouton upload avec état
  const renderUploadButton = () => {
    if (uploadingFile) {
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              {uploadPhase === 'uploading' ? 'Upload en cours...' : 'Finalisation serveur...'} {uploadProgress}%
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <p className="text-xs text-zinc-400 mt-1">
              {uploadPhase === 'uploading' 
                ? 'Transfert du fichier vers le serveur...'
                : 'Traitement et validation par le serveur...'}
            </p>
          )}
        </div>
      );
    }

    return (
      <>
        <UploadCloud className="w-4 h-4" />
        Choisir un fichier
      </>
    );
  };

  // 🔥 AFFICHAGE DES MESH_DATA
  const [meshData, setMeshData] = useState<any[]>([]);
  
  useEffect(() => {
    const loadMeshData = async () => {
      if (!id) return;
      
      try {
        const data = await SimulationService.getMeshData(id);
        setMeshData(data);
      } catch (error) {
        console.error('❌ Erreur chargement mesh_data:', error);
      }
    };

    if (id) {
      loadMeshData();
    }
  }, [id, simulation]);

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* En-tête */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation('/dashboard')} className="hover:bg-zinc-800">
              <ChevronLeft className="w-4 h-4 mr-1" /> Retour
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">
                {id ? 'Éditeur de Simulation' : 'Nouvelle Simulation'}
              </h1>
              {simulation && (
                <div className="flex items-center gap-2 mt-1">
                  <SimulationStatus status={simulation.status} />
                  <span className="text-sm text-zinc-400">
                    {simulation.status === 'running' && progress !== undefined ? `${progress}%` : 
                     simulation.created_at ? new Date(simulation.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isSaving || !formData.name.trim()}
              className="min-w-[120px]"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Sauvegarder
            </Button>
            {id && (
              <Button
                onClick={handleStartSimulation}
                disabled={isRunning || !id}
                className="bg-blue-600 hover:bg-blue-700 min-w-[120px]"
              >
                {isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {isRunning ? 'En cours...' : 'Lancer'}
              </Button>
            )}
            {results && (
              <Button
                variant="outline"
                onClick={() => handleExport('png')}
                disabled={isExporting}
                className="min-w-[120px]"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Exporter
              </Button>
            )}
          </div>
        </div>

        {/* Messages d'erreur */}
        {simulation?.error_message && (
          <Alert variant="destructive" className="bg-red-900/20 border-red-800">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="ml-2">
              Erreur: {simulation.error_message}
            </AlertDescription>
          </Alert>
        )}

        {/* Contenu principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Colonne de gauche - Configuration */}
          <div className="lg:col-span-1 space-y-4 md:space-y-6">
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="w-5 h-5" />
                  Configuration de la Simulation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom de la simulation *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Ma simulation"
                    className="bg-zinc-800/50 border-zinc-700 focus:border-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Description de la simulation..."
                    className="bg-zinc-800/50 border-zinc-700 min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type de maillage</Label>
                  <Select value={meshType} onValueChange={(v: MeshType) => setMeshType(v)}>
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue placeholder="Sélectionner un type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="tetrahedral">Tétraédrique</SelectItem>
                      <SelectItem value="hexahedral">Hexaédrique</SelectItem>
                      <SelectItem value="polyhedral">Polyédrique</SelectItem>
                      <SelectItem value="unstructured">Non-structuré</SelectItem>
                      <SelectItem value="structured">Structuré</SelectItem>
                      <SelectItem value="surface">Surface</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Géométrie</Label>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          onChange={handleFileUpload}
                          className="hidden"
                          id="geo-upload"
                          accept=".stl,.step,.stp,.obj,.vtp,.vti,.ply,.vtk,.iges,.igs,.vtu"
                          disabled={uploadingFile}
                        />
                        <Button 
                          asChild 
                          variant="secondary" 
                          disabled={uploadingFile}
                          className="flex-1"
                        >
                          <label 
                            htmlFor="geo-upload" 
                            className={`cursor-pointer flex items-center justify-center gap-2 ${uploadingFile ? 'opacity-75' : ''}`}
                          >
                            {renderUploadButton()}
                          </label>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={generateTestVTP}
                          className="whitespace-nowrap"
                          title="Télécharger un fichier VTP de test"
                          disabled={uploadingFile}
                        >
                          <TestTube className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="text-xs text-zinc-400">
                        Formats supportés: STL, STEP, OBJ, VTP, VTI, PLY, VTK, IGES (max 50MB)
                      </div>
                    </div>

                    {/* État upload */}
                    {uploadingFile && (
                      <Alert className={`${uploadPhase === 'finalizing' ? 'bg-yellow-900/20 border-yellow-800' : 'bg-blue-900/20 border-blue-800'}`}>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <AlertDescription className="ml-2">
                          <div className="font-semibold">
                            {uploadPhase === 'uploading' ? 'Upload en cours' : 'Finalisation par le serveur'}
                          </div>
                          <div className="text-sm">
                            {uploadPhase === 'uploading' 
                              ? 'Transfert du fichier...'
                              : 'Validation et traitement en cours...'}
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {uploadError && (
                      <Alert variant="destructive" className="bg-red-900/20 border-red-800">
                        <ShieldAlert className="w-4 h-4" />
                        <AlertDescription className="ml-2">
                          <div className="font-semibold mb-1">Erreur d'upload</div>
                          <div className="mb-2 text-sm">{uploadError}</div>
                          <div className="text-xs text-red-300">
                            Conseils: 1. Vérifiez votre connexion 2. Réessayez avec un fichier plus petit 3. Contactez le support
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {formData.geometryConfig.file_name && !uploadingFile && (
                      <div className="p-3 bg-green-900/20 rounded border border-green-800/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <div>
                              <div className="font-medium truncate max-w-[200px]" title={formData.geometryConfig.file_name}>
                                {formatFileName(formData.geometryConfig.file_name)}
                              </div>
                              <div className="text-xs text-green-300">
                                ✓ Prêt pour simulation
                              </div>
                            </div>
                          </div>
                          {formData.geometryConfig.file_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(formData.geometryConfig.file_url, '_blank')}
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="material">Matériau</Label>
                  <Select value={formData.materialId} onValueChange={v => setFormData({...formData, materialId: v})}>
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue placeholder="Sélectionner un matériau" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-[200px]">
                      {materialsData.map(material => (
                        <SelectItem key={material.id} value={material.id} className="hover:bg-zinc-800 focus:bg-zinc-800">
                          {material.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="initialTemp">Temp. initiale (°C)</Label>
                    <Input
                      id="initialTemp"
                      type="number"
                      value={formData.initialTemp}
                      onChange={e => setFormData({...formData, initialTemp: e.target.value})}
                      className="bg-zinc-800/50 border-zinc-700"
                      min="0" max="2000" step="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ambientTemp">Temp. ambiante (°C)</Label>
                    <Input
                      id="ambientTemp"
                      type="number"
                      value={formData.ambientTemp}
                      onChange={e => setFormData({...formData, ambientTemp: e.target.value})}
                      className="bg-zinc-800/50 border-zinc-700"
                      min="-100" max="100" step="1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meshDensity">Densité de maillage</Label>
                  <Select value={formData.meshDensity} onValueChange={v => setFormData({...formData, meshDensity: v as any})}>
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="low">Faible (rapide)</SelectItem>
                      <SelectItem value="medium">Moyen (équilibré)</SelectItem>
                      <SelectItem value="high">Élevé (précis)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="solverType">Méthode de calcul</Label>
                  <Select value={formData.solverType} onValueChange={v => setFormData({...formData, solverType: v as any})}>
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="fem_fortran">FEM Fortran (recommandé)</SelectItem>
                      <SelectItem value="openfoam">OpenFOAM</SelectItem>
                      <SelectItem value="comsol">COMSOL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Section Mesh Data */}
            {meshData.length > 0 && (
              <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Grid3X3 className="w-4 h-4" />
                    Fichiers de maillage ({meshData.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {meshData.map((mesh) => (
                    <div key={mesh.id} className="p-3 bg-zinc-800/30 rounded border border-zinc-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Box className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-medium truncate max-w-[180px]" title={mesh.file_name}>
                            {mesh.file_name?.split('/').pop() || 'Fichier de maillage'}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {mesh.mesh_type || 'N/A'}
                        </Badge>
                      </div>
                      <div className="text-xs text-zinc-400 space-y-1">
                        <div>Taille: {(mesh.file_size / 1024 / 1024).toFixed(2)} MB</div>
                        <div>Créé: {new Date(mesh.created_at).toLocaleDateString()}</div>
                      </div>
                      {mesh.file_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-2 text-xs"
                          onClick={() => window.open(mesh.file_url, '_blank')}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Visualiser
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Informations du point sélectionné */}
            {selectedPoint && (
              <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Thermometer className="w-4 h-4" />
                      Point sélectionné
                    </span>
                    <Button variant="ghost" size="sm" onClick={copySelectedPointData} className="h-6 px-2">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <div className="text-zinc-400 text-xs">X</div>
                        <div className="font-mono bg-zinc-800/50 p-1 rounded text-center">
                          {selectedPoint.position[0].toFixed(2)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-zinc-400 text-xs">Y</div>
                        <div className="font-mono bg-zinc-800/50 p-1 rounded text-center">
                          {selectedPoint.position[1].toFixed(2)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-zinc-400 text-xs">Z</div>
                        <div className="font-mono bg-zinc-800/50 p-1 rounded text-center">
                          {selectedPoint.position[2].toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <Separator className="my-2" />
                    {Object.entries(selectedPoint.field_values).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-zinc-400">{key}:</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${
                            key === 'temperature' ?
                              value > 500 ? 'text-red-500' :
                              value > 200 ? 'text-orange-500' : 'text-green-500'
                              : ''
                          }`}>
                            {value.toFixed(1)}°C
                          </span>
                          {key === 'temperature' && value > 500 && (
                            <Badge variant="outline" className="bg-red-900/30 text-red-300 text-xs">
                              Critique
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    {selectedPoint.element_id !== undefined && (
                      <div className="text-xs text-zinc-500 mt-2">
                        ID élément: {selectedPoint.element_id}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Colonne de droite - Visualisation et résultats */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Contrôles de la vue */}
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" size="sm" onClick={toggleFullscreen} className="flex items-center gap-2">
                      {viewState.isFullscreen ? (
                        <>
                          <Minimize2 className="w-4 h-4" />
                          <span>Quitter plein écran</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-4 h-4" />
                          <span>Plein écran</span>
                        </>
                      )}
                    </Button>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={viewState.showGrid}
                        onCheckedChange={checked => setViewState(prev => ({ ...prev, showGrid: checked }))}
                      />
                      <Label className="text-sm cursor-pointer">Grille</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={viewState.showAxes}
                        onCheckedChange={checked => setViewState(prev => ({ ...prev, showAxes: checked }))}
                      />
                      <Label className="text-sm cursor-pointer">Axes</Label>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select value={viewState.viewMode} onValueChange={v => setViewState(prev => ({ ...prev, viewMode: v as any }))}>
                      <SelectTrigger className="w-[140px] bg-zinc-800/50 border-zinc-700">
                        <SelectValue placeholder="Mode" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="volume">Volume</SelectItem>
                        <SelectItem value="wireframe">Fil de fer</SelectItem>
                        <SelectItem value="point_cloud">Points</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={viewState.colorMap} onValueChange={v => setViewState(prev => ({ ...prev, colorMap: v as any }))}>
                      <SelectTrigger className="w-[140px] bg-zinc-800/50 border-zinc-700">
                        <SelectValue placeholder="Palette" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="heat">Chaleur</SelectItem>
                        <SelectItem value="coolwarm">Froid-Chaud</SelectItem>
                        <SelectItem value="rainbow">Arc-en-ciel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm cursor-pointer">Opacité</Label>
                    <span className="text-sm text-zinc-400">{Math.round(viewState.opacity * 100)}%</span>
                  </div>
                  <Slider
                    value={[viewState.opacity]}
                    onValueChange={([value]) => setViewState(prev => ({ ...prev, opacity: value }))}
                    min={0.1} max={1} step={0.1}
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Onglets principaux */}
            <Tabs defaultValue="visualizer" className="w-full">
              <TabsList className="bg-zinc-900/50 border-zinc-800 w-full">
                <TabsTrigger value="visualizer" className="flex-1 data-[state=active]:bg-zinc-800">
                  <Box className="w-4 h-4 mr-2" />
                  Visualisation 3D
                </TabsTrigger>
                <TabsTrigger value="results" className="flex-1 data-[state=active]:bg-zinc-800">
                  <Thermometer className="w-4 h-4 mr-2" />
                  Résultats
                </TabsTrigger>
                <TabsTrigger value="details" className="flex-1 data-[state=active]:bg-zinc-800">
                  <Settings className="w-4 h-4 mr-2" />
                  Détails
                </TabsTrigger>
              </TabsList>

              {/* Onglet Visualisation */}
              <TabsContent value="visualizer" className="mt-4">
                {prepareViewerData ? (
                  <div className={`rounded-lg overflow-hidden border border-zinc-800 ${
                    viewState.isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'h-[600px]'
                  }`}>
                    {viewState.isFullscreen && (
                      <div className="absolute top-4 right-4 z-10">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={toggleFullscreen}
                          className="bg-black/50 backdrop-blur-sm"
                        >
                          <Minimize2 className="w-4 h-4 mr-2" />
                          Quitter plein écran
                        </Button>
                      </div>
                    )}
                    <VTKViewer
                      mesh={prepareViewerData.mesh}
                      fields={prepareViewerData.fields}
                      config={prepareViewerData.config}
                      legend={prepareViewerData.legend}
                      simulation={prepareViewerData.simulation}
                      onPointSelected={handlePointSelected}
                      show_controls={true}
                      show_stats={true}
                      show_annotations={true}
                      show_coordinates={true}
                      className="w-full h-full"
                    />
                  </div>
                ) : isRunning ? (
                  <div className="h-[600px] bg-zinc-900/50 border border-zinc-800 rounded-lg flex flex-col items-center justify-center text-zinc-500">
                    <div className="relative">
                      <Loader2 className="w-16 h-16 animate-spin mb-4 text-blue-500" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold">{progress}%</span>
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="text-lg font-semibold">Simulation en cours</div>
                      <div className="text-sm">Calcul des températures...</div>
                      {progress !== undefined && (
                        <div className="w-64 mx-auto">
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="text-xs mt-2 text-center">
                            Progression: {progress}% - {simulation?.solver_type || 'FEM Fortran'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[600px] bg-zinc-900/50 border border-zinc-800 rounded-lg flex flex-col items-center justify-center text-zinc-500 p-6 text-center">
                    <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                      <Box className="w-10 h-10" />
                    </div>
                    <div className="text-xl font-semibold mb-2">
                      {id ? 'Simulation prête' : 'Nouvelle simulation'}
                    </div>
                    <div className="text-sm mb-6 max-w-md">
                      {id ? 'Lancez la simulation pour générer les résultats et visualiser le modèle 3D.' : 
                           'Configurez et sauvegardez votre simulation pour commencer.'}
                    </div>
                    <div className="flex gap-3">
                      {id ? (
                        <>
                          <Button
                            onClick={handleStartSimulation}
                            disabled={isRunning}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Lancer la simulation
                          </Button>
                          {!formData.geometryConfig.file_name && (
                            <Button
                              variant="outline"
                              onClick={() => document.getElementById('geo-upload')?.click()}
                            >
                              <UploadCloud className="w-4 h-4 mr-2" />
                              Ajouter une géométrie
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          onClick={handleSave}
                          disabled={!formData.name.trim()}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Créer la simulation
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Onglet Résultats */}
              <TabsContent value="results" className="mt-4">
                {results ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm text-zinc-400 mb-1">Température Maximale</div>
                              <div className="text-3xl font-bold text-red-500">
                                {results.max_temperature?.toFixed(1)}°C
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">Point le plus chaud</div>
                            </div>
                            <Separator />
                            <div>
                              <div className="text-sm text-zinc-400 mb-1">Température Minimale</div>
                              <div className="text-xl font-medium text-blue-500">
                                {results.min_temperature?.toFixed(1)}°C
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">Point le plus froid</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm text-zinc-400 mb-1">Fidélité de Simulation</div>
                              <div className={`text-3xl font-bold ${
                                ((1 - (results.uncertainty_score || 0)) * 100) > 95 ? 'text-green-500' :
                                ((1 - (results.uncertainty_score || 0)) * 100) > 80 ? 'text-yellow-500' : 'text-red-500'
                              }`}>
                                {((1 - (results.uncertainty_score || 0)) * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">Précision du modèle</div>
                            </div>
                            <Separator />
                            <div>
                              <div className="text-sm text-zinc-400 mb-1">Score d'incertitude</div>
                              <div className="text-xl font-medium text-yellow-500">
                                {(results.uncertainty_score * 100)?.toFixed(1)}%
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">Marge d'erreur</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm text-zinc-400 mb-1">Temps de Calcul</div>
                              <div className="text-3xl font-bold text-cyan-500">
                                {results.computation_time?.toFixed(1)}s
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">Durée d'exécution</div>
                            </div>
                            <Separator />
                            <div>
                              <div className="text-sm text-zinc-400 mb-1">Points de Maillage</div>
                              <div className="text-xl font-medium text-purple-500">
                                {results.mesh_points?.toLocaleString() || 'N/A'}
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">Résolution du maillage</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Boutons d'export */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardHeader>
                        <CardTitle>Export des résultats</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleExport('png')}
                            disabled={isExporting || !results.vtk_file_url}
                            className="flex items-center gap-2"
                          >
                            {isExporting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            Image PNG
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleExport('csv')}
                            disabled={isExporting || !results.temperature_data_url}
                            className="flex items-center gap-2"
                          >
                            {isExporting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            Données CSV
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleExport('vtk')}
                            disabled={isExporting || !results.vtk_file_url}
                            className="flex items-center gap-2"
                          >
                            {isExporting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            Fichier VTK
                          </Button>
                        </div>
                        <div className="text-xs text-zinc-500 mt-2">
                          Téléchargez les résultats sous différents formats pour analyse
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <Thermometer className="w-16 h-16 mx-auto text-zinc-600 mb-4" />
                      <div className="text-lg font-semibold mb-2">Aucun résultat disponible</div>
                      <div className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
                        Les résultats de simulation seront affichés ici après exécution.
                        Lancez d'abord la simulation pour calculer les températures.
                      </div>
                      {id && (
                        <Button
                          onClick={handleStartSimulation}
                          disabled={isRunning}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Lancer la simulation
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Onglet Détails */}
              <TabsContent value="details" className="mt-4">
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="pt-6">
                    {simulation ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-zinc-400">ID Simulation</div>
                            <div className="font-mono text-sm bg-zinc-800/50 p-2 rounded mt-1 break-all">
                              {simulation.id}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-zinc-400">Statut</div>
                            <div className="flex items-center gap-2 mt-1">
                              <SimulationStatus status={simulation.status} />
                              <span className="text-sm">
                                {simulation.status === 'running' && progress !== undefined ? `${progress}%` : ''}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-zinc-400">Créée le</div>
                            <div className="mt-1">
                              {new Date(simulation.created_at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-zinc-400">Modifiée le</div>
                            <div className="mt-1">
                              {new Date(simulation.updated_at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        </div>
                        <Separator />
                        <div>
                          <div className="text-sm text-zinc-400 mb-2">Configuration complète</div>
                          <div className="bg-zinc-900 p-4 rounded-lg text-sm overflow-auto max-h-[300px]">
                            <pre className="whitespace-pre-wrap break-words text-xs">
                              {JSON.stringify(simulation, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {simulation.error_message && (
                          <>
                            <Separator />
                            <div>
                              <div className="text-sm text-red-400 mb-2">Détails de l'erreur</div>
                              <div className="bg-red-900/20 p-3 rounded border border-red-800/50">
                                <div className="font-mono text-sm">{simulation.error_message}</div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-zinc-500">
                        <Settings className="w-16 h-16 mx-auto mb-4" />
                        <div className="text-lg font-semibold mb-2">Aucune simulation chargée</div>
                        <div className="text-sm text-zinc-400">
                          Créez ou sélectionnez une simulation pour voir ses détails
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
