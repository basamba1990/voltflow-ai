// src/pages/SimulationEditor.tsx - VERSION ULTRA-FLUIDE
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import { Save, Play, Download, Trash2, Loader2, ChevronLeft, FileUp, Box, Settings, Grid3x3, Maximize2, Minimize2, Square, BarChart3 } from 'lucide-react';

import SimulationService from '@/services/simulation.service';
import { useSimulation } from '@/hooks/useSimulation';
import { useMaterials } from '@/hooks/useMaterials';
import { useAuth } from '@/contexts/AuthContext';

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

export default function SimulationEditor() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { simulation, results, isRunning, progress, startSimulation: startSimulationHook, refresh } = useSimulation(id || '', { realtime: true });
  const { data: materialsDataRaw } = useMaterials();
  const { user } = useAuth();
  const materialsData = Array.isArray(materialsDataRaw) ? materialsDataRaw : [];

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    geometryType: 'complex' as 'simple' | 'complex',
    geometryConfig: { file_url: '', file_name: '', file_size: 0, file_path: '', dimensions: { width: 100, height: 100, depth: 100 } },
    materialId: '',
    meshDensity: 'medium' as 'low' | 'medium' | 'high',
    nx: 60, ny: 60, nz: 60,
    initialTemp: '350', ambientTemp: '25',
    coolingType: 'natural_convection',
    convectionCoeff: '10', fluidType: 'air', fluidVelocity: '1',
    solverType: 'openfoam',
  });

  const [viewState, setViewState] = useState({ isFullscreen: false, showGrid: true, showAxes: true, viewMode: 'volume' as any, colorMap: 'heat' as any, opacity: 0.8 });
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'finalizing'>('idle');

  useEffect(() => {
    if (id && simulation) {
      const bc = simulation.boundary_conditions as any;
      const gc = simulation.geometry_config as any;
      setFormData(prev => ({
        ...prev,
        name: simulation.name || '',
        description: simulation.description || '',
        geometryType: simulation.geometry_type || 'complex',
        geometryConfig: { ...prev.geometryConfig, ...gc },
        materialId: simulation.material_id || '',
        meshDensity: simulation.mesh_density || 'medium',
        nx: simulation.nx || 60, ny: simulation.ny || 60, nz: simulation.nz || 60,
        initialTemp: bc?.initial_temp?.toString() || '350',
        ambientTemp: bc?.ambient_temp?.toString() || '25',
        coolingType: bc?.cooling_type || 'natural_convection',
        solverType: simulation.solver_type || 'openfoam',
      }));
    }
  }, [id, simulation]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setUploadProgress(10);
    setUploadPhase('uploading');

    try {
      const result = await SimulationService.uploadGeometry({
        file,
        simulationId: id || undefined,
        simulationName: formData.name || file.name.replace(/\.[^/.]+$/, ''),
        materialId: formData.materialId || undefined,
      });

      setUploadProgress(100);
      setUploadPhase('idle');
      setUploadingFile(false);
      toast.success('Fichier prêt !');

      setFormData(prev => ({
        ...prev,
        geometryConfig: { ...prev.geometryConfig, file_url: result.fileUrl, file_name: result.fileName, file_path: result.path }
      }));

      if (!id && result.simulationId) {
        setLocation(`/simulation/${result.simulationId}`);
      } else {
        refresh();
      }
    } catch (error: any) {
      setUploadingFile(false);
      setUploadPhase('idle');
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const handleSaveSimulation = async () => {
    if (!user?.id) return toast.error('Connectez-vous');
    setIsSaving(true);
    try {
      const data = {
        name: formData.name,
        description: formData.description,
        geometryType: formData.geometryType,
        config: {
          geometry_config: { ...formData.geometryConfig, nx: formData.nx, ny: formData.ny, nz: formData.nz },
          boundary_conditions: { initial_temp: parseFloat(formData.initialTemp), ambient_temp: parseFloat(formData.ambientTemp), cooling_type: formData.coolingType as any, convection_coeff: parseFloat(formData.convectionCoeff), fluid_type: formData.fluidType as any, fluid_velocity: parseFloat(formData.fluidVelocity) },
          material_id: formData.materialId,
          mesh_density: formData.meshDensity,
          solver_type: formData.solverType,
        }
      };
      if (id) {
        await SimulationService.updateSimulation(id, data);
        toast.success('Mis à jour');
      } else {
        const newSim = await SimulationService.createSimulation(data);
        setLocation(`/simulation/${newSim.id}`);
      }
      refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartSimulation = async () => {
    if (!id) return toast.error('Sauvegardez d\'abord');
    try {
      await startSimulationHook(id);
      toast.success('Lancé !');
      refresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const prepareViewerData = useMemo(() => {
    if (!results) return null;
    const tempArray = Array.isArray(results.temperature_field?.values) ? results.temperature_field.values : [];
    return {
      mesh: { url: results.vtk_file_url || results.geometry_url || '', type: 'vtp' as any },
      fields: [{ id: 'temp', name: 'Temp', type: 'temperature' as any, values: new Float32Array(tempArray), units: '°C', min: 25, max: 350 }],
      config: { background: 'dark' as any },
      legend: { min: 25, max: 350, units: '°C', color_map: 'heat' as any }
    };
  }, [results]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => setLocation('/dashboard')}><ChevronLeft /></Button>
          <h1 className="text-xl font-bold">{id ? 'Modifier' : 'Nouvelle Simulation'}</h1>
          {simulation && <SimulationStatus status={simulation.status} progress={simulation.progress} />}
        </div>
        <div className="flex space-x-2">
          <Button onClick={handleSaveSimulation} disabled={isSaving}>{isSaving && <Loader2 className="animate-spin mr-2" />}Sauvegarder</Button>
          <Button onClick={handleStartSimulation} disabled={isRunning || !id} className="bg-green-600">Lancer</Button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-3 gap-4 p-4 overflow-hidden">
        <Card className="col-span-2 relative">
          <CardContent className="h-full p-0">
            {prepareViewerData ? (
              <VTKViewer data={prepareViewerData} {...viewState} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {uploadingFile ? `Upload en cours... ${uploadProgress}%` : "Prêt pour la simulation"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-y-auto">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Fichier 3D (STL, STEP...)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <input type="file" id="file-upload" className="hidden" onChange={handleFileUpload} />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                  <FileUp className="h-8 w-8 mb-2 text-muted-foreground" />
                  <span className="text-sm">{formData.geometryConfig.file_name || "Choisir un fichier"}</span>
                  {uploadingFile && <span className="text-xs text-blue-500 mt-2">Phase: {uploadPhase}...</span>}
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Matériau</Label>
              <Select value={formData.materialId} onValueChange={v => setFormData({...formData, materialId: v})}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {materialsData.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>NX</Label><Input type="number" value={formData.nx} onChange={e => setFormData({...formData, nx: parseInt(e.target.value)})} /></div>
              <div><Label>NY</Label><Input type="number" value={formData.ny} onChange={e => setFormData({...formData, ny: parseInt(e.target.value)})} /></div>
              <div><Label>NZ</Label><Input type="number" value={formData.nz} onChange={e => setFormData({...formData, nz: parseInt(e.target.value)})} /></div>
            </div>
            <div className="space-y-2">
              <Label>Solveur</Label>
              <Select value={formData.solverType} onValueChange={v => setFormData({...formData, solverType: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openfoam">OpenFOAM (3D)</SelectItem>
                  <SelectItem value="fem_fortran">Fortran (1D/2D)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
