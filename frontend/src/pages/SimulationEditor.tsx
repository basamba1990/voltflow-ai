import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  Save,
  Play,
  Download,
  Trash2,
  Thermometer,
  Loader2,
  AlertCircle,
  ChevronLeft,
  UploadCloud,
  Box,
  X
} from 'lucide-react';

// Services et hooks
import SimulationService, { Simulation, SimulationConfig } from '@/services/simulation.service';
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
import IndustrialVTKViewer, { IndustrialField } from '@/components/Viewers/IndustrialVTKViewer'; // Import du nouveau Viewer
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

// Définition des types pour le formulaire
interface FormData {
  name: string;
  description: string;
  geometryType: string;
  geometryConfig: { file_url: string; file_name: string; };
  materialId: string;
  meshDensity: 'low' | 'medium' | 'high';
  initialTemp: string;
  ambientTemp: string;
  coolingType: 'natural_convection' | 'forced_convection' | 'radiation';
  convectionCoeff: string;
  fluidType: 'air' | 'water' | 'oil';
  fluidVelocity: string;
  solverType: string;
}

export default function SimulationEditor() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { 
    simulation, 
    results, 
    isRunning, 
    progress, 
    startSimulation, 
    cancelSimulation,
    deleteSimulation,
    refresh 
  } = useSimulation(id || '', { realtime: true });
  const { data: materialsDataRaw } = useMaterials();
  const { user } = useAuth();
  
  const materialsData = Array.isArray(materialsDataRaw) ? materialsDataRaw : [];
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    geometryType: 'complex',
    geometryConfig: { file_url: '', file_name: '' },
    materialId: '',
    meshDensity: 'high',
    initialTemp: '200',
    ambientTemp: '25',
    coolingType: 'natural_convection',
    convectionCoeff: '10',
    fluidType: 'air',
    fluidVelocity: '0',
    solverType: 'fem_fortran'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Synchronisation des données de la simulation avec le formulaire
  useEffect(() => {
    if (id && simulation) {
      const bc = simulation.boundary_conditions as SimulationConfig['boundary_conditions'];
      const geo = simulation.geometry_config as SimulationConfig['geometry_config'];
      
      setFormData({
        name: simulation.name || '',
        description: simulation.description || '',
        geometryType: simulation.geometry_type || 'complex',
        geometryConfig: geo || { file_url: '', file_name: '' },
        materialId: simulation.material_id || '',
        meshDensity: simulation.mesh_density as 'low' | 'medium' | 'high' || 'high',
        initialTemp: bc?.initial_temp?.toString() || '200',
        ambientTemp: bc?.ambient_temp?.toString() || '25',
        coolingType: bc?.cooling_type || 'natural_convection',
        convectionCoeff: bc?.convection_coeff?.toString() || '10',
        fluidType: bc?.fluid_type || 'air',
        fluidVelocity: bc?.fluid_velocity?.toString() || '0',
        solverType: (simulation as any).solver_type || 'fem_fortran'
      });
    }
  }, [id, simulation]);

  // Gestion de l'upload de fichier
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    try {
      setUploadingFile(true);
      const result = await SimulationService.uploadGeometry({ file, userId: user.id, simulationId: id });
      setFormData(prev => ({
        ...prev,
        geometryConfig: { file_url: result.fileUrl, file_name: result.fileName }
      }));
      toast.success("Fichier géométrique téléchargé");
    } catch (error: any) {
      toast.error("Erreur upload: " + error.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // Gestion de la sauvegarde
  const handleSave = async () => {
    if (!formData.name.trim()) return toast.error('Nom requis');
    if (!formData.materialId) return toast.error('Matériau requis');
    
    try {
      setIsSaving(true);
      
      const config: SimulationConfig = {
        geometry_config: formData.geometryConfig,
        material_id: formData.materialId,
        mesh_density: formData.meshDensity,
        solver_type: formData.solverType,
        boundary_conditions: {
          initial_temp: parseFloat(formData.initialTemp),
          ambient_temp: parseFloat(formData.ambientTemp),
          cooling_type: formData.coolingType,
          convection_coeff: parseFloat(formData.convectionCoeff),
          fluid_type: formData.fluidType,
          fluid_velocity: parseFloat(formData.fluidVelocity),
        }
      };
      
      const payload = {
        name: formData.name,
        description: formData.description,
        geometryType: formData.geometryType,
        config: config
      };

      if (id) {
        await SimulationService.updateSimulation(id, payload);
        toast.success('Mis à jour');
      } else {
        const newSim = await SimulationService.createSimulation(payload);
        setLocation(`/simulation/${newSim.id}`);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Gestion de la suppression
  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteSimulation();
      setLocation('/dashboard');
    } catch (error) {
      // L'erreur est déjà toastée dans useSimulation
    }
  };

  // Préparation des données pour le VTK Viewer
  const vtkViewerProps = useMemo(() => {
    if (!results || !results.vtk_file_url) return null;
    
    // Simuler la création des champs de données industriels
    const fields: IndustrialField[] = [];
    
    // Champ de Température (obligatoire)
    if (results.temperature_field) {
      const values = new Float32Array(results.temperature_field);
      fields.push({
        id: 'temp',
        name: 'Temperature',
        type: 'temperature',
        values: values,
        units: '°C',
        min: Math.min(...values),
        max: Math.max(...values),
      });
    }
    
    // Champ de Contrainte (exemple)
    if (results.stress_field) {
      const values = new Float32Array(results.stress_field);
      fields.push({
        id: 'stress',
        name: 'Von Mises Stress',
        type: 'stress',
        values: values,
        units: 'MPa',
        min: Math.min(...values),
        max: Math.max(...values),
      });
    }
    
    // Déterminer le champ actif (par défaut, la température)
    const active_field_id = fields.length > 0 ? fields[0].id : undefined;
    
    return {
      mesh: {
        url: results.vtk_file_url,
        type: 'vtp' as const, // Assumer VTP pour les résultats de simulation
      },
      fields: fields,
      active_field_id: active_field_id,
      show_controls: true,
      show_coordinates: true,
      className: 'h-[600px] w-full',
      simulation: {
        engine: formData.solverType,
        case_name: formData.name,
        version: '1.0',
        timestamp: new Date().toISOString(),
      }
    };
  }, [results, formData.solverType, formData.name]);

  // Composant de configuration des conditions aux limites
  const BoundaryConditionsForm = () => (
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="initialTemp">Température Initiale (°C)</Label>
          <Input 
            id="initialTemp" 
            type="number" 
            value={formData.initialTemp} 
            onChange={e => setFormData({...formData, initialTemp: e.target.value})} 
            className="bg-zinc-800 border-zinc-700" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ambientTemp">Température Ambiante (°C)</Label>
          <Input 
            id="ambientTemp" 
            type="number" 
            value={formData.ambientTemp} 
            onChange={e => setFormData({...formData, ambientTemp: e.target.value})} 
            className="bg-zinc-800 border-zinc-700" 
          />
        </div>
      </div>
      
      <Separator className="bg-zinc-700" />
      
      <div className="space-y-2">
        <Label htmlFor="coolingType">Type de Refroidissement</Label>
        <Select value={formData.coolingType} onValueChange={v => setFormData({...formData, coolingType: v as FormData['coolingType']})}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="natural_convection">Convection Naturelle</SelectItem>
            <SelectItem value="forced_convection">Convection Forcée</SelectItem>
            <SelectItem value="radiation">Radiation</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {formData.coolingType !== 'radiation' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="convectionCoeff">Coefficient de Convection (W/m²K)</Label>
              <Input 
                id="convectionCoeff" 
                type="number" 
                value={formData.convectionCoeff} 
                onChange={e => setFormData({...formData, convectionCoeff: e.target.value})} 
                className="bg-zinc-800 border-zinc-700" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fluidType">Fluide</Label>
              <Select value={formData.fluidType} onValueChange={v => setFormData({...formData, fluidType: v as FormData['fluidType']})}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="air">Air</SelectItem>
                  <SelectItem value="water">Eau</SelectItem>
                  <SelectItem value="oil">Huile</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {formData.coolingType === 'forced_convection' && (
            <div className="space-y-2">
              <Label htmlFor="fluidVelocity">Vitesse du Fluide (m/s)</Label>
              <Input 
                id="fluidVelocity" 
                type="number" 
                value={formData.fluidVelocity} 
                onChange={e => setFormData({...formData, fluidVelocity: e.target.value})} 
                className="bg-zinc-800 border-zinc-700" 
              />
            </div>
          )}
        </>
      )}
    </CardContent>
  );

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation('/dashboard')}>
              <ChevronLeft className="w-4 h-4 mr-2" /> Retour
            </Button>
            <h1 className="text-2xl font-bold">{id ? 'Modifier Simulation' : 'Nouvelle Simulation'}</h1>
            {simulation && <SimulationStatus status={simulation.status as any} progress={progress} />}
          </div>
          <div className="flex gap-2">
            {id && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isRunning}>
                    <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Êtes-vous absolument sûr ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible. Elle supprimera définitivement la simulation et tous ses résultats.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white">Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="outline" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Sauvegarder
            </Button>
            <Button onClick={() => startSimulation()} disabled={isRunning || !id || simulation?.status === 'completed'}>
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              {isRunning ? 'En cours...' : 'Lancer'}
            </Button>
            {isRunning && (
              <Button variant="secondary" onClick={() => cancelSimulation()}>
                <X className="w-4 h-4 mr-2" /> Annuler
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            
            {/* Carte de Configuration Générale */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader><CardTitle>Configuration Générale</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom</Label>
                  <Input 
                    id="name"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input 
                    id="description"
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Matériau</Label>
                  <Select value={formData.materialId} onValueChange={v => setFormData({...formData, materialId: v})}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {materialsData.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Densité du Maillage</Label>
                  <Select value={formData.meshDensity} onValueChange={v => setFormData({...formData, meshDensity: v as FormData['meshDensity']})}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Faible</SelectItem>
                      <SelectItem value="medium">Moyenne</SelectItem>
                      <SelectItem value="high">Élevée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Solveur</Label>
                  <Select value={formData.solverType} onValueChange={v => setFormData({...formData, solverType: v})}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fem_fortran">FEM (Fortran)</SelectItem>
                      <SelectItem value="cfd_openfoam">CFD (OpenFOAM)</SelectItem>
                      <SelectItem value="pinn_torch">PINN (PyTorch)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            
            {/* Carte de Géométrie */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader><CardTitle>Géométrie</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Fichier Géométrique (STL/STEP)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="file" onChange={handleFileUpload} className="hidden" id="geo-upload" />
                    <Button asChild variant="secondary" className="w-full">
                      <label htmlFor="geo-upload" className="cursor-pointer">
                        {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                        {formData.geometryConfig.file_name || 'Choisir un fichier'}
                      </label>
                    </Button>
                  </div>
                  {formData.geometryConfig.file_name && (
                    <Badge variant="outline" className="mt-2 bg-green-900/30 border-green-700 text-green-400">
                      {formData.geometryConfig.file_name}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
            
            {/* Carte des Conditions aux Limites */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader><CardTitle>Conditions aux Limites</CardTitle></CardHeader>
              <BoundaryConditionsForm />
            </Card>

          </div>

          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="visualizer" className="w-full">
              <TabsList className="bg-zinc-900 border-zinc-800">
                <TabsTrigger value="visualizer"><Box className="w-4 h-4 mr-2" /> Visualisation 3D</TabsTrigger>
                <TabsTrigger value="results"><Thermometer className="w-4 h-4 mr-2" /> Résultats</TabsTrigger>
              </TabsList>
              <TabsContent value="visualizer" className="mt-4">
                {vtkViewerProps ? (
                  <IndustrialVTKViewer {...vtkViewerProps} />
                ) : (
                  <div className="h-[600px] bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center text-zinc-500">
                    {isRunning ? (
                      <div className="flex flex-col items-center">
                        <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
                        Simulation en cours... ({progress}%)
                      </div>
                    ) : simulation?.status === 'completed' ? (
                      <div className="flex flex-col items-center">
                        <AlertCircle className="w-8 h-8 mb-3 text-yellow-500" />
                        Résultats disponibles, mais le fichier VTK est manquant.
                      </div>
                    ) : (
                      "Lancez la simulation pour voir le rendu 3D industriel"
                    )}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="results">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader><CardTitle>Métriques de Simulation</CardTitle></CardHeader>
                  <CardContent className="pt-6">
                    {results ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-zinc-800 rounded-lg">
                          <div className="text-sm text-zinc-400">Température Max</div>
                          <div className="text-2xl font-bold text-red-500">{results.max_temperature?.toFixed(2) || 'N/A'}°C</div>
                        </div>
                        <div className="p-4 bg-zinc-800 rounded-lg">
                          <div className="text-sm text-zinc-400">Score d'Incertitude</div>
                          <div className="text-2xl font-bold text-green-500">{(results.uncertainty_score * 100)?.toFixed(2) || 'N/A'}%</div>
                        </div>
                        <div className="p-4 bg-zinc-800 rounded-lg">
                          <div className="text-sm text-zinc-400">Temps de Calcul</div>
                          <div className="text-2xl font-bold text-cyan-500">{results.computation_time_s?.toFixed(1) || 'N/A'}s</div>
                        </div>
                        <div className="p-4 bg-zinc-800 rounded-lg">
                          <div className="text-sm text-zinc-400">Nombre d'Itérations</div>
                          <div className="text-2xl font-bold text-purple-500">{results.iterations || 'N/A'}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-zinc-500">Aucun résultat disponible</div>
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
