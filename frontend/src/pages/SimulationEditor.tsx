import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import { 
  Save, Play, Download, Trash2, Thermometer, Loader2, 
  AlertCircle, ChevronLeft, UploadCloud, Box, Settings,
  Eye, EyeOff, Grid3X3, Maximize2, Minimize2, Copy
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
import type { 
  IndustrialField, 
  IndustrialConfig,
  IndustrialLegend,
  UnitSystem 
} from '@/components/Viewers/VTKViewer';

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
    initialTemp: '200',
    ambientTemp: '25',
    coolingType: 'natural_convection' as 'natural_convection' | 'forced_convection' | 'radiation',
    convectionCoeff: '10',
    fluidType: 'air' as 'air' | 'water' | 'oil',
    fluidVelocity: '1',
    solverType: 'fem_fortran' as 'fem_fortran' | 'openfoam' | 'comsol',
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
  const [selectedPoint, setSelectedPoint] = useState<{
    position: [number, number, number];
    field_values: Record<string, number>;
    element_id?: number;
  } | null>(null);

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
        meshDensity: simulation.mesh_density_level || 'medium',
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

  // Gestion des fichiers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    // Validation du type de fichier
    const validExtensions = ['.stl', '.step', '.obj', '.vtp', '.vti'];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExt)) {
      toast.error("Format de fichier non supporté. Utilisez STL, STEP, OBJ, VTP ou VTI.");
      return;
    }

    try {
      setUploadingFile(true);
      const result = await SimulationService.uploadGeometry({
        file,
        userId: user.id,
        simulationId: id,
      });
      
      setFormData(prev => ({
        ...prev,
        geometryConfig: {
          file_url: result.fileUrl,
          file_name: result.fileName,
          dimensions: prev.geometryConfig.dimensions,
        },
      }));
      
      toast.success("Fichier géométrique téléchargé avec succès");
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`Erreur upload: ${error.message || 'Erreur inconnue'}`);
    } finally {
      setUploadingFile(false);
    }
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
        toast.success('Simulation mise à jour');
        refresh();
      } else {
        const newSim = await SimulationService.createSimulation(payload);
        toast.success('Simulation créée');
        setLocation(`/simulation/${newSim.id}`);
      }
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // Export des résultats
  const handleExport = async (format: 'png' | 'pdf' | 'csv' | 'vtk') => {
    if (!results) return;
    
    try {
      setIsExporting(true);
      let url = '';
      let filename = `simulation_${id}_${format}`;
      
      switch (format) {
        case 'png':
          url = results.vtk_file_url || '';
          filename += '.png';
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
        toast.success(`Export ${format} téléchargé`);
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  // Gestion de la sélection de points dans le viewer
  const handlePointSelected = useCallback((data: {
    position: [number, number, number];
    field_values: Record<string, number>;
    distance_to_boundary?: number;
    element_id?: number;
  }) => {
    setSelectedPoint(data);
    
    const temp = data.field_values.temperature;
    if (temp !== undefined) {
      toast.info(`Température sélectionnée: ${temp.toFixed(1)}°C`, {
        description: `Position: ${data.position.map(v => v.toFixed(2)).join(', ')}`,
        duration: 3000,
      });
    }
  }, []);

  // Copie des données du point sélectionné
  const copySelectedPointData = () => {
    if (!selectedPoint) return;
    
    const text = JSON.stringify(selectedPoint, null, 2);
    navigator.clipboard.writeText(text);
    toast.success('Données copiées dans le presse-papier');
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* En-tête */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/dashboard')}
              className="hover:bg-zinc-800"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Retour
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">
                {id ? 'Éditeur de Simulation' : 'Nouvelle Simulation'}
              </h1>
              {simulation && (
                <div className="flex items-center gap-2 mt-1">
                  <SimulationStatus status={simulation.status} />
                  <span className="text-sm text-zinc-400">
                    {simulation.status === 'running' && progress !== undefined
                      ? `${progress}%`
                      : simulation.created_at
                      ? new Date(simulation.created_at).toLocaleDateString()
                      : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isSaving}
              className="min-w-[120px]"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Sauvegarder
            </Button>
            
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
            
            {results && (
              <Button
                variant="outline"
                onClick={() => handleExport('png')}
                disabled={isExporting}
              >
                <Download className="w-4 h-4 mr-2" />
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
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="geo-upload"
                        accept=".stl,.step,.obj,.vtp,.vti"
                      />
                      <Button
                        asChild
                        variant="secondary"
                        disabled={uploadingFile}
                        className="flex-1"
                      >
                        <label htmlFor="geo-upload" className="cursor-pointer flex items-center justify-center">
                          {uploadingFile ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <UploadCloud className="w-4 h-4 mr-2" />
                          )}
                          {formData.geometryConfig.file_name || 'Choisir un fichier'}
                        </label>
                      </Button>
                    </div>
                    {formData.geometryConfig.file_name && (
                      <Badge variant="outline" className="bg-green-900/20 text-green-400">
                        ✓ {formData.geometryConfig.file_name}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="material">Matériau</Label>
                  <Select
                    value={formData.materialId}
                    onValueChange={v => setFormData({...formData, materialId: v})}
                  >
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue placeholder="Sélectionner un matériau" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {materialsData.map(material => (
                        <SelectItem
                          key={material.id}
                          value={material.id}
                          className="hover:bg-zinc-800 focus:bg-zinc-800"
                        >
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
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meshDensity">Densité de maillage</Label>
                  <Select
                    value={formData.meshDensity}
                    onValueChange={v => setFormData({...formData, meshDensity: v as any})}
                  >
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="low">Faible (rapide)</SelectItem>
                      <SelectItem value="medium">Moyen</SelectItem>
                      <SelectItem value="high">Élevé (précis)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Informations du point sélectionné */}
            {selectedPoint && (
              <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>Point sélectionné</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copySelectedPointData}
                      className="h-6 px-2"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-zinc-400">X:</div>
                      <div className="font-mono">{selectedPoint.position[0].toFixed(2)}</div>
                      <div className="text-zinc-400">Y:</div>
                      <div className="font-mono">{selectedPoint.position[1].toFixed(2)}</div>
                      <div className="text-zinc-400">Z:</div>
                      <div className="font-mono">{selectedPoint.position[2].toFixed(2)}</div>
                    </div>
                    <Separator className="my-2" />
                    {Object.entries(selectedPoint.field_values).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-zinc-400">{key}:</span>
                        <span className="font-medium">{value.toFixed(1)}°C</span>
                      </div>
                    ))}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewState(prev => ({ 
                        ...prev, 
                        isFullscreen: !prev.isFullscreen 
                      }))}
                    >
                      {viewState.isFullscreen ? (
                        <Minimize2 className="w-4 h-4 mr-2" />
                      ) : (
                        <Maximize2 className="w-4 h-4 mr-2" />
                      )}
                      Plein écran
                    </Button>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={viewState.showGrid}
                        onCheckedChange={checked => 
                          setViewState(prev => ({ ...prev, showGrid: checked }))
                        }
                      />
                      <Label className="text-sm">Grille</Label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={viewState.showAxes}
                        onCheckedChange={checked => 
                          setViewState(prev => ({ ...prev, showAxes: checked }))
                        }
                      />
                      <Label className="text-sm">Axes</Label>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Select
                      value={viewState.viewMode}
                      onValueChange={v => setViewState(prev => ({ 
                        ...prev, 
                        viewMode: v as any 
                      }))}
                    >
                      <SelectTrigger className="w-[140px] bg-zinc-800/50 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="volume">Volume</SelectItem>
                        <SelectItem value="wireframe">Fil de fer</SelectItem>
                        <SelectItem value="point_cloud">Points</SelectItem>
                        <SelectItem value="slice">Coupe</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select
                      value={viewState.colorMap}
                      onValueChange={v => setViewState(prev => ({ 
                        ...prev, 
                        colorMap: v as any 
                      }))}
                    >
                      <SelectTrigger className="w-[140px] bg-zinc-800/50 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="heat">Chaleur</SelectItem>
                        <SelectItem value="coolwarm">Froid-Chaud</SelectItem>
                        <SelectItem value="rainbow">Arc-en-ciel</SelectItem>
                        <SelectItem value="viridis">Viridis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm">Opacité</Label>
                    <span className="text-sm text-zinc-400">{Math.round(viewState.opacity * 100)}%</span>
                  </div>
                  <Slider
                    value={[viewState.opacity]}
                    onValueChange={([value]) => 
                      setViewState(prev => ({ ...prev, opacity: value }))
                    }
                    min={0.1}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Onglets principaux */}
            <Tabs defaultValue="visualizer" className="w-full">
              <TabsList className="bg-zinc-900/50 border-zinc-800">
                <TabsTrigger value="visualizer" className="data-[state=active]:bg-zinc-800">
                  <Box className="w-4 h-4 mr-2" />
                  Visualisation 3D
                </TabsTrigger>
                <TabsTrigger value="results" className="data-[state=active]:bg-zinc-800">
                  <Thermometer className="w-4 h-4 mr-2" />
                  Résultats
                </TabsTrigger>
                <TabsTrigger value="details" className="data-[state=active]:bg-zinc-800">
                  <Settings className="w-4 h-4 mr-2" />
                  Détails
                </TabsTrigger>
              </TabsList>

              {/* Onglet Visualisation */}
              <TabsContent value="visualizer" className="mt-4">
                {prepareViewerData ? (
                  <div className={`rounded-lg overflow-hidden border border-zinc-800 ${
                    viewState.isFullscreen ? 'fixed inset-0 z-50' : 'h-[600px]'
                  }`}>
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
                    <Loader2 className="w-12 h-12 animate-spin mb-4 text-blue-500" />
                    <div className="text-center space-y-2">
                      <div className="text-lg font-semibold">Simulation en cours</div>
                      <div className="text-sm">Chargement des données...</div>
                      {progress !== undefined && (
                        <div className="w-64 mx-auto">
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="text-xs mt-2 text-center">
                            Progression: {progress}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[600px] bg-zinc-900/50 border border-zinc-800 rounded-lg flex flex-col items-center justify-center text-zinc-500 p-6 text-center">
                    <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                      <Box className="w-8 h-8" />
                    </div>
                    <div className="text-lg font-semibold mb-2">
                      Aucune donnée de simulation
                    </div>
                    <div className="text-sm mb-4 max-w-md">
                      {id 
                        ? 'Lancez la simulation pour générer les résultats et visualiser le modèle 3D.'
                        : 'Créez et sauvegardez une simulation pour commencer.'}
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
                  </div>
                )}
              </TabsContent>

              {/* Onglet Résultats */}
              <TabsContent value="results" className="mt-4">
                {results ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                          <div>
                            <div className="text-sm text-zinc-400 mb-1">Température Maximale</div>
                            <div className="text-3xl font-bold text-red-500">
                              {results.max_temperature?.toFixed(1)}°C
                            </div>
                          </div>
                          <Separator />
                          <div>
                            <div className="text-sm text-zinc-400 mb-1">Température Minimale</div>
                            <div className="text-xl font-medium text-blue-500">
                              {results.min_temperature?.toFixed(1)}°C
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                          <div>
                            <div className="text-sm text-zinc-400 mb-1">Fidélité de Simulation</div>
                            <div className="text-3xl font-bold text-green-500">
                              {((1 - (results.uncertainty_score || 0)) * 100).toFixed(1)}%
                            </div>
                          </div>
                          <Separator />
                          <div>
                            <div className="text-sm text-zinc-400 mb-1">Score d'incertitude</div>
                            <div className="text-xl font-medium text-yellow-500">
                              {(results.uncertainty_score * 100)?.toFixed(1)}%
                            </div>
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
                          </div>
                          <Separator />
                          <div>
                            <div className="text-sm text-zinc-400 mb-1">Points de Maillage</div>
                            <div className="text-xl font-medium text-purple-500">
                              {results.mesh_points?.toLocaleString() || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Graphiques et données détaillées */}
                    {results.temperature_distribution && (
                      <Card className="md:col-span-3 bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                          <CardTitle>Distribution des Températures</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-64 flex items-center justify-center border border-zinc-800 rounded-lg p-4">
                            <div className="text-center text-zinc-500">
                              Graphique de distribution à implémenter
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <AlertCircle className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
                      <div className="text-lg font-semibold mb-2">Aucun résultat disponible</div>
                      <div className="text-sm text-zinc-400">
                        Les résultats de simulation seront affichés ici après exécution.
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Onglet Détails */}
              <TabsContent value="details" className="mt-4">
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="pt-6">
                    {simulation ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-zinc-400">ID</div>
                            <div className="font-mono text-sm">{simulation.id}</div>
                          </div>
                          <div>
                            <div className="text-sm text-zinc-400">Statut</div>
                            <div className="flex items-center gap-2">
                              <SimulationStatus status={simulation.status} />
                              <span className="text-sm">
                                {simulation.status === 'running' && progress !== undefined
                                  ? `${progress}%`
                                  : ''}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-zinc-400">Créée le</div>
                            <div>{new Date(simulation.created_at).toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-sm text-zinc-400">Modifiée le</div>
                            <div>{new Date(simulation.updated_at).toLocaleString()}</div>
                          </div>
                        </div>
                        
                        <Separator />
                        
                        <div>
                          <div className="text-sm text-zinc-400 mb-2">Configuration</div>
                          <pre className="bg-zinc-900 p-4 rounded-lg text-sm overflow-auto max-h-60">
                            {JSON.stringify(simulation, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-zinc-500">
                        Chargez une simulation pour voir les détails
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
