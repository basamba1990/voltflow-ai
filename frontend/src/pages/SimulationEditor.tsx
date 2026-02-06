// src/pages/SimulationEditor.tsx - VERSION CORRIGÉE COMPLÈTE
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';

// ✅ IMPORTS LUCIDE-REACT CORRIGÉS (noms exacts)
import { 
  Save, Play, Download, Trash2, Thermometer, Loader2, AlertCircle, 
  ChevronLeft, UploadCloud, Box, Settings, Eye, EyeOff, Grid3x3, 
  Maximize2, Minimize2, Copy, FileUp, CheckCircle, XCircle, 
  FlaskConical, Shield, Cpu, Cube, Square, BarChart3,
  // Note: 'Grid3X3' doit être 'Grid3x3' (minuscule 'x')
  // Note: 'ShieldAlert' n'existe pas, utiliser 'Shield'
  // Note: 'TestTube' n'existe pas, utiliser 'FlaskConical'
} from 'lucide-react';

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
  const { simulation, results, isRunning, progress, startSimulation: startSimulationHook, refresh } = useSimulation(id || '', {
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

  // ✅ FONCTIONS DE DÉTECTION CORRIGÉES
  const detectGeometryType = (fileName: string): '1d_rod' | '2d_plate' | '3d_complex' => {
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('rod') || lowerName.includes('1d') || lowerName.includes('bar')) {
      return '1d_rod';
    } else if (lowerName.includes('plate') || lowerName.includes('2d') || lowerName.includes('sheet')) {
      return '2d_plate';
    } else {
      return '3d_complex';
    }
  };

  const detectRecommendedSolver = (geometryType: string, fileExt: string): string => {
    if (geometryType === '1d_rod') return 'fem_fortran';
    if (geometryType === '2d_plate') return 'fem_fortran';
    if (fileExt === 'stl' || fileExt === 'step' || fileExt === 'stp') return 'openfoam';
    return 'fem_fortran';
  };

  const getGeometryIcon = (geometryType: string) => {
    switch (geometryType) {
      case '1d_rod': return BarChart3;
      case '2d_plate': return Square;
      case '3d_complex': return Cube;
      default: return Box;
    }
  };

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
        initialTemp: bc?.initial_temp?.toString() || '1000',  
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

  // ✅ GESTION DES FICHIERS - VERSION CORRIGÉE
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
    if (!file) {  
      setUploadingFile(false);  
      setUploadPhase('idle');  
      toast.error('Aucun fichier sélectionné');  
      return;  
    }  

    if (!id) {  
      setUploadingFile(false);  
      setUploadPhase('idle');  
      toast.error('Impossible d\'uploader: Simulation non sauvegardée. Veuillez d\'abord créer/sauvegarder la simulation.');  
      return;  
    }  

    // Validation extension  
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
        
      // Timeout absolu de 45 secondes  
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

      // Upload via le service corrigé  
      const uploadPromise = (async () => {  
        try {  
          console.log('🔄 Tentative upload via SimulationService...');  
          const result = await SimulationService.uploadGeometry({  
            file,  
            simulationId: id // Passer l'ID de la simulation  
          });  
            
          clearInterval(progressInterval);  
          setUploadPhase('idle');  
          setUploadProgress(100);  
            
          console.log('✅ Upload réussi:', result);  

          // ✅ DÉTECTION AUTOMATIQUE DU TYPE DE GÉOMÉTRIE
          const geometryType = detectGeometryType(result.fileName);
          const fileExtension = result.fileName.toLowerCase().split('.').pop() || '';
          const recommendedSolver = detectRecommendedSolver(geometryType, fileExtension);
          const GeometryIcon = getGeometryIcon(geometryType);

          // Mise à jour du formulaire AVEC DÉTECTION AUTOMATIQUE
          setFormData(prev => ({
            ...prev,
            geometryType: geometryType === '1d_rod' ? 'simple' : 'complex',
            solverType: recommendedSolver as any,
            meshDensity: geometryType === '1d_rod' ? 'high' : 
                        geometryType === '2d_plate' ? 'medium' : 'medium',
            geometryConfig: {
              ...prev.geometryConfig,
              file_url: result.fileUrl,
              file_name: result.fileName,
              file_size: result.fileSize || 0,
              file_path: result.path || '',
            }
          }));

          // Afficher une notification détaillée
          toast.success(
            <div className="flex items-start space-x-2">
              <GeometryIcon className="h-5 w-5 mt-0.5 text-blue-500" />
              <div>
                <p className="font-medium">Géométrie uploadée avec succès</p>
                <p className="text-sm text-gray-600">
                  Type détecté: <Badge variant="outline" className="ml-1">{geometryType}</Badge>
                  <br />
                  Solveur recommandé: <Badge variant="secondary" className="ml-1">{recommendedSolver}</Badge>
                </p>
              </div>
            </div>
          );
          
          refresh(); // Rafraîchir les données de la simulation  
          return result;  
        } catch (innerError: any) {  
          clearInterval(progressInterval);  
          setUploadPhase('idle');  
          setUploadProgress(0);  
          console.error('❌ Erreur interne upload:', innerError);  
          throw innerError; // Propager l'erreur pour le catch externe  
        }  
      })();  

      await Promise.race([uploadPromise, timeoutPromise]);  

    } catch (error: any) {  
      if (uploadTimeoutRef.current) {  
        clearTimeout(uploadTimeoutRef.current);  
        uploadTimeoutRef.current = null;  
      }  
      setUploadingFile(false);  
      setUploadPhase('idle');  
      setUploadProgress(0);  
      const errorMessage = error.message || 'Une erreur inconnue est survenue lors de l\'upload.';  
      setUploadError(errorMessage);  
      toast.error(`Échec de l'upload: ${errorMessage}`);  
      console.error('❌ Erreur handleFileUpload:', error);  
    }
  };

  const handleSaveSimulation = useCallback(async () => {
    if (!user?.id) {
      toast.error('Vous devez être connecté pour sauvegarder une simulation.');
      return;
    }

    setIsSaving(true);  
    try {  
      const simulationData = {  
        name: formData.name,  
        description: formData.description,  
        geometryType: formData.geometryType,  
        config: {  
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

  const handleStartSimulation = useCallback(async () => {
    if (!id) {
      toast.error('Veuillez sauvegarder la simulation avant de la lancer.');
      return;
    }
    if (!user?.id) {
      toast.error('Vous devez être connecté pour lancer une simulation.');
      return;
    }
    if (isRunning) {
      toast.info('La simulation est déjà en cours.');
      return;
    }

    try {  
      await startSimulationHook(id);  
      toast.success('Simulation lancée avec succès !');  
    } catch (error: any) {  
      console.error('Erreur lancement simulation:', error);  
      toast.error(`Échec du lancement: ${error.message}`);  
    }
  }, [id, user, isRunning, startSimulationHook]);

  const handleDeleteSimulation = useCallback(async () => {
    if (!id) return;
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette simulation ?')) return;

    try {  
      await SimulationService.deleteSimulation(id);  
      toast.success('Simulation supprimée avec succès !');  
      setLocation('/dashboard');  
    } catch (error: any) {  
      console.error('Erreur suppression simulation:', error);  
      toast.error(`Échec de la suppression: ${error.message}`);  
    }
  }, [id, setLocation]);

  const handleExportResults = useCallback(async () => {
    if (!results || !results.vtk_file_url) {
      toast.error('Aucun résultat VTK à exporter.');
      return;
    }
    setIsExporting(true);
    try {
      const response = await fetch(results.vtk_file_url);
      if (!response.ok) {
        throw new Error(`Échec du téléchargement du fichier VTK: ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `simulation_results_${id}.vtk`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Résultats exportés avec succès !');
    } catch (error: any) {
      console.error('Erreur exportation résultats:', error);
      toast.error(`Échec de l'exportation: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  }, [results, id]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  const handleSelectChange = useCallback((name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  const handleGeometryDimensionChange = useCallback((dim: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      geometryConfig: {
        ...prev.geometryConfig,
        dimensions: {
          ...prev.geometryConfig.dimensions,
          [dim]: parseFloat(value) || 0,
        },
      },
    }));
  }, []);

  const currentMaterial = useMemo(() => {
    return materialsData.find(m => m.id === formData.materialId);
  }, [formData.materialId, materialsData]);

  const isFormValid = useMemo(() => {
    return formData.name.trim() !== '' && formData.materialId.trim() !== '';
  }, [formData.name, formData.materialId]);

  // Rendu de l'interface
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/dashboard')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">{id ? 'Modifier la Simulation' : 'Nouvelle Simulation'}</h1>
          {simulation && <SimulationStatus status={simulation.status} progress={simulation.progress} />}
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleSaveSimulation} disabled={isSaving || isRunning || !isFormValid}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Sauvegarder
          </Button>
          <Button onClick={handleStartSimulation} disabled={isRunning || !id} className="bg-green-600 hover:bg-green-700">
            {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Lancer Simulation
          </Button>
          <Button onClick={handleExportResults} disabled={!results?.vtk_file_url || isExporting} variant="outline">
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exporter Résultats
          </Button>
          {id && (
            <Button onClick={handleDeleteSimulation} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-hidden">  
        <Card className="lg:col-span-2 flex flex-col">  
          <CardHeader className="flex flex-row items-center justify-between">  
            <CardTitle>Visualisation 3D</CardTitle>  
            <div className="flex items-center space-x-2">  
              <Button variant="ghost" size="icon" onClick={() => setViewState(prev => ({ ...prev, showGrid: !prev.showGrid }))} title="Afficher/Masquer Grille">  
                {viewState.showGrid ? <Grid3x3 className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4 text-muted-foreground" />}  
              </Button>  
              <Button variant="ghost" size="icon" onClick={() => setViewState(prev => ({ ...prev, showAxes: !prev.showAxes }))} title="Afficher/Masquer Axes">  
                {viewState.showAxes ? <Box className="h-4 w-4" /> : <Box className="h-4 w-4 text-muted-foreground" />}  
              </Button>  
              <Button variant="ghost" size="icon" onClick={() => setViewState(prev => ({ ...prev, isFullscreen: !prev.isFullscreen }))} title="Plein écran">  
                {viewState.isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}  
              </Button>  
            </div>  
          </CardHeader>  
          <CardContent className="flex-1 p-0 relative">  
            {prepareViewerData ? (  
              <VTKViewer  
                data={prepareViewerData}  
                showGrid={viewState.showGrid}  
                showAxes={viewState.showAxes}  
                viewMode={viewState.viewMode}  
                colorMap={viewState.colorMap}  
                opacity={viewState.opacity}  
                onPointSelect={setSelectedPoint}  
              />  
            ) : (  
              <div className="flex items-center justify-center h-full text-muted-foreground">  
                {simulation?.status === 'pending' && <p>En attente de lancement de la simulation...</p>}  
                {simulation?.status === 'running' && <p>Simulation en cours de calcul...</p>}  
                {simulation?.status === 'failed' && <p>La simulation a échoué. Veuillez vérifier les logs.</p>}  
                {simulation?.status === 'completed' && !results && <p>Simulation terminée, mais aucun résultat disponible.</p>}  
                {!simulation && <p>Configurez et lancez une simulation pour visualiser les résultats.</p>}  
              </div>  
            )}  
            {selectedPoint && (  
              <div className="absolute bottom-4 left-4 bg-background/80 backdrop-blur-sm p-3 rounded-lg shadow-lg text-sm">  
                <h4 className="font-semibold mb-1">Détails du point</h4>  
                <p>Position: ({selectedPoint.position.map(c => c.toFixed(2)).join(', ')})</p>  
                {Object.entries(selectedPoint.field_values).map(([key, value]) => (  
                  <p key={key}>{key}: {value.toFixed(2)} {prepareViewerData?.fields.find(f => f.id === key)?.units || ''}</p>  
                ))}  
              </div>  
            )}  
          </CardContent>  
        </Card>  

        <Card className="flex flex-col">  
          <CardHeader>  
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration de la Simulation
            </CardTitle>  
          </CardHeader>  
          <CardContent className="flex-1 overflow-y-auto space-y-6">  
            <div className="grid gap-2">  
              <Label htmlFor="name">Nom de la simulation</Label>  
              <Input id="name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Ma simulation" />  
            </div>  
            <div className="grid gap-2">  
              <Label htmlFor="description">Description</Label>  
              <Textarea id="description" name="description" value={formData.description} onChange={handleInputChange} placeholder="Description de la simulation..." rows={3} />  
            </div>  

            <Separator />  

            <div className="grid gap-2">  
              <Label>Type de Géométrie</Label>  
              <Select value={formData.geometryType} onValueChange={(value: 'simple' | 'complex') => handleSelectChange('geometryType', value)}>  
                <SelectTrigger>  
                  <SelectValue placeholder="Sélectionner le type de géométrie" />  
                </SelectTrigger>  
                <SelectContent>  
                  <SelectItem value="simple">Simple (dimensions)</SelectItem>  
                  <SelectItem value="complex">Complexe (fichier 3D)</SelectItem>  
                </SelectContent>  
              </Select>  
            </div>  

            {formData.geometryType === 'simple' ? (  
              <div className="grid grid-cols-3 gap-4">  
                <div className="grid gap-2">  
                  <Label htmlFor="width">Largeur (mm)</Label>  
                  <Input id="width" type="number" value={formData.geometryConfig.dimensions.width} onChange={(e) => handleGeometryDimensionChange('width', e.target.value)} />  
                </div>  
                <div className="grid gap-2">  
                  <Label htmlFor="height">Hauteur (mm)</Label>  
                  <Input id="height" type="number" value={formData.geometryConfig.dimensions.height} onChange={(e) => handleGeometryDimensionChange('height', e.target.value)} />  
                </div>  
                <div className="grid gap-2">  
                  <Label htmlFor="depth">Profondeur (mm)</Label>  
                  <Input id="depth" type="number" value={formData.geometryConfig.dimensions.depth} onChange={(e) => handleGeometryDimensionChange('depth', e.target.value)} />  
                </div>  
              </div>  
            ) : (  
              <div className="grid gap-2">  
                <Label htmlFor="geometryFile">Fichier de Géométrie 3D</Label>  
                <div className="flex items-center space-x-2">  
                  <Input id="geometryFile" type="file" onChange={handleFileUpload} className="flex-1" disabled={uploadingFile} />  
                  <Button type="button" onClick={() => document.getElementById('geometryFile')?.click()} disabled={uploadingFile}>  
                    {uploadingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}  
                    Choisir un fichier  
                  </Button>  
                </div>  
                {uploadingFile && uploadProgress > 0 && (  
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">  
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>  
                    <p className="text-xs text-muted-foreground mt-1">
                      {uploadPhase === 'uploading' ? `Téléchargement en cours: ${uploadProgress}%` : 'Finalisation...'}
                    </p>  
                  </div>  
                )}  
                {uploadError && (  
                  <Alert variant="destructive" className="mt-2">  
                    <Shield className="h-4 w-4" />  
                    <AlertDescription>{uploadError}</AlertDescription>  
                  </Alert>  
                )}  
                {formData.geometryConfig.file_name && !uploadError && (  
                  <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">  
                    <span>
                      <CheckCircle className="inline h-4 w-4 text-green-500 mr-1" /> 
                      {formData.geometryConfig.file_name} ({(formData.geometryConfig.file_size / 1024 / 1024).toFixed(2)} MB)
                    </span>  
                  </div>  
                )}  
                <p className="text-sm text-muted-foreground mt-1">
                  Formats supportés: STL, STEP, OBJ, VTP, VTI, PLY, VTK, IGES, IGS, VTU
                </p>  
              </div>  
            )}  

            <Separator />  

            <div className="grid gap-2">  
              <Label>Matériau</Label>  
              <Select value={formData.materialId} onValueChange={(value) => handleSelectChange('materialId', value)}>  
                <SelectTrigger>  
                  <SelectValue placeholder="Sélectionner un matériau" />  
                </SelectTrigger>  
                <SelectContent>  
                  {materialsData.map((material) => (  
                    <SelectItem key={material.id} value={material.id}>  
                      {material.name}  
                    </SelectItem>  
                  ))}  
                </SelectContent>  
              </Select>  
              {currentMaterial && (  
                <div className="text-sm text-muted-foreground mt-1">  
                  <p>Conductivité: {currentMaterial.conductivity} W/m·K</p>  
                  <p>Densité: {currentMaterial.density} kg/m³</p>  
                  <p>Chaleur spécifique: {currentMaterial.specific_heat} J/kg·K</p>  
                </div>  
              )}  
            </div>  

            <div className="grid gap-2">  
              <Label>Densité de maillage</Label>  
              <Select value={formData.meshDensity} onValueChange={(value: 'low' | 'medium' | 'high') => handleSelectChange('meshDensity', value)}>  
                <SelectTrigger>  
                  <SelectValue placeholder="Sélectionner la densité" />  
                </SelectTrigger>  
                <SelectContent>  
                  <SelectItem value="low">Faible (calcul rapide)</SelectItem>  
                  <SelectItem value="medium">Moyen (équilibre précision/temps)</SelectItem>  
                  <SelectItem value="high">Élevé (haute précision)</SelectItem>  
                </SelectContent>  
              </Select>  
            </div>  

            <div className="grid grid-cols-2 gap-4">  
              <div className="grid gap-2">  
                <Label htmlFor="initialTemp">Température initiale (°C)</Label>  
                <Input id="initialTemp" name="initialTemp" value={formData.initialTemp} onChange={handleInputChange} type="number" />  
              </div>  
              <div className="grid gap-2">  
                <Label htmlFor="ambientTemp">Température ambiante (°C)</Label>  
                <Input id="ambientTemp" name="ambientTemp" value={formData.ambientTemp} onChange={handleInputChange} type="number" />  
              </div>  
            </div>  

            <div className="grid gap-2">  
              <Label>Type de refroidissement</Label>  
              <Select value={formData.coolingType} onValueChange={(value: 'natural_convection' | 'forced_convection' | 'radiation') => handleSelectChange('coolingType', value)}>  
                <SelectTrigger>  
                  <SelectValue placeholder="Sélectionner le type" />  
                </SelectTrigger>  
                <SelectContent>  
                  <SelectItem value="natural_convection">Convection naturelle</SelectItem>  
                  <SelectItem value="forced_convection">Convection forcée</SelectItem>  
                  <SelectItem value="radiation">Radiation</SelectItem>  
                </SelectContent>  
              </Select>  
            </div>  

            <div className="grid gap-2">  
              <Label>Solveur</Label>  
              <Select value={formData.solverType} onValueChange={(value: any) => handleSelectChange('solverType', value)}>  
                <SelectTrigger>  
                  <SelectValue placeholder="Sélectionner le solveur" />  
                </SelectTrigger>  
                <SelectContent>  
                  <SelectItem value="fem_fortran">FEM Fortran (1D/2D/3D)</SelectItem>  
                  <SelectItem value="openfoam">OpenFOAM (3D complexe)</SelectItem>  
                  <SelectItem value="ansys">ANSYS</SelectItem>  
                  <SelectItem value="comsol">COMSOL</SelectItem>  
                </SelectContent>  
              </Select>  
              <p className="text-xs text-muted-foreground mt-1">  
                {formData.solverType === 'fem_fortran' && "Solveur Fortran optimisé pour les géométries 1D/2D"}  
                {formData.solverType === 'openfoam' && "Solveur CFD pour les géométries 3D complexes"}  
              </p>  
            </div>  

            {simulation?.status === 'failed' && simulation?.error_message && (  
              <Alert variant="destructive">  
                <AlertCircle className="h-4 w-4" />  
                <AlertDescription>  
                  La simulation a échoué: {simulation.error_message}  
                </AlertDescription>  
              </Alert>  
            )}  
          </CardContent>  
        </Card>  
      </main>  
    </div>  
  );
}
