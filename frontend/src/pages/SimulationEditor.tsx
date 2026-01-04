// frontend/src/pages/SimulationEditor.tsx
import { useState, useEffect } from 'react'
import { useParams, useLocation } from 'wouter'
import { SimulationService } from '@/services/simulationService'
import { useSimulationRealtime } from '@/hooks/useSimulationRealtime'
import { SimulationStatus } from '@/components/SimulationStatus'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { 
  Save, 
  Play, 
  Upload, 
  Download,
  Trash2,
  Settings,
  BarChart3,
  Thermometer,
  Wind,
  Zap,
  Loader2
} from 'lucide-react'

export default function SimulationEditor() {
  const [, setLocation] = useLocation()
  const { id } = useParams<{ id: string }>()
  const { simulation, progress, status } = useSimulationRealtime(id)
  
  // Basic Config
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [geometryType, setGeometryType] = useState('tube')
  const [materialId, setMaterialId] = useState('aluminum-6061')
  const [meshDensity, setMeshDensity] = useState<'low' | 'medium' | 'high'>('low')
  
  // Thermal Conditions
  const [initialTemp, setInitialTemp] = useState('200')
  const [ambientTemp, setAmbientTemp] = useState('25')
  const [coolingType, setCoolingType] = useState('natural_convection')
  const [convectionCoeff, setConvectionCoeff] = useState('15')
  
  // Fluid Dynamics
  const [fluidType, setFluidType] = useState('air')
  const [fluidVelocity, setFluidVelocity] = useState('1.5')
  
  const [isLoading, setIsLoading] = useState(false)
  const [materials, setMaterials] = useState<Array<{ id: string; name: string; category: string }>>([])

  useEffect(() => {
    setMaterials([
      { id: 'aluminum-6061', name: 'Aluminum 6061', category: 'metal' },
      { id: 'copper', name: 'Copper', category: 'metal' },
      { id: 'stainless-304', name: 'Stainless Steel 304', category: 'metal' },
      { id: 'al-er-zr-ni-am', name: 'Al-Er-Zr-Ni (AM High-Temp)', category: 'additive' },
    ])
  }, [])

  useEffect(() => {
    if (id && simulation) {
      setName(simulation.name)
      setDescription(simulation.description || '')
      setGeometryType(simulation.geometry_type)
      setMaterialId(simulation.material_id || 'aluminum-6061')
      setMeshDensity(simulation.mesh_density as any)
      
      const bc = simulation.boundary_conditions as any
      if (bc) {
        setInitialTemp(bc.initial_temp?.toString() || '200')
        setAmbientTemp(bc.ambient_temp?.toString() || '25')
        setCoolingType(bc.cooling_type || 'natural_convection')
        setConvectionCoeff(bc.convection_coeff?.toString() || '15')
        setFluidType(bc.fluid_type || 'air')
        setFluidVelocity(bc.fluid_velocity?.toString() || '1.5')
      }
    }
  }, [id, simulation])

  const getPayload = () => ({
    name,
    description,
    geometryType,
    config: {
      geometry_config: { type: geometryType },
      material_id: materialId,
      mesh_density: meshDensity,
      boundary_conditions: {
        initial_temp: parseFloat(initialTemp),
        ambient_temp: parseFloat(ambientTemp),
        cooling_type: coolingType,
        convection_coeff: parseFloat(convectionCoeff),
        fluid_type: fluidType,
        fluid_velocity: parseFloat(fluidVelocity)
      }
    }
  })

  const handleSave = async () => {
    if (!name) {
      toast.error('Le nom de la simulation est requis')
      return
    }
    
    // VALIDATION CRITIQUE: Vérifier les champs numériques pour éviter l'erreur 22P02 (Invalid Text Representation)
    const numericFields = [
      { value: initialTemp, name: 'Température initiale' },
      { value: ambientTemp, name: 'Température ambiante' },
      { value: convectionCoeff, name: 'Coefficient de convection' },
      { value: fluidVelocity, name: 'Vitesse du fluide' },
    ];

    for (const field of numericFields) {
      const numValue = parseFloat(field.value);
      if (field.value.trim() === '' || isNaN(numValue)) {
        toast.error(`Veuillez entrer une valeur numérique valide pour : ${field.name}`);
        return;
      }
    }
    // FIN VALIDATION CRITIQUE
    
    try {
      setIsLoading(true)
      const payload = getPayload()
      
      if (id) {
        await SimulationService.updateSimulation(id, payload)
        toast.success('Simulation mise à jour')
      } else {
        const newSim = await SimulationService.createSimulation(payload)
        toast.success('Simulation créée')
        setLocation(`/simulation/${newSim.id}`)
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRunSimulation = async () => {
    if (!id) {
      toast.error('Veuillez d\'abord enregistrer la simulation')
      return
    }

    try {
      setIsLoading(true)
      toast.info('Démarrage de la simulation PINN...')
      
      // Récupérer la configuration actuelle pour le moteur SNPGP
      const payload = getPayload()
      await SimulationService.startSimulation(id, payload.config)
      
      toast.success('Simulation lancée avec succès')
    } catch (error: any) {
      toast.error(`Échec du lancement: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm('Supprimer cette simulation ?')) return
    try {
      setIsLoading(true)
      await SimulationService.deleteSimulation(id)
      toast.success('Simulation supprimée')
      setLocation('/dashboard')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6 bg-background text-foreground min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="text-primary w-8 h-8" />
            {id ? 'Modifier la Simulation' : 'Nouvelle Simulation'}
          </h1>
          <p className="text-muted-foreground">
            Configurez et lancez vos simulations thermiques haute performance
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {id && (
            <Button variant="outline" onClick={handleDelete} disabled={isLoading || status === 'running'}>
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </Button>
          )}
          <Button onClick={handleSave} disabled={isLoading || status === 'running'} className="bg-primary hover:bg-primary/90">
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {id ? 'Mettre à jour' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="config" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-card border border-border">
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="thermal">Thermique</TabsTrigger>
              <TabsTrigger value="fluid">Fluide</TabsTrigger>
            </TabsList>
            
            <TabsContent value="config" className="mt-4">
              <Card className="border-border bg-card/50">
                <CardHeader><CardTitle className="text-lg">Paramètres de base</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom de la simulation</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Refroidissement tube Alu 6061" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Détails du projet..." rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Géométrie</Label>
                      <Select value={geometryType} onValueChange={setGeometryType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tube">Tube</SelectItem>
                          <SelectItem value="plate">Plaque</SelectItem>
                          <SelectItem value="coil">Serpentin</SelectItem>
                          <SelectItem value="custom">Custom (STL/STEP)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Matériau</Label>
                      <Select value={materialId} onValueChange={setMaterialId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Précision / Vitesse (Moteur PINN)</Label>
                    <Select value={meshDensity} onValueChange={(v: any) => setMeshDensity(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low (Fast - Secondes)</SelectItem>
                        <SelectItem value="medium">Medium (Balanced)</SelectItem>
                        <SelectItem value="high">High (Accurate - Minutes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="thermal" className="mt-4">
              <Card className="border-border bg-card/50">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Thermometer className="w-5 h-5 text-primary" /> Conditions Thermiques</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Température initiale (°C)</Label>
                      <Input type="number" value={initialTemp} onChange={(e) => setInitialTemp(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Température ambiante (°C)</Label>
                      <Input type="number" value={ambientTemp} onChange={(e) => setAmbientTemp(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Type de refroidissement</Label>
                    <Select value={coolingType} onValueChange={setCoolingType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="natural_convection">Convection naturelle</SelectItem>
                        <SelectItem value="forced_convection">Convection forcée</SelectItem>
                        <SelectItem value="radiation">Radiation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Coefficient de convection (W/m²·K)</Label>
                    <Input type="number" value={convectionCoeff} onChange={(e) => setConvectionCoeff(e.target.value)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fluid" className="mt-4">
              <Card className="border-border bg-card/50">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wind className="w-5 h-5 text-secondary" /> Dynamique Fluide</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Fluide</Label>
                    <Select value={fluidType} onValueChange={setFluidType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="air">Air</SelectItem>
                        <SelectItem value="water">Eau</SelectItem>
                        <SelectItem value="oil">Huile industrielle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Vitesse du fluide (m/s)</Label>
                    <Input type="number" step="0.1" value={fluidVelocity} onChange={(e) => setFluidVelocity(e.target.value)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader><CardTitle className="text-lg">Statut de la Simulation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <SimulationStatus status={status as any} progress={progress} />
              <Separator className="bg-primary/10" />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Actions</h4>
                <Button 
                  className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20" 
                  onClick={handleRunSimulation}
                  disabled={isLoading || !id || status === 'running'}
                >
                  {status === 'running' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Lancer la Simulation
                </Button>
                {status === 'completed' && (
                  <Button variant="outline" className="w-full" onClick={() => SimulationService.getSimulationResults(id!)}>
                    <Download className="w-4 h-4 mr-2" /> Télécharger les résultats
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50">
            <CardHeader><CardTitle className="text-sm font-medium">Moteur IA VoltFlow</CardTitle></CardHeader>
            {status === 'completed' && simulation?.results && (
              <CardContent className="space-y-2 pt-0">
                <Separator className="bg-primary/10" />
                <h4 className="text-sm font-medium text-primary">Analyse de Fiabilité (SNPGP & Sidecar)</h4>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">Incertitude (Variance GP):</span>
                  <span className={simulation.results.uncertainty_score > 0.2 ? 'text-red-500 font-bold' : 'text-green-500'}>
                    {(simulation.results.uncertainty_score * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">Détection Domain Shift:</span>
                  <span className={simulation.results.domain_shift_alert ? 'text-red-500 font-bold' : 'text-green-500'}>
                    {simulation.results.domain_shift_alert ? 'DÉTECTÉ' : 'NORMAL'}
                  </span>
                </div>
                {simulation.results.domain_shift_alert && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[10px] text-red-600 dark:text-red-400">
                    <p className="font-bold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> ALERTE DOMAIN SHIFT
                    </p>
                    <p>Les conditions d'entrée sortent de l'espace de distribution connu. Le **Sidecar** a été activé pour garantir le respect des lois physiques.</p>
                  </div>
                )}
              </CardContent>
            )}
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>✔ Physics-Informed Neural Networks (PINNs)</p>
              <p>✔ Résolution couplage convection / conduction</p>
              <p>✔ Surveillance de convergence en temps réel</p>
              <p className="text-green-500">✔ Quantification de l'incertitude (SNPGP)</p>
              <p className="text-green-500">✔ Préservation de la structure physique (SPML)</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
