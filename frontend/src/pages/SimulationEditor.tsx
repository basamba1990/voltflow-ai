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
  Thermometer
} from 'lucide-react'

export default function SimulationEditor() {
  const [, setLocation] = useLocation()
  const { id } = useParams<{ id: string }>()
  const { simulation, progress, status } = useSimulationRealtime(id)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [geometryType, setGeometryType] = useState<'tube' | 'plate' | 'coil' | 'custom'>('tube')
  const [materialId, setMaterialId] = useState('')
  const [meshDensity, setMeshDensity] = useState<'low' | 'medium' | 'high'>('medium')
  const [isLoading, setIsLoading] = useState(false)
  const [materials, setMaterials] = useState<Array<{ id: string; name: string; category: string }>>([])

  // Charger les matériaux disponibles
  useEffect(() => {
    const loadMaterials = async () => {
      // Ici vous devriez charger depuis votre API
      setMaterials([
        { id: '1', name: 'Aluminum 6061', category: 'metal' },
        { id: '2', name: 'Copper', category: 'metal' },
        { id: '3', name: 'Stainless Steel 304', category: 'metal' },
      ])
    }
    loadMaterials()
  }, [])

  // Charger les données de la simulation si ID présent
  useEffect(() => {
    if (id && simulation) {
      setName(simulation.name)
      setDescription(simulation.description || '')
      setGeometryType(simulation.geometry_type)
      setMaterialId(simulation.material_id || '')
      setMeshDensity(simulation.mesh_density)
    }
  }, [id, simulation])

  const handleSave = async () => {
    try {
      setIsLoading(true)
      
      if (id) {
        // Mettre à jour la simulation existante
        // Implémentez la mise à jour selon votre API
        toast.success('Simulation updated')
      } else {
        // Créer une nouvelle simulation
        const newSim = await SimulationService.createSimulation({
          name,
          description,
          geometryType,
          config: {
            geometry_config: { type: geometryType },
            boundary_conditions: {},
            material_id: materialId,
            mesh_density: meshDensity
          }
        })
        
        setLocation(`/simulation/${newSim.id}`)
        toast.success('Simulation created')
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRunSimulation = async () => {
    if (!id) {
      toast.error('Please save the simulation first')
      return
    }

    try {
      setIsLoading(true)
      toast.info('Starting simulation...')
      
      await SimulationService.startSimulation(id)
      toast.success('Simulation started successfully')
    } catch (error: any) {
      toast.error(`Failed to start simulation: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUploadGeometry = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !id) return

    try {
      setIsLoading(true)
      toast.info('Uploading geometry file...')
      
      const result = await SimulationService.uploadGeometry(file, id)
      
      toast.success(`File uploaded: ${result.fileName}`)
      // Réinitialiser l'input
      event.target.value = ''
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadResults = async () => {
    if (!id) return

    try {
      setIsLoading(true)
      const results = await SimulationService.getSimulationResults(id)
      
      // Créer un blob JSON pour le téléchargement
      const blob = new Blob([JSON.stringify(results, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `simulation-results-${id}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success('Results downloaded')
    } catch (error: any) {
      toast.error(`Download failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {id ? 'Edit Simulation' : 'New Simulation'}
          </h1>
          <p className="text-muted-foreground">
            Configure and run thermal simulations
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {id && status !== 'running' && (
            <Button
              variant="outline"
              onClick={() => SimulationService.cancelSimulation(id)}
              disabled={isLoading}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          )}
          
          <Button
            onClick={handleSave}
            disabled={isLoading}
          >
            <Save className="w-4 h-4 mr-2" />
            {id ? 'Update' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Simulation Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Simulation Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter simulation name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your simulation..."
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="geometry-type">Geometry Type</Label>
                  <Select
                    value={geometryType}
                    onValueChange={(value: any) => setGeometryType(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tube">Tube</SelectItem>
                      <SelectItem value="plate">Plate</SelectItem>
                      <SelectItem value="coil">Coil</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="material">Material</Label>
                  <Select
                    value={materialId}
                    onValueChange={setMaterialId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((material) => (
                        <SelectItem key={material.id} value={material.id}>
                          {material.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="mesh-density">Mesh Density</Label>
                <Select
                  value={meshDensity}
                  onValueChange={(value: any) => setMeshDensity(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (Fast)</SelectItem>
                    <SelectItem value="medium">Medium (Balanced)</SelectItem>
                    <SelectItem value="high">High (Accurate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {id && (
            <Card>
              <CardHeader>
                <CardTitle>Geometry Upload</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload your geometry file (STL, STEP, OBJ, IGES)
                  </p>
                  <Input
                    type="file"
                    accept=".stl,.step,.stp,.obj,.iges,.igs"
                    onChange={handleUploadGeometry}
                    disabled={isLoading}
                    className="mx-auto max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground mt-4">
                    Maximum file size: 50MB
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Status and Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Simulation Status</CardTitle>
            </CardHeader>
            <CardContent>
              {id ? (
                <SimulationStatus
                  progress={progress}
                  status={status}
                  estimatedDuration={30}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Save the simulation to see status
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={handleRunSimulation}
                disabled={!id || isLoading || status === 'running'}
              >
                <Play className="w-4 h-4 mr-2" />
                Run Simulation
              </Button>
              
              {id && status === 'completed' && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDownloadResults}
                  disabled={isLoading}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Results
                </Button>
              )}
              
              <Separator />
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="flex items-center">
                  <Settings className="w-3 h-3 mr-2" />
                  Uses Physics-Informed Neural Networks
                </p>
                <p className="flex items-center">
                  <BarChart3 className="w-3 h-3 mr-2" />
                  Real-time convergence monitoring
                </p>
                <p className="flex items-center">
                  <Thermometer className="w-3 h-3 mr-2" />
                  Thermal and fluid dynamics analysis
                </p>
              </div>
            </CardContent>
          </Card>

          {id && (
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => setLocation('/dashboard')}
                >
                  Back to Dashboard
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    // Ajouter une fonction de duplication
                  }}
                >
                  Duplicate Simulation
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Tabs for additional sections */}
      {id && status === 'completed' && (
        <Card>
          <CardHeader>
            <CardTitle>Results Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="temperature">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="temperature">Temperature</TabsTrigger>
                <TabsTrigger value="pressure">Pressure</TabsTrigger>
                <TabsTrigger value="efficiency">Efficiency</TabsTrigger>
              </TabsList>
              
              <TabsContent value="temperature" className="space-y-4">
                <div className="h-64 bg-card border rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">Temperature distribution visualization will appear here</p>
                </div>
              </TabsContent>
              
              <TabsContent value="pressure" className="space-y-4">
                <div className="h-64 bg-card border rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">Pressure drop analysis will appear here</p>
                </div>
              </TabsContent>
              
              <TabsContent value="efficiency" className="space-y-4">
                <div className="h-64 bg-card border rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">Thermal efficiency metrics will appear here</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
