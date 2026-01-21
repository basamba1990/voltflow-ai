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
  Box
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
import { VTKViewer } from '@/components/Viewers/VTKViewer';

export default function SimulationEditor() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { simulation, results, isRunning, progress, startSimulation, refresh } = useSimulation(id || '', { realtime: true });
  const { data: materialsDataRaw } = useMaterials();
  const { user } = useAuth();
  
  const materialsData = Array.isArray(materialsDataRaw) ? materialsDataRaw : [];
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    geometryType: 'complex',
    geometryConfig: { file_url: '', file_name: '' },
    materialId: '',
    meshDensity: 'high' as 'low' | 'medium' | 'high',
    initialTemp: '200',
    ambientTemp: '25',
    solverType: 'fem_fortran'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    if (id && simulation) {
      const bc = simulation.boundary_conditions as any;
      setFormData({
        name: simulation.name || '',
        description: simulation.description || '',
        geometryType: simulation.geometry_type || 'complex',
        geometryConfig: (simulation.geometry_config as any) || { file_url: '', file_name: '' },
        materialId: simulation.material_id || '',
        meshDensity: simulation.mesh_density_level || 'high',
        initialTemp: bc?.initial_temp?.toString() || '200',
        ambientTemp: bc?.ambient_temp?.toString() || '25',
        solverType: simulation.solver_type || 'fem_fortran'
      });
    }
  }, [id, simulation]);

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

  const handleSave = async () => {
    if (!formData.name.trim()) return toast.error('Nom requis');
    try {
      setIsSaving(true);
      const payload = {
        name: formData.name,
        description: formData.description,
        geometryType: formData.geometryType,
        config: {
          geometry_config: formData.geometryConfig,
          material_id: formData.materialId,
          mesh_density: formData.meshDensity,
          boundary_conditions: {
            initial_temp: parseFloat(formData.initialTemp),
            ambient_temp: parseFloat(formData.ambientTemp)
          },
          solver_type: formData.solverType
        }
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

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation('/dashboard')}>
              <ChevronLeft className="w-4 h-4 mr-2" /> Retour
            </Button>
            <h1 className="text-2xl font-bold">{id ? 'Modifier Simulation' : 'Nouvelle Simulation'}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Sauvegarder
            </Button>
            <Button onClick={startSimulation} disabled={isRunning || !id}>
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Lancer
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="bg-zinc-800 border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <Label>Géométrie (STL/STEP)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="file" onChange={handleFileUpload} className="hidden" id="geo-upload" />
                    <Button asChild variant="secondary" className="w-full">
                      <label htmlFor="geo-upload" className="cursor-pointer">
                        {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                        {formData.geometryConfig.file_name || 'Choisir un fichier'}
                      </label>
                    </Button>
                  </div>
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
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="visualizer" className="w-full">
              <TabsList className="bg-zinc-900 border-zinc-800">
                <TabsTrigger value="visualizer"><Box className="w-4 h-4 mr-2" /> Visualisation 3D</TabsTrigger>
                <TabsTrigger value="results"><Thermometer className="w-4 h-4 mr-2" /> Résultats</TabsTrigger>
              </TabsList>
              <TabsContent value="visualizer" className="mt-4">
                {results?.vtk_file_url ? (
                  <VTKViewer dataUrl={results.vtk_file_url} temperatureData={results.temperature_field} />
                ) : (
                  <div className="h-[600px] bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center text-zinc-500">
                    {isRunning ? "Simulation en cours..." : "Lancez la simulation pour voir le rendu 3D"}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="results">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-6">
                    {results ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-zinc-800 rounded-lg">
                          <div className="text-sm text-zinc-400">Température Max</div>
                          <div className="text-2xl font-bold text-red-500">{results.max_temperature}°C</div>
                        </div>
                        <div className="p-4 bg-zinc-800 rounded-lg">
                          <div className="text-sm text-zinc-400">Fidélité</div>
                          <div className="text-2xl font-bold text-green-500">{(1 - results.uncertainty_score) * 100}%</div>
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
