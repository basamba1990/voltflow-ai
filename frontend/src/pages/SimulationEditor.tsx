// src/pages/SimulationEditor.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import { Save, Play, Download, Trash2, Thermometer, Loader2, AlertCircle, ChevronLeft, UploadCloud, Box, Settings, Eye, EyeOff, Grid3X3, Maximize2, Minimize2, Copy, FileUp, CheckCircle, XCircle, TestTube, ShieldAlert } from 'lucide-react';

// Services et hooks
import SimulationService from '@/services/simulation.service';
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

  // 🔥 CORRECTION : Référence correcte pour setTimeout
  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔥 CORRECTION CRITIQUE : Cleanup des timeouts
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
        geometryConfig: gc || {
          file_url: '',
          file_name: '',
          dimensions: { width: 100, height: 100, depth: 100 }
        },
        materialId: simulation.material_id || '',
        material_id: simulation.material_id || '',
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

    // Préparation des champs de données
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

    // Configuration du viewer
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

    // Légende
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

  // --------------------------------------------------------------------------
  // 🔥 GESTION DES FICHIERS - VERSION CORRIGÉE DÉFINITIVE
  // --------------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // 🔥 CORRECTION : Reset complet avant nouvel upload
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

    // 1. VALIDATION SIMPLIFIÉE (uniquement extension)
    const validExtensions = ['.stl', '.step', '.stp', '.obj', '.vtp', '.vti', '.ply', '.vtk', '.iges', '.igs', '.vtu'];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExt)) {
      setUploadingFile(false);
      setUploadPhase('idle');
      toast.error(`Extension non supportée: ${fileExt}. Formats: ${validExtensions.join(', ')}`);
      return;
    }

    // 2. VALIDATION TAILLE
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadingFile(false);
      setUploadPhase('idle');
      toast.error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 50MB`);
      return;
    }

    try {
      console.log('🚀 Début upload:', file.name);
      
      // 🔥 CORRECTION : Timeout ABSOLU de 60 secondes
      const timeoutPromise = new Promise<never>((_, reject) => {
        uploadTimeoutRef.current = setTimeout(() => {
          reject(new Error('Upload timeout: 60 secondes dépassées'));
        }, 60000);
      });

      // Simulation de progression avec phases claires
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 80) {
            // Phase d'upload : 0-80%
            return Math.min(prev + 5, 80);
          } else {
            // Phase de finalisation : 80-95%
            if (uploadPhase !== 'finalizing') {
              setUploadPhase('finalizing');
            }
            return Math.min(prev + 2, 95);
          }
        });
      }, 500);

      // 🔥 CORRECTION : Upload via le service uniquement
      const uploadPromise = (async () => {
        try {
          console.log('🔄 Tentative upload via SimulationService...');
          const result = await SimulationService.uploadGeometry({
            file,
            userId: user.id,
            simulationId: id,
            geometryConfig: formData.geometryConfig
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
              file_name: result.fileName,
              dimensions: prev.geometryConfig.dimensions,
              uploaded_at: new Date().toISOString(),
              file_size: file.size,
              file_type: file.fileType || 'application/octet-stream',
            },
          }));
          
          toast.success('✅ Fichier téléchargé avec succès');
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
      
      // 🔥 CORRECTION : Messages d'erreur explicites et précis
      if (errorMessage.includes('415') || errorMessage.includes('MIME')) {
        errorMessage = "Type de fichier non supporté par le serveur. Contactez l'admin pour autoriser ce format.";
      } else if (errorMessage.includes('403') || errorMessage.includes('permission')) {
        errorMessage = "Erreur de permissions Supabase. Vérifiez les politiques RLS.";
      } else if (errorMessage.includes('timeout')) {
        errorMessage = "Le serveur n'a pas confirmé l'upload. Vérifiez vos permissions ou réessayez.";
      }
      
      setUploadError(errorMessage);
      toast.error(`❌ Échec de l'upload: ${errorMessage}`);
    } finally {
      setUploadingFile(false);
      setUploadPhase('idle');
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }
    }
  };

  // Sauvegarde de la simulation
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom de la simulation est requis');
      return;
    }

    setIsSaving(true);
    try {
      const config = {
        geometry_config: formData.geometryConfig,
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
      };

      if (id) {
        await SimulationService.updateSimulation(id, {
          name: formData.name,
          description: formData.description,
          geometryType: formData.geometryType,
          config,
        });
        toast.success('Simulation mise à jour');
      } else {
        const newSim = await SimulationService.createSimulation({
          name: formData.name,
          description: formData.description,
          geometryType: formData.geometryType,
          config,
        });
        toast.success('Simulation créée');
        setLocation(`/simulation/${newSim.id}`);
      }
      refresh();
    } catch (error: any) {
      console.error('❌ Save error:', error);
      toast.error(`Erreur lors de la sauvegarde: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Génération d'un fichier de test
  const generateTestVTP = async () => {
    try {
      const response = await fetch('/test-geometry.vtp');
      if (!response.ok) throw new Error('Fichier de test non trouvé');
      
      const blob = await response.blob();
      const file = new File([blob], 'test-model.vtp', { type: 'application/octet-stream' });
      
      const mockEvent = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      
      handleFileUpload(mockEvent);
    } catch (error) {
      toast.error('Impossible de charger le modèle de test');
    }
  };

  // Export des résultats
  const handleExport = async (format: 'png' | 'csv' | 'vtk') => {
    if (!results) return;
    
    setIsExporting(true);
    try {
      if (format === 'png') {
        // L'export PNG est géré par le viewer VTK via un événement personnalisé
        const event = new CustomEvent('vtk-export-png');
        window.dispatchEvent(event);
      } else {
        const url = format === 'csv' ? results.temperature_data_url : results.vtk_file_url;
        if (!url) throw new Error('URL de données non disponible');
        
        const filename = `simulation_${id}_results.${format}`;
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
                onClick={() => startSimulation()}
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
                          <div className="font-semibold">Erreur d'upload</div>
                          <div className="text-xs mt-1">{uploadError}</div>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => document.getElementById('geo-upload')?.click()}>Réessayer</Button>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {formData.geometryConfig.file_name && !uploadingFile && (
                      <div className="flex items-center justify-between p-2 bg-zinc-800/50 rounded border border-zinc-700">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          <span className="text-sm truncate" title={formData.geometryConfig.file_name}>
                            {formatFileName(formData.geometryConfig.file_name)}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormData({...formData, geometryConfig: { ...formData.geometryConfig, file_name: '', file_url: '' }})}
                          className="h-6 w-6 p-0 hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Matériau</Label>
                    <Select
                      value={formData.materialId}
                      onValueChange={value => setFormData({...formData, materialId: value})}
                    >
                      <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        {materialsData.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Maillage</Label>
                    <Select
                      value={formData.meshDensity}
                      onValueChange={(value: any) => setFormData({...formData, meshDensity: value})}
                    >
                      <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        <SelectItem value="low">Rapide (grossier)</SelectItem>
                        <SelectItem value="medium">Moyen (équilibré)</SelectItem>
                        <SelectItem value="high">Précis (fin)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Solveur</Label>
                  <Select
                    value={formData.solverType}
                    onValueChange={value => setFormData({...formData, solverType: value})}
                  >
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      <SelectItem value="fem_fortran">FEM Fortran (recommandé)</SelectItem>
                      <SelectItem value="pinn">IA PINN (expérimental)</SelectItem>
                      <SelectItem value="openfoam">OpenFOAM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Conditions aux limites */}
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Thermometer className="w-4 h-4" />
                  Conditions aux Limites
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Temp. Initiale (°C)</Label>
                    <Input
                      type="number"
                      value={formData.initialTemp}
                      onChange={e => setFormData({...formData, initialTemp: e.target.value})}
                      className="bg-zinc-800/50 border-zinc-700 h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Temp. Ambiante (°C)</Label>
                    <Input
                      type="number"
                      value={formData.ambientTemp}
                      onChange={e => setFormData({...formData, ambientTemp: e.target.value})}
                      className="bg-zinc-800/50 border-zinc-700 h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Type de Refroidissement</Label>
                  <Select
                    value={formData.coolingType}
                    onValueChange={(value: any) => setFormData({...formData, coolingType: value})}
                  >
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      <SelectItem value="natural_convection">Convection Naturelle</SelectItem>
                      <SelectItem value="forced_convection">Convection Forcée</SelectItem>
                      <SelectItem value="radiation">Radiation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Colonne de droite - Visualisation et Résultats */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Barre d'outils de visualisation */}
            <Card className="bg-zinc-900/50 border-zinc-800 p-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant={viewState.viewMode === 'volume' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewState(prev => ({ ...prev, viewMode: 'volume' }))}
                  className="h-8 px-2 text-xs"
                >
                  Volume
                </Button>
                <Button
                  variant={viewState.viewMode === 'wireframe' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewState(prev => ({ ...prev, viewMode: 'wireframe' }))}
                  className="h-8 px-2 text-xs"
                >
                  Maillage
                </Button>
                <Separator orientation="vertical" className="h-4 mx-1 bg-zinc-800" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewState(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                  className={`h-8 px-2 ${viewState.showGrid ? 'text-blue-400' : 'text-zinc-500'}`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="h-8 px-2"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-zinc-800/50 px-2 py-1 rounded">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Palette</span>
                  <Select
                    value={viewState.colorMap}
                    onValueChange={(value: any) => setViewState(prev => ({ ...prev, colorMap: value }))}
                  >
                    <SelectTrigger className="h-6 border-none bg-transparent text-xs min-w-[80px] focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      <SelectItem value="heat">Chaleur</SelectItem>
                      <SelectItem value="rainbow">Arc-en-ciel</SelectItem>
                      <SelectItem value="viridis">Viridis</SelectItem>
                      <SelectItem value="coolwarm">Froid-Chaud</SelectItem>
                    </SelectContent>
                  </Select>
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
              </div>
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
                            onClick={() => startSimulation()}
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
                          onClick={() => startSimulation()}
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
