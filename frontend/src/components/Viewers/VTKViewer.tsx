import React, { useEffect, useRef, useState, useCallback, useMemo, useReducer } from 'react';
import { Loader2, Maximize2, Minimize2, Eye, EyeOff, Box, Settings, Thermometer, Grid3x3 } from 'lucide-react';

// Types pour les simulations industrielles
export type IndustrialFieldType = 
  | 'temperature' 
  | 'pressure' 
  | 'velocity' 
  | 'stress'
  | 'strain' 
  | 'displacement'
  | 'heat_flux'
  | 'vorticity'
  | 'turbulence'
  | 'scalar'
  | 'vector'
  | 'tensor'
  | 'residual'
  | 'error'
  | 'safety_factor'
  | 'fatigue'
  | 'wear';

export type IndustrialMaterial = 
  | 'steel' 
  | 'aluminum' 
  | 'titanium' 
  | 'composite'
  | 'ceramic' 
  | 'polymer' 
  | 'fluid' 
  | 'gas';

export type SimulationEngine = 
  | 'ansys' 
  | 'openfoam' 
  | 'comsol' 
  | 'abaqus'
  | 'starccm' 
  | 'fluent' 
  | 'cfx' 
  | 'pinn'
  | 'custom';

export type UnitSystem = 'si' | 'imperial' | 'metric' | 'cgs';
export type ColorMap = 'heat' | 'coolwarm' | 'rainbow' | 'viridis' | 'plasma' | 'inferno';

export interface IndustrialField {
  id: string;
  name: string;
  type: IndustrialFieldType;
  values: Float32Array | number[];
  units: string;
  min: number;
  max: number;
  component?: 'x' | 'y' | 'z' | 'magnitude';
  // Métadonnées industrielles
  timestamp?: string;
  iteration?: number;
  convergence?: number;
  quality?: number;
  // Matériaux et propriétés
  material?: IndustrialMaterial;
  youngs_modulus?: number;
  poisson_ratio?: number;
  density?: number;
  thermal_conductivity?: number;
  // Pour les simulations CFD
  reynolds?: number;
  mach?: number;
  prandtl?: number;
  // Pour les simulations FEA
  safety_factor_min?: number;
  safety_factor_max?: number;
  // Métriques de qualité
  mesh_quality?: {
    aspect_ratio: number;
    skewness: number;
    orthogonal_quality: number;
    volume_ratio: number;
  };
}

export interface IndustrialSlice {
  id: string;
  name: string;
  position: [number, number, number];
  normal: [number, number, number];
  color: string;
  opacity: number;
  visible: boolean;
  thickness: number;
  interpolation: 'nearest' | 'linear' | 'cubic';
  // Pour les rapports
  show_in_report: boolean;
  annotations: {
    min: boolean;
    max: boolean;
    mean: boolean;
    std: boolean;
  };
}

export interface IndustrialLegend {
  type: 'scientific' | 'engineering' | 'logarithmic' | 'safety';
  min: number;
  max: number;
  num_ticks: number;
  format: string;
  units: string;
  color_map: ColorMap;
  show_gradient: boolean;
  show_values: boolean;
  show_units: boolean;
  // Pour les facteurs de sécurité
  safety_thresholds?: {
    critical: number;
    warning: number;
    safe: number;
  };
}

export interface ValidationMetrics {
  rms_error: number;
  max_error: number;
  mean_error: number;
  correlation: number;
  r_squared: number;
  confidence_interval: [number, number];
  // Pour les critères industriels
  meets_spec: boolean;
  tolerance: number;
  standards: string[];
}

export interface IndustrialMesh {
  vertices: number;
  faces: number;
  cells: number;
  type: 'tetra' | 'hexa' | 'poly' | 'mixed';
  quality: {
    min_jacobian: number;
    max_skewness: number;
    avg_aspect_ratio: number;
    orthogonality: number;
  };
  boundaries: Array<{
    name: string;
    type: 'wall' | 'inlet' | 'outlet' | 'symmetry' | 'periodic';
    faces: number;
  }>;
}

export interface IndustrialConfig {
  // Performance
  max_memory_mb: number;
  target_fps: number;
  lod_enabled: boolean;
  compression: boolean;
  
  // Visualisation
  default_view: 'isometric' | 'front' | 'top' | 'side' | 'custom';
  lighting: 'standard' | 'studio' | 'engineering';
  background: 'dark' | 'light' | 'gradient' | 'transparent';
  
  // Export
  export_formats: ['png', 'pdf', 'stl', 'vtk', 'csv'];
  report_template: string;
  annotations: boolean;
  
  // Unités
  unit_system: UnitSystem;
  precision: number;
  
  // Sécurité
  watermark: boolean;
  proprietary: boolean;
}

interface IndustrialVTKViewerProps {
  // Données
  mesh: {
    url: string;
    type: 'vtp' | 'vti' | 'stl' | 'obj';
    metadata?: IndustrialMesh;
  };
  
  fields: IndustrialField[];
  active_field_id?: string;
  
  // Configuration
  config?: Partial<IndustrialConfig>;
  slices?: IndustrialSlice[];
  legend?: IndustrialLegend;
  
  // Simulation
  simulation?: {
    engine: SimulationEngine;
    case_name: string;
    version: string;
    timestamp: string;
  };
  
  // Validation
  reference_data?: IndustrialField;
  validation?: ValidationMetrics;
  
  // Callbacks industriels
  onPointSelected?: (data: {
    position: [number, number, number];
    field_values: Record<string, number>;
    distance_to_boundary?: number;
    element_id?: number;
  }) => void;
  
  onSliceAnalyzed?: (slice: IndustrialSlice, statistics: {
    min: number; max: number; mean: number; std: number;
    p95: number; p99: number; rms: number;
    area: number; perimeter: number;
  }) => void;
  
  onFieldRangeUpdated?: (field_id: string, min: number, max: number) => void;
  
  onExportRequested?: (format: string, options: any) => Promise<Blob>;
  
  // UI
  show_controls?: boolean;
  show_stats?: boolean;
  show_annotations?: boolean;
  show_coordinates?: boolean;
  
  // Performance
  decimation_factor?: number;
  progressive_loading?: boolean;
  
  // Classe CSS
  className?: string;
}

// Import dynamique pour éviter les problèmes de build
const loadVTK = async () => {
  const vtk = await import('@kitware/vtk.js');
  return vtk;
};

// Palettes de couleurs industrielles
const INDUSTRIAL_COLOR_MAPS: Record<ColorMap, number[][]> = {
  // Pour la température
  heat: [
    [0, 0, 0],       // Noir (froid)
    [0.5, 0, 0],     // Rouge foncé
    [1, 0, 0],       // Rouge
    [1, 0.5, 0],     // Orange
    [1, 1, 0],       // Jaune
    [1, 1, 1]        // Blanc (chaud)
  ],
  // Pour les contraintes
  coolwarm: [
    [0.23, 0.299, 0.754],  // Bleu froid
    [0.865, 0.865, 0.865], // Gris neutre
    [0.706, 0.016, 0.15]   // Rouge chaud
  ],
  // Pour les facteurs de sécurité
  rainbow: [
    [0, 0, 1],       // Bleu
    [0, 1, 1],       // Cyan
    [0, 1, 0],       // Vert
    [1, 1, 0],       // Jaune
    [1, 0.5, 0],     // Orange
    [1, 0, 0]        // Rouge
  ],
  viridis: [
    [0.267, 0.005, 0.329],
    [0.283, 0.141, 0.458],
    [0.263, 0.275, 0.545],
    [0.227, 0.382, 0.566],
    [0.192, 0.483, 0.557],
    [0.165, 0.576, 0.53],
    [0.153, 0.663, 0.482],
    [0.18, 0.744, 0.415],
    [0.337, 0.816, 0.324],
    [0.619, 0.873, 0.262],
    [0.851, 0.913, 0.306]
  ],
  plasma: [
    [0.05, 0.03, 0.53],
    [0.31, 0, 0.61],
    [0.56, 0, 0.58],
    [0.78, 0.09, 0.48],
    [0.94, 0.25, 0.33],
    [0.99, 0.44, 0.18],
    [0.94, 0.64, 0.09],
    [0.82, 0.84, 0.15]
  ],
  inferno: [
    [0, 0, 0.4],
    [0.12, 0.07, 0.58],
    [0.3, 0.11, 0.64],
    [0.48, 0.14, 0.64],
    [0.65, 0.15, 0.61],
    [0.81, 0.18, 0.52],
    [0.93, 0.25, 0.41],
    [0.99, 0.38, 0.3],
    [0.99, 0.55, 0.22],
    [0.99, 0.75, 0.18],
    [0.99, 0.93, 0.37]
  ]
};

// Composant principal
export const IndustrialVTKViewer: React.FC<IndustrialVTKViewerProps> = ({
  mesh,
  fields = [],
  active_field_id,
  config = {},
  slices = [],
  legend,
  simulation,
  reference_data,
  validation,
  onPointSelected,
  onSliceAnalyzed,
  onFieldRangeUpdated,
  onExportRequested,
  show_controls = true,
  show_stats = true,
  show_annotations = true,
  show_coordinates = true,
  decimation_factor = 0.3,
  progressive_loading = true,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<any>(null);
  const vtkRef = useRef<any>(null);
  
  const [state, setState] = useState({
    isLoading: true,
    error: null as string | null,
    progress: 0,
    isFullscreen: false,
    activeField: null as IndustrialField | null,
    selectedPoint: null as {
      position: [number, number, number];
      field_values: Record<string, number>;
      element_id?: number;
    } | null,
    performance: {
      fps: 0,
      triangles: 0,
      memory: 0,
      renderTime: 0,
    },
    viewSettings: {
      showGrid: config.showGrid ?? true,
      showAxes: config.showAxes ?? true,
      showLegend: config.showLegend ?? true,
      colorMap: config.colorMap ?? 'heat' as ColorMap,
      opacity: config.opacity ?? 0.8,
      viewMode: 'volume' as 'volume' | 'slice' | 'wireframe' | 'point_cloud',
      backgroundColor: config.backgroundColor ?? [0.05, 0.05, 0.08],
      lighting: config.lighting ?? 'engineering',
    },
  });

  // Champ actif
  const activeField = useMemo(() => {
    if (active_field_id) {
      return fields.find(f => f.id === active_field_id) || fields[0];
    }
    return fields[0];
  }, [fields, active_field_id]);

  // Configuration par défaut
  const defaultConfig: IndustrialConfig = useMemo(() => ({
    max_memory_mb: 2048,
    target_fps: 60,
    lod_enabled: true,
    compression: true,
    default_view: 'isometric',
    lighting: 'engineering',
    background: 'dark',
    export_formats: ['png', 'pdf', 'stl', 'vtk', 'csv'],
    report_template: 'industrial',
    annotations: true,
    unit_system: 'si',
    precision: 4,
    watermark: false,
    proprietary: true,
    ...config,
  }), [config]);

  // Formatage des valeurs
  const formatValue = useCallback((value: number, field?: IndustrialField): string => {
    if (!field) return value.toPrecision(defaultConfig.precision);
    
    const unit = field.units;
    let formatted = value;
    
    // Conversion d'unités si nécessaire
    if (defaultConfig.unit_system === 'imperial' && unit === 'm') {
      formatted = value * 3.28084; // m -> ft
    }
    
    // Format selon la précision
    if (Math.abs(formatted) < 0.001 || Math.abs(formatted) > 10000) {
      return `${formatted.toExponential(defaultConfig.precision - 1)} ${unit}`;
    }
    
    return `${formatted.toFixed(defaultConfig.precision)} ${unit}`;
  }, [defaultConfig]);

  // Initialisation du renderer VTK
  const initializeVTKRenderer = useCallback(async () => {
    if (!containerRef.current || !mesh.url) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    let cleanupFunctions: Array<() => void> = [];
    
    try {
      // Charger VTK dynamiquement
      const vtk = await loadVTK();
      vtkRef.current = vtk;
      setState(prev => ({ ...prev, progress: 30 }));
      
      // Créer la fenêtre de rendu
      const fullScreenRenderer = vtk.Rendering.Misc.FullScreenRenderWindow.newInstance({
        container: containerRef.current,
        background: [0.05, 0.05, 0.08],
        listenWindowResize: true,
      });
      
      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();
      const interactor = fullScreenRenderer.getInteractor();
      
      renderWindowRef.current = renderWindow;
      
      // Configuration avancée du renderer
      renderer.setTwoSidedLighting(true);
      renderer.setUseDepthPeeling(true);
      renderer.setMaximumNumberOfPeels(4);
      
      // Style d'interaction
      const interactorStyle = vtk.Interaction.Style.InteractorStyleTrackballCamera.newInstance();
      interactor.setInteractorStyle(interactorStyle);
      
      // Widget d'orientation
      const axes = vtk.Rendering.Core.AnnotatedCubeActor.newInstance();
      axes.setDefaultStyle({
        'X+': { faceColor: '#ff0000', faceRotation: 0 },
        'X-': { faceColor: '#800000', faceRotation: 0 },
        'Y+': { faceColor: '#00ff00', faceRotation: 90 },
        'Y-': { faceColor: '#008000', faceRotation: 90 },
        'Z+': { faceColor: '#0000ff', faceRotation: 0 },
        'Z-': { faceColor: '#000080', faceRotation: 0 },
      });
      
      const orientationWidget = vtk.Interaction.Widgets.OrientationMarkerWidget.newInstance({
        actor: axes,
        interactor: interactor,
      });
      orientationWidget.setEnabled(true);
      orientationWidget.setViewportCorner(vtk.Interaction.Widgets.OrientationMarkerWidget.Corners.BOTTOM_LEFT);
      orientationWidget.setViewportSize(0.15);
      
      // Charger le maillage
      setState(prev => ({ ...prev, progress: 50 }));
      let reader;
      
      switch (mesh.type) {
        case 'vti':
          reader = vtk.IO.XML.XMLImageDataReader.newInstance();
          break;
        case 'stl':
          reader = vtk.IO.Geometry.STLReader.newInstance();
          break;
        case 'obj':
          reader = vtk.IO.Geometry.OBJReader.newInstance();
          break;
        default:
          reader = vtk.IO.XML.XMLPolyDataReader.newInstance();
      }
      
      await reader.setUrl(mesh.url);
      const meshData = reader.getOutputData();
      
      // Créer le contour du domaine
      const outlineFilter = vtk.Filters.Core.OutlineFilter.newInstance();
      outlineFilter.setInputData(meshData);
      
      const outlineMapper = vtk.Rendering.Core.Mapper.newInstance();
      outlineMapper.setInputConnection(outlineFilter.getOutputPort());
      
      const outlineActor = vtk.Rendering.Core.Actor.newInstance();
      outlineActor.setMapper(outlineMapper);
      outlineActor.getProperty().setColor(0.7, 0.7, 0.7);
      outlineActor.getProperty().setLineWidth(1);
      outlineActor.getProperty().setOpacity(0.3);
      
      renderer.addActor(outlineActor);
      cleanupFunctions.push(() => renderer.removeActor(outlineActor));
      
      // Appliquer les champs de données
      if (activeField) {
        setState(prev => ({ ...prev, progress: 70 }));
        
        // Créer le tableau de données
        const values = activeField.values instanceof Float32Array 
          ? activeField.values 
          : new Float32Array(activeField.values);
        
        const dataArray = vtk.Common.Core.DataArray.newInstance({
          numberOfComponents: 1,
          values: values,
          name: activeField.name,
        });
        
        // Appliquer au maillage
        const pointData = meshData.getPointData();
        pointData.setScalars(dataArray);
        
        // Créer le mapper
        const mapper = vtk.Rendering.Core.Mapper.newInstance();
        mapper.setInputData(meshData);
        mapper.setScalarVisibility(true);
        mapper.setScalarRange(activeField.min, activeField.max);
        
        // Table de couleurs adaptative
        const lut = vtk.Rendering.Core.ColorTransferFunction.newInstance();
        const colorMapName = legend?.color_map || 
          (activeField.type === 'temperature' ? 'heat' :
           activeField.type === 'stress' ? 'coolwarm' :
           activeField.type === 'safety_factor' ? 'rainbow' : 'viridis');
        
        const colorMap = INDUSTRIAL_COLOR_MAPS[colorMapName];
        
        colorMap.forEach((color, index) => {
          const t = index / (colorMap.length - 1);
          const value = activeField.min + t * (activeField.max - activeField.min);
          lut.addRGBPoint(value, color[0], color[1], color[2]);
        });
        
        mapper.setLookupTable(lut);
        
        // Créer l'acteur
        const actor = vtk.Rendering.Core.Actor.newInstance();
        actor.setMapper(mapper);
        
        // Propriétés matérielles selon le type de champ
        const property = actor.getProperty();
        switch (activeField.material) {
          case 'steel':
            property.setAmbient(0.1);
            property.setDiffuse(0.6);
            property.setSpecular(0.3);
            property.setSpecularPower(20);
            property.setOpacity(1.0);
            break;
          case 'aluminum':
            property.setAmbient(0.1);
            property.setDiffuse(0.7);
            property.setSpecular(0.4);
            property.setSpecularPower(30);
            property.setOpacity(0.9);
            break;
          case 'fluid':
            property.setAmbient(0.0);
            property.setDiffuse(0.5);
            property.setSpecular(0.5);
            property.setSpecularPower(50);
            property.setOpacity(0.7);
            break;
          default:
            property.setAmbient(0.1);
            property.setDiffuse(0.7);
            property.setSpecular(0.2);
            property.setSpecularPower(10);
        }
        
        // Gérer le mode d'affichage
        switch (state.viewSettings.viewMode) {
          case 'wireframe':
            property.setRepresentationToWireframe();
            property.setLineWidth(1);
            break;
          case 'point_cloud':
            property.setRepresentationToPoints();
            property.setPointSize(2);
            break;
          default:
            property.setRepresentationToSurface();
        }
        
        // Ajouter au renderer
        renderer.addActor(actor);
        
        // Barre de couleur
        if (state.viewSettings.showLegend) {
          const scalarBar = vtk.Rendering.Core.ScalarBarActor.newInstance();
          scalarBar.setLookupTable(lut);
          scalarBar.setTitle(`${activeField.name} (${activeField.units})`);
          scalarBar.setNumberOfLabels(legend?.num_ticks || 5);
          scalarBar.setMaximumNumberOfColors(256);
          scalarBar.setWidth(0.08);
          scalarBar.setHeight(0.4);
          scalarBar.setPosition(0.02, 0.6);
          
          renderer.addActor2D(scalarBar);
        }
        
        // Picking industriel
        if (onPointSelected) {
          const picker = vtk.Rendering.Core.PointPicker.newInstance();
          picker.setTolerance(0.01);
          
          interactor.onLeftButtonPress(() => {
            const pos = interactor.getEventPosition();
            picker.pick(pos[0], pos[1], 0, renderer);
            const point = picker.getPickPosition();
            const pointId = picker.getPointId();
            
            if (pointId >= 0 && point) {
              const fieldValues: Record<string, number> = {};
              fields.forEach(field => {
                if (field.values[pointId] !== undefined) {
                  fieldValues[field.name] = field.values[pointId];
                }
              });
              
              onPointSelected({
                position: [point[0], point[1], point[2]],
                field_values: fieldValues,
                element_id: pointId,
              });
              
              setState(prev => ({ 
                ...prev, 
                selectedPoint: { position: [point[0], point[1], point[2]], field_values: fieldValues, element_id: pointId } 
              }));
            }
          });
        }
      }
      
      // Configuration de la caméra
      const camera = renderer.getActiveCamera();
      const bounds = meshData.getBounds();
      const center = [
        (bounds[1] + bounds[0]) / 2,
        (bounds[3] + bounds[2]) / 2,
        (bounds[5] + bounds[4]) / 2,
      ];
      
      const diag = Math.sqrt(
        Math.pow(bounds[1] - bounds[0], 2) +
        Math.pow(bounds[3] - bounds[2], 2) +
        Math.pow(bounds[5] - bounds[4], 2)
      );
      
      camera.setPosition(
        center[0] + diag * 0.7,
        center[1] + diag * 0.7,
        center[2] + diag * 0.7
      );
      camera.setFocalPoint(center[0], center[1], center[2]);
      camera.setViewUp(0, 0, 1);
      camera.setClippingRange(diag * 0.01, diag * 10);
      
      // Rendu initial
      renderWindow.render();
      
      // Surveillance des performances
      let frameCount = 0;
      let lastCheck = performance.now();
      
      const updatePerformance = () => {
        const now = performance.now();
        frameCount++;
        
        if (now - lastCheck >= 1000) {
          const fps = Math.round((frameCount * 1000) / (now - lastCheck));
          const memory = performance.memory 
            ? performance.memory.usedJSHeapSize / 1024 / 1024 
            : 0;
          
          setState(prev => ({
            ...prev,
            performance: { 
              ...prev.performance, 
              fps, 
              memory: Math.round(memory),
              triangles: meshData.getNumberOfCells?.() || 0
            }
          }));
          
          frameCount = 0;
          lastCheck = now;
        }
        
        requestAnimationFrame(updatePerformance);
      };
      
      requestAnimationFrame(updatePerformance);
      
      // Redimensionnement
      const handleResize = () => {
        if (renderWindow) {
          renderWindow.resize();
          renderWindow.render();
        }
      };
      
      window.addEventListener('resize', handleResize);
      cleanupFunctions.push(() => window.removeEventListener('resize', handleResize));
      
      // Nettoyage
      cleanupFunctions.push(() => {
        if (fullScreenRenderer) {
          fullScreenRenderer.delete();
        }
        orientationWidget.setEnabled(false);
        cancelAnimationFrame(updatePerformance);
      });
      
      setState(prev => ({ 
        ...prev, 
        progress: 100,
        isLoading: false 
      }));
      
      return () => {
        cleanupFunctions.forEach(fn => fn());
      };
      
    } catch (error: any) {
      console.error('Failed to initialize VTK:', error);
      setState(prev => ({ 
        ...prev, 
        error: `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLoading: false 
      }));
      return () => {};
    }
  }, [mesh.url, mesh.type, fields, activeField, legend, onPointSelected, state.viewSettings]);
  
  // Gestion du plein écran
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
      setState(prev => ({ ...prev, isFullscreen: true }));
    } else {
      document.exitFullscreen?.();
      setState(prev => ({ ...prev, isFullscreen: false }));
    }
  }, []);
  
  // Mise à jour des paramètres de vue
  const updateViewSettings = useCallback((settings: Partial<typeof state.viewSettings>) => {
    setState(prev => ({
      ...prev,
      viewSettings: { ...prev.viewSettings, ...settings },
    }));
  }, []);
  
  // Export de données
  const handleExport = useCallback(async (format: string) => {
    if (!renderWindowRef.current || !onExportRequested) return;
    
    try {
      setState(prev => ({ 
        ...prev, 
        progress: 0,
        isLoading: true 
      }));
      
      const options = {
        format,
        resolution: 300,
        include_annotations: show_annotations,
        include_legend: true,
        timestamp: new Date().toISOString(),
      };
      
      const blob = await onExportRequested(format, options);
      
      // Téléchargement
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      
      setState(prev => ({ 
        ...prev, 
        progress: 100,
        isLoading: false 
      }));
      
    } catch (error) {
      console.error('Export failed:', error);
      setState(prev => ({ 
        ...prev, 
        error: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLoading: false 
      }));
    }
  }, [onExportRequested, show_annotations]);
  
  // Initialisation
  useEffect(() => {
    const cleanup = initializeVTKRenderer();
    return () => {
      cleanup.then(fn => fn?.());
    };
  }, [initializeVTKRenderer]);
  
  // Fonctions utilitaires
  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255,
    ] : [1, 1, 1];
  };
  
  // Interface utilisateur industrielle
  const renderIndustrialControls = () => (
    <div className="absolute top-4 left-4 bg-gray-900/95 backdrop-blur-sm rounded-xl p-4 text-sm text-gray-200 shadow-2xl border border-gray-700/50 w-80">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <div className="font-bold text-lg">Industrial Viewer</div>
        </div>
        {simulation && (
          <div className="text-xs px-2 py-1 bg-blue-900/50 rounded">
            {simulation.engine}
          </div>
        )}
      </div>
      
      {/* Sélection de champ */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">Active Field</div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {fields.map((field) => (
            <div
              key={field.id}
              className={`p-2 rounded cursor-pointer transition-all ${
                activeField?.id === field.id 
                  ? 'bg-blue-900/50 border border-blue-700' 
                  : 'hover:bg-gray-800/50'
              }`}
              onClick={() => onFieldRangeUpdated?.(field.id, field.min, field.max)}
            >
              <div className="flex justify-between items-center">
                <div className="font-medium">{field.name}</div>
                <div className={`text-xs px-2 py-1 rounded ${
                  field.type === 'temperature' ? 'bg-red-900/50' :
                  field.type === 'stress' ? 'bg-orange-900/50' :
                  field.type === 'safety_factor' ? 'bg-green-900/50' :
                  'bg-gray-800'
                }`}>
                  {field.type}
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Range: {formatValue(field.min, field)} - {formatValue(field.max, field)}</span>
                {field.material && (
                  <span className="text-gray-500">{field.material}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Mode de visualisation */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">View Mode</div>
        <div className="flex gap-2">
          {(['volume', 'wireframe', 'point_cloud'] as const).map((mode) => (
            <button
              key={mode}
              className={`flex-1 px-3 py-2 text-xs rounded transition-all ${
                state.viewSettings.viewMode === mode 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => updateViewSettings({ viewMode: mode })}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Métriques de performance */}
      <div className="mb-4 p-3 bg-gray-800/30 rounded border border-gray-700">
        <div className="text-xs text-gray-400 mb-2">Performance</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span>FPS:</span>
            <span className="font-mono">{state.performance.fps}</span>
          </div>
          <div className="flex justify-between">
            <span>Memory:</span>
            <span className="font-mono">{state.performance.memory} MB</span>
          </div>
          <div className="flex justify-between">
            <span>Triangles:</span>
            <span className="font-mono">
              {state.performance.triangles.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Render:</span>
            <span className="font-mono">
              {state.performance.renderTime.toFixed(1)}ms
            </span>
          </div>
        </div>
      </div>
      
      {/* Boutons d'export */}
      {onExportRequested && (
        <div className="mb-4">
          <div className="text-xs text-gray-400 mb-2">Export</div>
          <div className="flex flex-wrap gap-2">
            {defaultConfig.export_formats.map((format) => (
              <button
                key={format}
                className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                onClick={() => handleExport(format)}
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Métriques de validation */}
      {validation && (
        <div className="p-3 bg-gray-800/30 rounded border border-gray-700">
          <div className="text-xs text-gray-400 mb-2">Validation</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>RMS Error:</span>
              <span className={validation.meets_spec ? 'text-green-400' : 'text-red-400'}>
                {validation.rms_error.toExponential(3)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Max Error:</span>
              <span>{validation.max_error.toExponential(3)}</span>
            </div>
            <div className="flex justify-between">
              <span>R²:</span>
              <span>{validation.r_squared.toFixed(3)}</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span>Spec:</span>
              <div className={`px-2 py-1 rounded text-xs ${
                validation.meets_spec 
                  ? 'bg-green-900/50 text-green-300' 
                  : 'bg-red-900/50 text-red-300'
              }`}>
                {validation.meets_spec ? 'PASS' : 'FAIL'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  
  // Overlay de chargement industriel
  const renderIndustrialLoading = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 z-50">
      <div className="w-96 mb-6">
        <div className="flex justify-between text-sm text-gray-300 mb-2">
          <span className="font-semibold">{state.error ? 'Error' : 'Loading...'}</span>
          <span className="text-blue-400">
            {simulation ? `${simulation.engine} ${simulation.version}` : 'Industrial Viewer'}
          </span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-green-500 transition-all duration-500 ease-out"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      </div>
      
      {simulation && (
        <div className="mb-4 text-center">
          <div className="text-xl text-gray-300 mb-2">{simulation.case_name}</div>
          <div className="text-sm text-gray-400">
            {simulation.timestamp}
          </div>
        </div>
      )}
      
      <div className="text-gray-300 text-lg mb-2">
        {state.error ? '⚠️' : '⚙️'} {state.error || 'Initializing viewer...'}
      </div>
      
      {mesh.metadata && !state.error && (
        <div className="text-sm text-gray-400 mt-4 text-center">
          <div>Mesh: {mesh.metadata.vertices.toLocaleString()} vertices</div>
          <div>Quality: {mesh.metadata.quality?.avg_aspect_ratio?.toFixed(2) || 'N/A'} aspect ratio</div>
        </div>
      )}
    </div>
  );
  
  // Overlay de coordonnées
  const renderCoordinatesOverlay = () => (
    <div className="absolute bottom-4 right-4 bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 text-xs text-gray-300">
      <div className="font-semibold mb-1">Coordinates</div>
      {state.selectedPoint ? (
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>X:</span>
            <span className="font-mono">{state.selectedPoint.position[0].toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span>Y:</span>
            <span className="font-mono">{state.selectedPoint.position[1].toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span>Z:</span>
            <span className="font-mono">{state.selectedPoint.position[2].toFixed(3)}</span>
          </div>
          {activeField && state.selectedPoint.field_values && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="text-gray-400">{activeField.name}:</div>
              <div className="font-mono text-green-300">
                {formatValue(state.selectedPoint.field_values[activeField.name], activeField)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-500">Click on model to select point</div>
      )}
    </div>
  );
  
  // Légende industrielle
  const renderIndustrialLegend = () => {
    if (!activeField || !legend) return null;
    
    return (
      <div className="absolute bottom-4 left-4 bg-gray-900/90 backdrop-blur-sm rounded-lg p-3 min-w-60">
        <div className="flex justify-between items-center mb-2">
          <div className="font-semibold">{legend.format}</div>
          <div className="text-xs px-2 py-1 bg-gray-800 rounded">
            {legend.type}
          </div>
        </div>
        
        {/* Barre de gradient */}
        <div className="h-4 w-full rounded-full overflow-hidden mb-2">
          <div 
            className="h-full"
            style={{ 
              background: `linear-gradient(to right, ${
                INDUSTRIAL_COLOR_MAPS[legend.color_map]
                  .map((color, i, arr) => 
                    `rgb(${Math.round(color[0]*255)}, ${Math.round(color[1]*255)}, ${Math.round(color[2]*255)}) ${(i/(arr.length-1))*100}%`
                  )
                  .join(', ')
              })`
            }}
          />
        </div>
        
        {/* Échelle */}
        <div className="flex justify-between text-xs text-gray-400">
          <span>{formatValue(legend.min, activeField)}</span>
          <span>{formatValue(legend.max, activeField)}</span>
        </div>
        
        {/* Seuils de sécurité */}
        {legend.safety_thresholds && (
          <div className="mt-3 pt-2 border-t border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Safety Thresholds</div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2" />
                <span>Safe: &gt; {legend.safety_thresholds.safe.toFixed(2)}</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2" />
                <span>Warning: {legend.safety_thresholds.warning.toFixed(2)} - {legend.safety_thresholds.safe.toFixed(2)}</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2" />
                <span>Critical: &lt; {legend.safety_thresholds.warning.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className={`relative w-full h-full bg-gray-900 ${className}`}>
      {/* Zone de rendu VTK */}
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Overlay de chargement */}
      {state.isLoading && renderIndustrialLoading()}
      
      {/* Contrôles industriels */}
      {show_controls && !state.isLoading && renderIndustrialControls()}
      
      {/* Légende */}
      {!state.isLoading && legend && renderIndustrialLegend()}
      
      {/* Coordonnées */}
      {show_coordinates && !state.isLoading && renderCoordinatesOverlay()}
      
      {/* Barre de statut */}
      {!state.isLoading && (
        <div className="absolute top-4 right-4 text-xs text-gray-500 bg-gray-900/70 rounded p-2">
          <div className="font-semibold mb-1">Industrial Controls</div>
          <div>• LMB: Rotate / Select</div>
          <div>• RMB: Pan</div>
          <div>• Scroll: Zoom</div>
          <div>• R: Reset camera</div>
          <div>• W: Toggle wireframe</div>
        </div>
      )}
      
      {/* Watermark */}
      {defaultConfig.watermark && !state.isLoading && (
        <div className="absolute bottom-4 right-4 text-xs text-gray-600/30 pointer-events-none">
          Industrial VTK Viewer v2.0 © {new Date().getFullYear()}
        </div>
      )}
    </div>
  );
};

export default React.memo(IndustrialVTKViewer);
