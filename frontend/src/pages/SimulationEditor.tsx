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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedPoint, setSelectedPoint] = useState<{
    position: [number, number, number];
    field_values: Record<string, number>;
    element_id?: number;
  } | null>(null);

  // Référence pour l'upload timeout
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // --------------------------------------------------------------------------
  // 🔥 GESTION DES FICHIERS - VERSION CORRIGÉE DÉFINITIVE
  // --------------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // 🔥 CORRECTION : Reset complet avant nouvel upload
    setUploadingFile(true);
    setUploadError(null);
    setUploadProgress(0);
    
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current);
      uploadTimeoutRef.current = null;
    }

    const file = e.target.files?.[0];
    if (!file || !user?.id) {
      setUploadingFile(false);
      toast.error('Aucun fichier sélectionné ou utilisateur non connecté');
      return;
    }

    // 1. VALIDATION SIMPLIFIÉE (uniquement extension)
    const validExtensions = ['.stl', '.step', '.stp', '.obj', '.vtp', '.vti', '.ply', '.vtk', '.iges', '.igs', '.vtu'];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExt)) {
      setUploadingFile(false);
      toast.error(`Extension non supportée: ${fileExt}. Formats: ${validExtensions.join(', ')}`);
      return;
    }

    // 2. VALIDATION TAILLE
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadingFile(false);
      toast.error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 50MB`);
      return;
    }

    try {
      console.log('🚀 Début upload:', file.name);
      
      // 🔥 CORRECTION : Timeout ABSOLU de 45 secondes
      const timeoutPromise = new Promise<never>((_, reject) => {
        uploadTimeoutRef.current = setTimeout(() => {
          reject(new Error('Upload timeout: 45 secondes dépassées'));
        }, 45000);
      });

      // Simulation de progression
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 5, 90));
      }, 500);

      // 🔥 CORRECTION : Upload DIRECT simplifié avec fallback explicite
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
              file_type: file.type,
            },
          }));
          
          toast.success('✅ Fichier téléchargé avec succès');
          return result;
          
        } catch (error: any) {
          clearInterval(progressInterval);
          
          // 🔥 CORRECTION : Fallback manuel si le service échoue
          console.warn('⚠️ Service upload échoué, tentative manuelle...', error.message);
          
          // Tentative manuelle directe
          try {
            return await uploadFileManually(file, user.id);
          } catch (manualError: any) {
            console.error('❌ Upload manuel échoué:', manualError);
            throw manualError;
          }
        }
      })();

      // Exécution avec timeout
      await Promise.race([uploadPromise, timeoutPromise]);
      
      // Petite pause pour montrer le 100%
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error: any) {
      console.error('❌ Upload échoué:', error);
      
      let errorMessage = error.message || 'Erreur inconnue';
      
      // Messages d'erreur explicites
      if (error.message?.includes('timeout')) {
        errorMessage = 'Le serveur met trop de temps à répondre. Vérifiez votre connexion.';
      } else if (error.message?.includes('permission') || error.message?.includes('403')) {
        errorMessage = 'Permissions insuffisantes. Vérifiez votre compte.';
      } else if (error.message?.includes('415')) {
        errorMessage = 'Type de fichier non supporté. Essayez un format STL.';
      } else if (error.message?.includes('storage')) {
        errorMessage = 'Erreur de stockage. Contactez le support.';
      }
      
      setUploadError(errorMessage);
      toast.error(`❌ Échec upload: ${errorMessage}`);
      
    } finally {
      // 🔥 CORRECTION CRITIQUE : Toujours reset l'état d'upload
      setUploadingFile(false);
      setUploadProgress(0);
      
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }
      
      // Reset du champ fichier
      if (e.target) e.target.value = '';
    }
  };

  // 🔥 FONCTION D'UPLOAD MANUEL (FALLBACK)
  const uploadFileManually = async (file: File, userId: string) => {
    console.log('🔄 Upload manuel pour fichier:', file.name);
    
    const { supabase } = await import('@/lib/supabase');
    
    // Vérification session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Session expirée');
    
    // Génération nom de fichier
    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'vtp';
    const fileName = `${userId}/${timestamp}_${uniqueId}.${fileExt}`;
    
    console.log('📤 Upload vers simulation-files...');
    
    // Upload vers simulation-files (bucket public)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('simulation-files')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/octet-stream' // Type générique toujours accepté
      });
    
    if (uploadError) {
      console.error('❌ Erreur upload manuel:', uploadError);
      throw new Error(`Upload échoué: ${uploadError.message}`);
    }
    
    // URL publique
    const { data: urlData } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(fileName);
    
    if (!urlData?.publicUrl) {
      throw new Error('Impossible de générer URL');
    }
    
    return {
      success: true,
      fileUrl: urlData.publicUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      path: fileName
    };
  };

  // Fonction de test (génération fichier VTP)
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

  // ... (autres fonctions restent inchangées) ...

  // Rendu du bouton upload avec état
  const renderUploadButton = () => {
    if (uploadingFile) {
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Upload en cours... {uploadProgress}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <p className="text-xs text-zinc-400 mt-1">
              Patientez, cela peut prendre quelques secondes...
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
        {/* Section upload simplifiée */}
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Géométrie du modèle</Label>
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
                    <Alert className="bg-blue-900/20 border-blue-800">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <AlertDescription className="ml-2">
                        <div className="font-semibold">Upload en cours</div>
                        <div className="text-sm">Ne quittez pas cette page...</div>
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
                          Conseils: 1. Vérifiez votre connexion 2. Réessayez avec un fichier plus petit 3. Contactez le support si le problème persiste
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
                              {formData.geometryConfig.file_name.length > 30 
                                ? formData.geometryConfig.file_name.substring(0, 15) + '...' + formData.geometryConfig.file_name.substring(formData.geometryConfig.file_name.length - 10)
                                : formData.geometryConfig.file_name
                              }
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

              {/* ... reste du formulaire inchangé ... */}
            </div>
          </CardContent>
        </Card>

        {/* ... reste du composant inchangé ... */}
      </div>
    </div>
  );
}
