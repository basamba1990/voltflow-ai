// FICHIER CORRIGÉ COMPLET : frontend/src/pages/SimulationEditor.tsx

import { useState, useEffect } from 'react'
import { useParams, useLocation } from 'wouter'
import { SimulationService } from '@/services/simulationService'
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
import { supabase } from '@/lib/supabase'
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
  const [simulationData, setSimulationData] = useState<any>(null)
  const [simulationStatus, setSimulationStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending')
  const [progress, setProgress] = useState(0)

  // Récupérer les données de la simulation
  useEffect(() => {
    if (id) {
      loadSimulationData()
      subscribeToRealtimeUpdates()
    }
  }, [id])

  const loadSimulationData = async () => {
    if (!id) return
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      
      const { data: simulation, error } = await supabase
        .from('simulations')
        .select('*')
        .eq('id', id)
        .eq('user_id', session.user.id)
        .single()
      
      if (error) throw error
      
      setSimulationData(simulation)
      setName(simulation.name)
      setDescription(simulation.description || '')
      setGeometryType(simulation.geometry_type)
      setMaterialId(simulation.material_id || 'aluminum-6061')
      setMeshDensity(simulation.mesh_density as any)
      setSimulationStatus(simulation.status)
      setProgress(simulation.progress || 0)
      
      const bc = simulation.boundary_conditions as any
      if (bc) {
        setInitialTemp(bc.initial_temp?.toString() || '200')
        setAmbientTemp(bc.ambient_temp?.toString() || '25')
        setCoolingType(bc.cooling_type || 'natural_convection')
        setConvectionCoeff(bc.convection_coeff?.toString() || '15')
        setFluidType(bc.fluid_type || 'air')
        setFluidVelocity(bc.fluid_velocity?.toString() || '1.5')
      }
    } catch (error: any) {
      console.error('Erreur chargement simulation:', error)
      if (error.message !== 'PGRST116') {
        toast.error('Erreur lors du chargement de la simulation')
      }
    }
  }

  const subscribeToRealtimeUpdates = () => {
    if (!id) return
    
    const channel = supabase
      .channel(`simulation-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'simulations',
          filter: `id=eq.${id}`
        },
        (payload) => {
          const updatedSim = payload.new as any
          setSimulationStatus(updatedSim.status)
          setProgress(updatedSim.progress || 0)
          
          if (updatedSim.status === 'completed') {
            toast.success('Simulation terminée!')
          } else if (updatedSim.status === 'failed') {
            toast.error('La simulation a échoué')
          }
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }

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
      
      const result = await SimulationService.startSimulation(id)
      
      if (result.success) {
        toast.success('Simulation lancée avec succès')
        setSimulationStatus('running')
        setProgress(5)
      } else {
        throw new Error(result.message || 'Erreur inconnue')
      }
    } catch (error: any) {
      console.error('Erreur lancement simulation:', error)
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

  // Initialiser la liste des matériaux
  useEffect(() => {
    setMaterials([
      { id: 'aluminum-6061', name: 'Aluminum 6061', category: 'metal' },
      { id: 'copper', name: 'Copper', category: 'metal' },
      { id: 'stainless-304', name: 'Stainless Steel 304', category: 'metal' },
      { id: 'steel-a36', name: 'Steel A36', category: 'metal' },
      { id: 'glass', name: 'Glass', category: 'non-metal' },
      { id: 'plastic-pc', name: 'Polycarbonate', category: 'plastic' },
    ])
  }, [])

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
            <Button 
              variant="outline" 
              onClick={handleDelete} 
              disabled={isLoading || simulationStatus === 'running'}
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </Button>
          )}
          <Button 
            onClick={handleSave} 
            disabled={isLoading || simulationStatus === 'running'} 
            className="bg-primary hover:bg-primary/90"
          >
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
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    Paramètres de base
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom de la simulation</Label>
                    <Input 
                      id="name"
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      placeholder="Ex: Refroidissement tube Alu 6061" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea 
                      id="description"
                      value={description} 
                      onChange={(e) => setDescription(e.target.value)} 
                      placeholder="Détails du projet..." 
                      rows={2} 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="geometry">Géométrie</Label>
                      <Select value={geometryType} onValueChange={setGeometryType}>
                        <SelectTrigger id="geometry">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tube">Tube</SelectItem>
                          <SelectItem value="plate">Plaque</SelectItem>
                          <SelectItem value="coil">Serpentin</SelectItem>
                          <SelectItem value="custom">Custom (STL/STEP)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="material">Matériau</Label>
                      <Select value={materialId} onValueChange={setMaterialId}>
                        <SelectTrigger id="material">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {materials.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mesh">Précision / Vitesse (Moteur PINN)</Label>
                    <Select value={meshDensity} onValueChange={(v: any) => setMeshDensity(v)}>
                      <SelectTrigger id="mesh">
                        <SelectValue />
                      </SelectTrigger>
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
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Thermometer className="w-5 h-5 text-primary" /> 
                    Conditions Thermiques
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="initialTemp">Température initiale (°C)</Label>
                      <Input 
                        id="initialTemp"
                        type="number" 
                        value={initialTemp} 
                        onChange={(e) => setInitialTemp(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ambientTemp">Température ambiante (°C)</Label>
                      <Input 
                        id="ambientTemp"
                        type="number" 
                        value={ambientTemp} 
                        onChange={(e) => setAmbientTemp(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="coolingType">Type de refroidissement</Label>
                    <Select value={coolingType} onValueChange={setCoolingType}>
                      <SelectTrigger id="coolingType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="natural_convection">Convection naturelle</SelectItem>
                        <SelectItem value="forced_convection">Convection forcée</SelectItem>
                        <SelectItem value="radiation">Radiation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="convectionCoeff">Coefficient de convection (W/m²·K)</Label>
                    <Input 
                      id="convectionCoeff"
                      type="number" 
                      value={convectionCoeff} 
                      onChange={(e) => setConvectionCoeff(e.target.value)} 
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fluid" className="mt-4">
              <Card className="border-border bg-card/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wind className="w-5 h-5 text-secondary" /> 
                    Dynamique Fluide
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fluidType">Fluide</Label>
                    <Select value={fluidType} onValueChange={setFluidType}>
                      <SelectTrigger id="fluidType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="air">Air</SelectItem>
                        <SelectItem value="water">Eau</SelectItem>
                        <SelectItem value="oil">Huile industrielle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fluidVelocity">Vitesse du fluide (m/s)</Label>
                    <Input 
                      id="fluidVelocity"
                      type="number" 
                      step="0.1" 
                      value={fluidVelocity} 
                      onChange={(e) => setFluidVelocity(e.target.value)} 
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Statut de la Simulation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SimulationStatus status={simulationStatus} progress={progress} />
              <Separator className="bg-primary/10" />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Actions</h4>
                <Button 
                  className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20" 
                  onClick={handleRunSimulation}
                  disabled={isLoading || !id || simulationStatus === 'running'}
                >
                  {simulationStatus === 'running' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {simulationStatus === 'running' ? 'Simulation en cours...' : 'Lancer la Simulation'}
                </Button>
                {simulationStatus === 'completed' && id && (
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={async () => {
                      try {
                        const results = await SimulationService.getSimulationResults(id)
                        console.log('Résultats:', results)
                        toast.success('Résultats téléchargés')
                      } catch (error: any) {
                        toast.error(`Erreur: ${error.message}`)
                      }
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" /> 
                    Télécharger les résultats
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Moteur IA VoltFlow</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                Physics-Informed Neural Networks (PINNs)
              </p>
              <p className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                Résolution couplage convection / conduction
              </p>
              <p className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                Surveillance de convergence en temps réel
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
