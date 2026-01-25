import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import { 
  Save, Play, Download, Thermometer, Loader2, 
  AlertCircle, ChevronLeft, UploadCloud, Box, Settings,
  Eye, Maximize2, Minimize2, Copy, CheckCircle, XCircle, TestTube
} from 'lucide-react';

// Services et hooks
import SimulationService from '@/services/simulation.service';
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

export default function SimulationEditor() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  
  // État du formulaire
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    geometryConfig: { 
      file_url: '', 
      file_name: '',
      dimensions: { width: 100, height: 100, depth: 100 }
    },
    materialId: '',
    meshDensity: 'medium' as 'low' | 'medium' | 'high',
    boundaryConditions: {
      initial_temp: 200,
      ambient_temp: 25,
      cooling_type: 'natural_convection' as 'natural_convection' | 'forced_convection' | 'radiation',
      convection_coeff: 10,
      fluid_type: 'air' as 'air' | 'water' | 'oil',
      fluid_velocity: 1,
    },
    solverType: 'fem_fortran' as 'fem_fortran' | 'openfoam' | 'comsol',
  });

  // État UI
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [simulation, setSimulation] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Charger simulation existante
  useEffect(() => {
    if (id && user?.id) {
      loadSimulation();
    }
  }, [id, user?.id]);

  const loadSimulation = async () => {
    try {
      const sim = await SimulationService.getSimulationById(id!);
      if (sim) {
        setSimulation(sim);
        setFormData({
          name: sim.name || '',
          description: sim.description || '',
          geometryConfig: sim.geometry_config as any || { 
            file_url: '', 
            file_name: '',
            dimensions: { width: 100, height: 100, depth: 100 }
          },
          materialId: sim.material_id || '',
          meshDensity: sim.mesh_density as any || 'medium',
          boundaryConditions: sim.boundary_conditions as any || {
            initial_temp: 200,
            ambient_temp: 25,
            cooling_type: 'natural_convection',
            convection_coeff: 10,
            fluid_type: 'air',
            fluid_velocity: 1,
          },
          solverType: sim.solver_type as any || 'fem_fortran',
        });
        
        if (sim.simulation_results?.[0]) {
          setResults(sim.simulation_results[0]);
        }
      }
    } catch (error) {
      console.error('Erreur chargement simulation:', error);
    }
  };

  // UPLOAD CORRIGÉ - Méthode principale
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) {
      toast.error('Aucun fichier sélectionné ou utilisateur non connecté');
      return;
    }

    // Validation
    const validExtensions = ['.stl', '.step', '.obj', '.vtp', '.vti', '.ply', '.vtk'];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExt)) {
      toast.error("Format non supporté. Formats acceptés: STL, STEP, OBJ, VTP, VTI, PLY, VTK.");
      return;
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Fichier trop volumineux. Maximum: ${maxSize / (1024 * 1024)} MB`);
      return;
    }

    try {
      setUploadingFile(true);
      setUploadError(null);
      
      console.log('📤 Début upload pour user:', user.id);
      
      // Appel de la méthode upload corrigée
      const result = await SimulationService.uploadGeometry({
        file,
        userId: user.id,
        simulationId: id
      });
      
      console.log('✅ Upload réussi:', result);
      
      // Mise à jour du formulaire
      setFormData(prev => ({
        ...prev,
        geometryConfig: {
          ...prev.geometryConfig,
          file_url: result.fileUrl,
          file_name: result.fileName,
          dimensions: prev.geometryConfig.dimensions,
        },
      }));
      
      toast.success("✅ Fichier géométrique téléchargé avec succès");
      
      // Mise à jour simulation si elle existe
      if (id && simulation) {
        try {
          await SimulationService.updateSimulation(id, {
            name: simulation.name,
            description: simulation.description,
            geometryConfig: {
              file_url: result.fileUrl,
              file_name: result.fileName,
              type: 'uploaded_file'
            }
          });
          toast.success("✅ Configuration mise à jour");
        } catch (updateError) {
          console.warn('⚠️ Mise à jour simulation échouée:', updateError);
        }
      }
      
    } catch (error: any) {
      console.error('❌ Upload échoué:', error);
      
      let errorMessage = error.message || 'Erreur inconnue';
      
      if (error.message?.includes('RLS')) {
        errorMessage = 'Erreur de sécurité RLS. Vérifiez vos politiques dans Supabase Storage.';
      } else if (error.message?.includes('network')) {
        errorMessage = 'Erreur réseau. Vérifiez votre connexion internet.';
      } else if (error.message?.includes('format')) {
        errorMessage = 'Format de fichier non supporté.';
      }
      
      setUploadError(errorMessage);
      toast.error(`❌ Échec upload: ${errorMessage}`);
      
    } finally {
      setUploadingFile(false);
      if (e.target) e.target.value = '';
    }
  };

  // Générer fichier VTP de test
  const generateTestVTP = () => {
    const testVTP = `<?xml version="1.0"?>
<VTKFile type="PolyData" version="1.0" byte_order="LittleEndian">
  <PolyData>
    <Piece NumberOfPoints="8" NumberOfPolys="6">
      <Points>
        <DataArray type="Float32" NumberOfComponents="3" format="ascii">
          0 0 0   1 0 0   1 1 0   0 1 0
          0 0 0.1 1 0 0.1 1 1 0.1 0 1 0.1
        </DataArray>
      </Points>
      <Polys>
        <DataArray type="Int32" Name="connectivity" format="ascii">
          0 1 2 3   4 5 6 7
          0 1 5 4   1 2 6 5
          2 3 7 6   3 0 4 7
        </DataArray>
        <DataArray type="Int32" Name="offsets" format="ascii">
          4 8 12 16 20 24
        </DataArray>
      </Polys>
      <PointData Scalars="Temperature_C">
        <DataArray type="Float32" Name="Temperature_C" format="ascii">
          25 30 40 35 50 55 80 60
        </DataArray>
      </PointData>
      <CellData Scalars="HeatFlux_Wm2">
        <DataArray type="Float32" Name="HeatFlux_Wm2" format="ascii">
          1200 1300 1400 1500 1600 1700
        </DataArray>
      </CellData>
      <FieldData>
        <DataArray type="String" Name="Material" NumberOfTuples="1">
          Aluminum_6061
        </DataArray>
        <DataArray type="Float32" Name="ThermalConductivity_WmK" NumberOfTuples="1">
          167
        </DataArray>
      </FieldData>
    </Piece>
  </PolyData>
</VTKFile>`;
    
    const blob = new Blob([testVTP], { type: 'application/xml' });
    const file = new File([blob], 'tube_aluminium_6061.vtp', { type: 'application/xml' });
    
    // Simuler upload
    const event = {
      target: { files: [file] }
    } as React.ChangeEvent<HTMLInputElement>;
    
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
        geometryConfig: formData.geometryConfig,
        materialId: formData.materialId,
        meshDensity: formData.meshDensity,
        boundaryConditions: formData.boundaryConditions,
        solverType: formData.solverType,
      };

      if (id) {
        await SimulationService.updateSimulation(id, payload);
        toast.success('✅ Simulation mise à jour');
        loadSimulation();
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

  // Lancer simulation
  const handleStartSimulation = async () => {
    if (!id) {
      toast.error('Veuillez d\'abord sauvegarder la simulation');
      return;
    }

    try {
      setIsRunning(true);
      setProgress(0);
      
      const result = await SimulationService.startSimulation(id);
      toast.success('✅ Simulation lancée');
      
      // Simulation de progression
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsRunning(false);
            loadSimulation();
            return 100;
          }
          return prev + 5;
        });
      }, 500);
      
    } catch (error: any) {
      console.error('❌ Start simulation error:', error);
      toast.error(error.message || 'Erreur lors du lancement');
      setIsRunning(false);
    }
  };

  // Toggle plein écran
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
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
                    {simulation.created_at
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
          </div>
        </div>

        {/* Contenu principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Colonne de gauche - Configuration */}
          <div className="lg:col-span-1 space-y-4 md:space-y-6">
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="w-5 h-5" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Nom */}
                <div className="space-y-2">
                  <Label htmlFor="name">Nom *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Refroidissement tube aluminium"
                    className="bg-zinc-800/50 border-zinc-700"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Simulation de refroidissement..."
                    className="bg-zinc-800/50 border-zinc-700 min-h-[80px]"
                  />
                </div>

                {/* UPLOAD GÉOMÉTRIE - CORRIGÉ */}
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
                          accept=".stl,.step,.obj,.vtp,.vti,.ply,.vtk"
                        />
                        <Button
                          asChild
                          variant="secondary"
                          disabled={uploadingFile}
                          className="flex-1"
                        >
                          <label htmlFor="geo-upload" className="cursor-pointer flex items-center justify-center gap-2">
                            {uploadingFile ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <UploadCloud className="w-4 h-4" />
                            )}
                            {uploadingFile ? 'Upload en cours...' : 'Choisir un fichier'}
                          </label>
                        </Button>
                        
                        <Button
                          variant="outline"
                          onClick={generateTestVTP}
                          className="whitespace-nowrap"
                          title="Générer un fichier VTP de test"
                        >
                          <TestTube className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <div className="text-xs text-zinc-400">
                        Formats supportés: STL, STEP, OBJ, VTP, VTI, PLY, VTK (max 50MB)
                      </div>
                    </div>
                    
                    {/* État fichier */}
                    {formData.geometryConfig.file_name && (
                      <div className="p-3 bg-green-900/20 rounded border border-green-800/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <div>
                              <div className="font-medium truncate max-w-[200px]" title={formData.geometryConfig.file_name}>
                                {formData.geometryConfig.file_name}
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
                    
                    {/* Erreur upload */}
                    {uploadError && (
                      <Alert variant="destructive" className="bg-red-900/20 border-red-800">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription className="ml-2">
                          <div className="font-semibold mb-1">Erreur d'upload</div>
                          <div className="text-sm mb-2">{uploadError}</div>
                          <div className="text-xs text-red-300">
                            Vérifiez: 1. Votre connexion 2. Politiques RLS 3. Format fichier
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>

                {/* Températures */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Temp. initiale (°C)</Label>
                    <Input
                      type="number"
                      value={formData.boundaryConditions.initial_temp}
                      onChange={e => setFormData({
                        ...formData, 
                        boundaryConditions: {
                          ...formData.boundaryConditions,
                          initial_temp: Number(e.target.value)
                        }
                      })}
                      className="bg-zinc-800/50 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temp. ambiante (°C)</Label>
                    <Input
                      type="number"
                      value={formData.boundaryConditions.ambient_temp}
                      onChange={e => setFormData({
                        ...formData, 
                        boundaryConditions: {
                          ...formData.boundaryConditions,
                          ambient_temp: Number(e.target.value)
                        }
                      })}
                      className="bg-zinc-800/50 border-zinc-700"
                    />
                  </div>
                </div>

                {/* Maillage */}
                <div className="space-y-2">
                  <Label>Densité de maillage</Label>
                  <Select
                    value={formData.meshDensity}
                    onValueChange={v => setFormData({...formData, meshDensity: v as any})}
                  >
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
                
                {/* Solveur */}
                <div className="space-y-2">
                  <Label>Méthode de calcul</Label>
                  <Select
                    value={formData.solverType}
                    onValueChange={v => setFormData({...formData, solverType: v as any})}
                  >
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="fem_fortran">FEM Fortran</SelectItem>
                      <SelectItem value="openfoam">OpenFOAM</SelectItem>
                      <SelectItem value="comsol">COMSOL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Colonne de droite - Visualisation */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Contrôles */}
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleFullscreen}
                      className="flex items-center gap-2"
                    >
                      {isFullscreen ? (
                        <>
                          <Minimize2 className="w-4 h-4" />
                          Quitter plein écran
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-4 h-4" />
                          Plein écran
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div className="text-sm text-zinc-400">
                    {formData.geometryConfig.file_name 
                      ? `Fichier chargé: ${formData.geometryConfig.file_name}`
                      : 'Aucun fichier géométrique'}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Zone de visualisation */}
            <Tabs defaultValue="visualizer" className="w-full">
              <TabsList className="bg-zinc-900/50 border-zinc-800 w-full">
                <TabsTrigger value="visualizer" className="flex-1 data-[state=active]:bg-zinc-800">
                  <Box className="w-4 h-4 mr-2" />
                  Visualisation
                </TabsTrigger>
                <TabsTrigger value="results" className="flex-1 data-[state=active]:bg-zinc-800">
                  <Thermometer className="w-4 h-4 mr-2" />
                  Résultats
                </TabsTrigger>
              </TabsList>

              {/* Visualisation */}
              <TabsContent value="visualizer" className="mt-4">
                {isRunning ? (
                  <div className="h-[600px] bg-zinc-900/50 border border-zinc-800 rounded-lg flex flex-col items-center justify-center">
                    <div className="relative">
                      <Loader2 className="w-16 h-16 animate-spin mb-4 text-blue-500" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold">{progress}%</span>
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="text-lg font-semibold">Simulation en cours</div>
                      <div className="text-sm text-zinc-400">Calcul des températures...</div>
                      <div className="w-64 mx-auto">
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="text-xs mt-2 text-center text-zinc-500">
                          Progression: {progress}%
                        </div>
                      </div>
                    </div>
                  </div>
                ) : formData.geometryConfig.file_url ? (
                  <div className={`rounded-lg overflow-hidden border border-zinc-800 ${
                    isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'h-[600px]'
                  }`}>
                    {isFullscreen && (
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
                    <div className="w-full h-full bg-zinc-900/50 flex items-center justify-center">
                      <div className="text-center">
                        <Box className="w-20 h-20 mx-auto text-zinc-600 mb-4" />
                        <div className="text-xl font-semibold mb-2">Fichier géométrique chargé</div>
                        <div className="text-sm text-zinc-400 mb-4">
                          {formData.geometryConfig.file_name}
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => window.open(formData.geometryConfig.file_url, '_blank')}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Voir le fichier
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[600px] bg-zinc-900/50 border border-zinc-800 rounded-lg flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                      <Box className="w-10 h-10" />
                    </div>
                    <div className="text-xl font-semibold mb-2">
                      {id ? 'Simulation prête' : 'Nouvelle simulation'}
                    </div>
                    <div className="text-sm text-zinc-400 mb-6 max-w-md">
                      {id 
                        ? 'Téléchargez une géométrie et lancez la simulation pour voir les résultats.'
                        : 'Configurez et sauvegardez votre simulation pour commencer.'}
                    </div>
                    <div className="flex gap-3">
                      {id ? (
                        <>
                          <Button
                            onClick={handleStartSimulation}
                            disabled={isRunning || !formData.geometryConfig.file_name}
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

              {/* Résultats */}
              <TabsContent value="results" className="mt-4">
                {results ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm text-zinc-400 mb-1">Température Max</div>
                              <div className="text-3xl font-bold text-red-500">
                                {results.max_temperature?.toFixed(1)}°C
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm text-zinc-400 mb-1">Température Min</div>
                              <div className="text-3xl font-bold text-blue-500">
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
                              <div className="text-sm text-zinc-400 mb-1">Temps Calcul</div>
                              <div className="text-3xl font-bold text-cyan-500">
                                {results.computation_time?.toFixed(1)}s
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <Thermometer className="w-16 h-16 mx-auto text-zinc-600 mb-4" />
                      <div className="text-lg font-semibold mb-2">Aucun résultat disponible</div>
                      <div className="text-sm text-zinc-400 mb-6">
                        Lancez la simulation pour calculer les résultats.
                      </div>
                      {id && (
                        <Button
                          onClick={handleStartSimulation}
                          disabled={isRunning || !formData.geometryConfig.file_name}
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
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
