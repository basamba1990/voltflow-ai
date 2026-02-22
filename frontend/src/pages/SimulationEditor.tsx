// src/pages/SimulationEditor.tsx - VERSION COMPLÈTE CORRIGÉE
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';

// Imports Lucide-React valides
import {
  Save,
  Play,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Box,
  Settings,
  Grid3x3,
  Maximize2,
  Minimize2,
  Square,
  BarChart3,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
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

  // État du formulaire enrichi avec nx, ny, nz
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    geometryType: 'complex' as 'simple' | 'complex',
    geometryConfig: {
      file_url: '',
      file_name: '',
      file_size: 0,
      file_path: '',
      dimensions: { width: 100, height: 100, depth: 100 },
    },
    materialId: '',
    meshDensity: 'medium' as 'low' | 'medium' | 'high',
    nx: 50,
    ny: 50,
    nz: 50,
    initialTemp: '1000',
    ambientTemp: '25',
    coolingType: 'natural_convection' as 'natural_convection' | 'forced_convection' | 'radiation',
    convectionCoeff: '10',
    fluidType: 'air' as 'air' | 'water' | 'oil',
    fluidVelocity: '1',
    solverType: 'fem_fortran' as
      | 'fem_fortran'
      | 'openfoam'
      | 'ansys'
      | 'comsol'
      | 'abaqus'
      | 'starccm'
      | 'fluent'
      | 'cfx'
      | 'pinn'
      | 'custom',
  });

  // État de la vue
  const [viewState, setViewState] = useState({
    isFullscreen: false,
    showGrid: true,
    showAxes: true,
    viewMode: 'volume' as 'volume' | 'slice' | 'wireframe' | 'point_cloud',
    colorMap: 'heat' as 'heat' | 'coolwarm' | 'rainbow' | 'viridis',
    opacity: 0.8,
    showEnergyFlux: false,
    fluxType: 'total' as 'total' | 'advective' | 'diffusive',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'finalizing'>('idle');
  const [selectedPoint, setSelectedPoint] = useState<{
    position: [number, number, number];
    field_values: Record<string, number>;
    element_id?: number;
  } | null>(null);

  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nettoyage des timeouts
  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
    };
  }, []);

  // Détection du type de géométrie depuis le nom du fichier
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

  // Ajustement automatique de nx, ny, nz en fonction du type et de la densité
  const getMeshDimensions = useCallback((geometryType: string, density: string) => {
    const base = density === 'low' ? 30 : density === 'medium' ? 60 : 100;
    if (geometryType === '1d_rod') {
      return { nx: base, ny: 5, nz: 5 };
    } else if (geometryType === '2d_plate') {
      return { nx: base, ny: base, nz: 5 };
    } else {
      return { nx: base, ny: base, nz: base };
    }
  }, []);

  // Initialisation des données depuis la simulation existante
  useEffect(() => {
    if (id && simulation) {
      const bc = simulation.boundary_conditions as any;
      const gc = simulation.geometry_config as any;

      setFormData((prev) => ({
        ...prev,
        name: simulation.name || '',
        description: simulation.description || '',
        geometryType: simulation.geometry_type || 'complex',
        geometryConfig: {
          file_url: gc?.file_url || '',
          file_name: gc?.file_name || '',
          file_size: gc?.file_size || 0,
          file_path: gc?.file_path || '',
          dimensions: gc?.dimensions || { width: 100, height: 100, depth: 100 },
        },
        materialId: simulation.material_id || '',
        meshDensity: simulation.mesh_density || 'medium',
        nx: simulation.nx || 50,
        ny: simulation.ny || 50,
        nz: simulation.nz || 50,
        initialTemp: bc?.initial_temp?.toString() || '1000',
        ambientTemp: bc?.ambient_temp?.toString() || '25',
        coolingType: bc?.cooling_type || 'natural_convection',
        convectionCoeff: bc?.convection_coeff?.toString() || '10',
        fluidType: bc?.fluid_type || 'air',
        fluidVelocity: bc?.fluid_velocity?.toString() || '1',
        solverType: simulation.solver_type || 'fem_fortran',
      }));
    }
  }, [id, simulation]);

  // Mise à jour automatique de nx, ny, nz quand meshDensity ou geometryType change
  useEffect(() => {
    const geometryType =
      formData.geometryType === 'complex'
        ? '3d_complex'
        : formData.geometryConfig.file_name
        ? detectGeometryType(formData.geometryConfig.file_name)
        : '3d_complex';
    const { nx, ny, nz } = getMeshDimensions(geometryType, formData.meshDensity);
    setFormData((prev) => ({ ...prev, nx, ny, nz }));
  }, [formData.meshDensity, formData.geometryType, formData.geometryConfig.file_name, getMeshDimensions]);

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
        material: formData.materialId
          ? (materialsData.find((m) => m.id === formData.materialId)?.name.toLowerCase() as any)
          : 'steel',
        thermal_conductivity: materialsData.find((m) => m.id === formData.materialId)?.conductivity || 50,
      });

      if (results.energy_flux) {
        fields.push({
          id: 'energy_flux',
          name: 'Energy Flux',
          type: 'flux' as any,
          values: new Float32Array(results.energy_flux.total || []),
          units: 'W',
          min: Math.min(...(results.energy_flux.total || [0])),
          max: Math.max(...(results.energy_flux.total || [0])),
        });
      }
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
        type: results.vtk_file_url?.endsWith('.vtp') ? 'vtp' : results.vtk_file_url?.endsWith('.stl') ? 'stl' : 'vtp',
        metadata: results.mesh_metadata,
      },
      fields,
      config,
      legend,
      simulation: simulation
        ? {
            engine: simulation.solver_type || 'fem_fortran',
            case_name: simulation.name,
            version: '1.0',
            timestamp: simulation.created_at || new Date().toISOString(),
          }
        : undefined,
    };
  }, [results, simulation, formData.materialId, materialsData, viewState.colorMap]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadingFile(true);
    setUploadProgress(0);
    setUploadPhase('uploading');

    const file = e.target.files?.[0];
    if (!file) {
      setUploadingFile(false);
      toast.error('Aucun fichier sélectionné');
      return;
    }

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev < 90) return prev + 5;
          setUploadPhase('finalizing');
          return 95;
        });
      }, 500);

      const result = await SimulationService.uploadGeometry({
        file,
        simulationId: id || undefined,
        simulationName: formData.name || file.name.replace(/\.[^/.]+$/, ''),
        materialId: formData.materialId || undefined,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadingFile(false);

      const geometryType = result.geometry_type || detectGeometryType(result.fileName);
      const { nx, ny, nz } = getMeshDimensions(geometryType, formData.meshDensity);

      setFormData((prev) => ({
        ...prev,
        geometryType: geometryType === '1d_rod' ? 'simple' : 'complex',
        nx, ny, nz,
        geometryConfig: {
          ...prev.geometryConfig,
          file_url: result.fileUrl,
          file_name: result.fileName,
          file_size: result.fileSize || 0,
          file_path: result.path || '',
        },
      }));

      toast.success('Géométrie uploadée avec succès');
      if (!id && result.simulationId) {
        setLocation(`/simulation/${result.simulationId}`);
      } else {
        refresh();
      }
    } catch (error: any) {
      setUploadingFile(false);
      toast.error(`Échec de l'upload: ${error.message}`);
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
          geometry_config: { ...formData.geometryConfig },
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

      if (id) {
        await SimulationService.updateSimulation(id, simulationData);
        toast.success('Simulation mise à jour avec succès !');
      } else {
        const saved = await SimulationService.createSimulation(simulationData);
        toast.success('Simulation créée avec succès !');
        setLocation(`/simulation/${saved.id}`);
      }
      refresh();
    } catch (error: any) {
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
    try {
      await startSimulationHook(id);
      toast.success('Simulation lancée avec succès !');
      setTimeout(() => refresh(), 2000);
    } catch (error: any) {
      toast.error(`Échec du lancement: ${error.message}`);
    }
  }, [id, startSimulationHook, refresh]);

  const handleDeleteSimulation = useCallback(async () => {
    if (!id || !confirm('Êtes-vous sûr ?')) return;
    try {
      await SimulationService.deleteSimulation(id);
      toast.success('Supprimé');
      setLocation('/dashboard');
    } catch (error: any) {
      toast.error('Erreur suppression');
    }
  }, [id, setLocation]);

  const handleExportResults = useCallback(async () => {
    if (!results?.vtk_file_url) return;
    setIsExporting(true);
    try {
      const res = await fetch(results.vtk_file_url);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `results_${id}.vtk`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Erreur export');
    } finally {
      setIsExporting(false);
    }
  }, [results, id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

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
          <Button onClick={handleSaveSimulation} disabled={isSaving || isRunning}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Sauvegarder
          </Button>
          <Button onClick={handleStartSimulation} disabled={isRunning || !id} className="bg-green-600 hover:bg-green-700">
            {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Lancer Simulation
          </Button>
          <Button onClick={handleExportResults} disabled={!results?.vtk_file_url || isExporting} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exporter
          </Button>
          {id && (
            <Button onClick={handleDeleteSimulation} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-hidden">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Visualisation 3D</CardTitle>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="icon" onClick={() => setViewState(p => ({ ...p, showGrid: !p.showGrid }))}>
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setViewState(p => ({ ...p, isFullscreen: !p.isFullscreen }))}>
                {viewState.isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 relative">
            {prepareViewerData ? (
              <>
                <VTKViewer
                  key={prepareViewerData.mesh.url}
                  data={prepareViewerData}
                  showGrid={viewState.showGrid}
                  showAxes={viewState.showAxes}
                  viewMode={viewState.viewMode}
                  colorMap={viewState.colorMap}
                  opacity={viewState.opacity}
                  onPointSelect={setSelectedPoint}
                />
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                  <Card className="bg-background/80 backdrop-blur-sm p-3 w-48">
                    <div className="text-xs font-bold text-muted-foreground uppercase">Températures</div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs">Max</span>
                      <span className="text-sm font-mono font-bold text-red-500">{(results?.max_temperature ?? results?.temperature_stats?.max ?? 0).toFixed(1)}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs">Min</span>
                      <span className="text-sm font-mono font-bold text-blue-500">{(results?.min_temperature ?? results?.temperature_stats?.min ?? 0).toFixed(1)}°C</span>
                    </div>
                  </Card>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {uploadingFile ? <Loader2 className="h-8 w-8 animate-spin" /> : <p>Configurez et lancez une simulation.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-4">
            <div className="grid gap-2">
              <Label>Nom</Label>
              <Input name="name" value={formData.name} onChange={handleInputChange} />
            </div>
            <div className="grid gap-2">
              <Label>Matériau</Label>
              <Select value={formData.materialId} onValueChange={v => handleSelectChange('materialId', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {materialsData.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1">
                <Label>NX</Label>
                <Input type="number" value={formData.nx} onChange={e => setFormData(p => ({ ...p, nx: parseInt(e.target.value) }))} />
              </div>
              <div className="grid gap-1">
                <Label>NY</Label>
                <Input type="number" value={formData.ny} onChange={e => setFormData(p => ({ ...p, ny: parseInt(e.target.value) }))} />
              </div>
              <div className="grid gap-1">
                <Label>NZ</Label>
                <Input type="number" value={formData.nz} onChange={e => setFormData(p => ({ ...p, nz: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Fichier Géométrie</Label>
              <Input type="file" onChange={handleFileUpload} />
            </div>
            <div className="grid gap-2">
              <Label>Solveur</Label>
              <Select value={formData.solverType} onValueChange={v => handleSelectChange('solverType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fem_fortran">Fortran</SelectItem>
                  <SelectItem value="openfoam">OpenFOAM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
