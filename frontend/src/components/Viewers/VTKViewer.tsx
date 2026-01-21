import React, { useEffect, useRef, useState, useCallback, useMemo, useReducer } from 'react';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkScalarBarActor from '@kitware/vtk.js/Rendering/Core/ScalarBarActor';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkPointPicker from '@kitware/vtk.js/Rendering/Core/PointPicker';
import vtkDecimatePro from '@kitware/vtk.js/Filters/Core/DecimatePro';
import vtkTriangleFilter from '@kitware/vtk.js/Filters/Core/TriangleFilter';
import vtkPolyDataNormals from '@kitware/vtk.js/Filters/Core/PolyDataNormals';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkLookupTable from '@kitware/vtk.js/Common/Core/LookupTable';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkCalculator from '@kitware/vtk.js/Filters/Core/Calculator';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageReslice from '@kitware/vtk.js/Imaging/Core/ImageReslice';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';
import vtkPlaneWidget from '@kitware/vtk.js/Widgets/Widgets3D/PlaneWidget';
import vtkOutlineFilter from '@kitware/vtk.js/Filters/Core/OutlineFilter';
import vtkOBJReader from '@kitware/vtk.js/IO/Geometry/OBJReader';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkSTLWriter from '@kitware/vtk.js/IO/Geometry/STLWriter';
import vtkXMLWriter from '@kitware/vtk.js/IO/XML/XMLWriter';
import vtkDistanceWidget from '@kitware/vtk.js/Widgets/Widgets3D/DistanceWidget';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';
import vtkSkybox from '@kitware/vtk.js/Rendering/Core/Skybox';
import { mat4, vec3 } from 'gl-matrix';

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
  color_map: 'rainbow' | 'heat' | 'coolwarm' | 'grayscale' | 'viridis' | 'plasma' | 'inferno';
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

// Reducer pour gérer l'état complexe
type ViewerState = {
  isLoading: boolean;
  loadingProgress: number;
  loadingStage: string;
  error: string | null;
  viewMode: 'volume' | 'slice' | 'wireframe' | 'point_cloud';
  activeSlice: string | null;
  selectedPoint: any;
  cameraState: any;
  performance: {
    fps: number;
    memory: number;
    renderTime: number;
    triangles: number;
  };
  annotations: Array<{
    id: string;
    type: 'point' | 'line' | 'area';
    data: any;
  }>;
};

type ViewerAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PROGRESS'; payload: { progress: number; stage: string } }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_VIEW_MODE'; payload: ViewerState['viewMode'] }
  | { type: 'SET_ACTIVE_SLICE'; payload: string | null }
  | { type: 'SET_SELECTED_POINT'; payload: any }
  | { type: 'SET_PERFORMANCE'; payload: Partial<ViewerState['performance']> }
  | { type: 'ADD_ANNOTATION'; payload: ViewerState['annotations'][0] }
  | { type: 'REMOVE_ANNOTATION'; payload: string };

const initialState: ViewerState = {
  isLoading: true,
  loadingProgress: 0,
  loadingStage: 'Initializing...',
  error: null,
  viewMode: 'volume',
  activeSlice: null,
  selectedPoint: null,
  cameraState: null,
  performance: {
    fps: 0,
    memory: 0,
    renderTime: 0,
    triangles: 0,
  },
  annotations: [],
};

function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_PROGRESS':
      return { 
        ...state, 
        loadingProgress: action.payload.progress,
        loadingStage: action.payload.stage 
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    case 'SET_ACTIVE_SLICE':
      return { ...state, activeSlice: action.payload };
    case 'SET_SELECTED_POINT':
      return { ...state, selectedPoint: action.payload };
    case 'SET_PERFORMANCE':
      return { 
        ...state, 
        performance: { ...state.performance, ...action.payload } 
      };
    case 'ADD_ANNOTATION':
      return { 
        ...state, 
        annotations: [...state.annotations, action.payload] 
      };
    case 'REMOVE_ANNOTATION':
      return { 
        ...state, 
        annotations: state.annotations.filter(a => a.id !== action.payload) 
      };
    default:
      return state;
  }
}

// Palettes de couleurs industrielles
const INDUSTRIAL_COLOR_MAPS = {
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
  stress: [
    [0, 0, 1],       // Bleu (compression)
    [0, 0.5, 1],     // Bleu clair
    [0, 1, 1],       // Cyan
    [0.5, 1, 0.5],   // Vert
    [1, 1, 0],       // Jaune
    [1, 0.5, 0],     // Orange
    [1, 0, 0]        // Rouge (tension)
  ],
  // Pour les facteurs de sécurité
  safety: [
    [0, 1, 0],       // Vert (sûr)
    [1, 1, 0],       // Jaune (attention)
    [1, 0.5, 0],     // Orange
    [1, 0, 0]        // Rouge (critique)
  ],
  // Pour les fluides
  fluid: [
    [0, 0.2, 0.8],   // Bleu foncé
    [0, 0.5, 0.9],   // Bleu
    [0, 0.8, 0.8],   // Turquoise
    [0.5, 0.9, 0.5], // Vert clair
    [0.9, 0.9, 0],   // Jaune
    [0.9, 0.5, 0]    // Orange
  ],
  // Générique industriel
  rainbow: [
    [0, 0, 1],       // Bleu
    [0, 1, 1],       // Cyan
    [0, 1, 0],       // Vert
    [1, 1, 0],       // Jaune
    [1, 0.5, 0],     // Orange
    [1, 0, 0]        // Rouge
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
  // Références
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const widgetManagerRef = useRef<any>(null);
  const orientationWidgetRef = useRef<any>(null);
  const animationRef = useRef<number>();
  const performanceTimerRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  
  // État avec reducer
  const [state, dispatch] = useReducer(viewerReducer, initialState);
  
  // Refs pour les données VTK
  const meshDataRef = useRef<any>(null);
  const fieldActorsRef = useRef<Map<string, any>>(new Map());
  const sliceActorsRef = useRef<Map<string, any>>(new Map());
  const outlineActorRef = useRef<any>(null);
  
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
  
  // Champ actif
  const activeField = useMemo(() => {
    if (active_field_id) {
      return fields.find(f => f.id === active_field_id) || fields[0];
    }
    return fields[0];
  }, [fields, active_field_id]);
  
  // Formatage des valeurs selon le système d'unités
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
  
  // Chargement optimisé des maillages
  const loadMesh = useCallback(async (url: string, type: string) => {
    dispatch({ 
      type: 'SET_PROGRESS', 
      payload: { progress: 10, stage: 'Loading mesh...' } 
    });
    
    try {
      let reader;
      switch (type) {
        case 'vti':
          reader = vtkXMLImageDataReader.newInstance();
          break;
        case 'stl':
          reader = vtkSTLReader.newInstance();
          break;
        case 'obj':
          reader = vtkOBJReader.newInstance();
          break;
        case 'vtp':
        default:
          reader = vtkXMLPolyDataReader.newInstance();
      }
      
      // Callback de progression
      if (reader.setProgressCallback) {
        reader.setProgressCallback((progress: number) => {
          const overallProgress = 10 + progress * 0.6;
          dispatch({
            type: 'SET_PROGRESS',
            payload: { 
              progress: Math.round(overallProgress), 
              stage: `Loading mesh... ${Math.round(progress)}%` 
            }
          });
        });
      }
      
      await reader.setUrl(url);
      const data = reader.getOutputData();
      
      // Optimisation du maillage
      if (data.isA('vtkPolyData') && decimation_factor > 0) {
        dispatch({
          type: 'SET_PROGRESS',
          payload: { progress: 75, stage: 'Optimizing mesh...' }
        });
        
        const optimized = optimizeIndustrialMesh(data, decimation_factor);
        meshDataRef.current = optimized;
        
        dispatch({
          type: 'SET_PERFORMANCE',
          payload: { triangles: optimized.getNumberOfCells() }
        });
      } else {
        meshDataRef.current = data;
      }
      
      dispatch({
        type: 'SET_PROGRESS',
        payload: { progress: 80, stage: 'Mesh loaded successfully' }
      });
      
      return data;
    } catch (error) {
      console.error('Failed to load mesh:', error);
      throw error;
    }
  }, [decimation_factor]);
  
  // Optimisation industrielle des maillages
  const optimizeIndustrialMesh = useCallback((polyData: any, reduction: number) => {
    try {
      // Conversion en triangles si nécessaire
      const triangleFilter = vtkTriangleFilter.newInstance();
      triangleFilter.setInputData(polyData);
      
      // Décimation intelligente
      const decimate = vtkDecimatePro.newInstance();
      decimate.setInputConnection(triangleFilter.getOutputPort());
      decimate.setTargetReduction(reduction);
      decimate.setPreserveTopology(true);
      decimate.setSplitting(false);
      decimate.setBoundaryVertexDeletion(false);
      decimate.setMaximumError(0.001);
      decimate.setAccumulateError(true);
      
      // Calcul des normales pour un rendu de qualité
      const normals = vtkPolyDataNormals.newInstance();
      normals.setInputConnection(decimate.getOutputPort());
      normals.setFeatureAngle(45);
      normals.setSplitting(true);
      normals.setConsistency(true);
      normals.setAutoOrientNormals(true);
      normals.setComputePointNormals(true);
      normals.setComputeCellNormals(false);
      
      normals.update();
      return normals.getOutputData();
    } catch (error) {
      console.warn('Mesh optimization failed:', error);
      return polyData;
    }
  }, []);
  
  // Initialisation du renderer VTK
  const initializeVTKRenderer = useCallback(async () => {
    if (!containerRef.current || !mesh.url) return;
    
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    
    let fullScreenRenderer: any = null;
    let cleanupFunctions: Array<() => void> = [];
    
    try {
      // Créer la fenêtre de rendu
      fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        container: containerRef.current,
        background: [0.05, 0.05, 0.08],
        listenWindowResize: true,
        renderLater: false,
      });
      
      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();
      const interactor = fullScreenRenderer.getInteractor();
      
      rendererRef.current = renderer;
      renderWindowRef.current = renderWindow;
      
      // Configuration avancée du renderer
      renderer.setTwoSidedLighting(true);
      renderer.setUseDepthPeeling(true);
      renderer.setMaximumNumberOfPeels(8);
      renderer.setOcclusionRatio(0.0);
      renderer.setUseFXAA(true); // Anti-aliasing
      
      // Éclairage industriel
      setupIndustrialLighting(renderer);
      
      // Style d'interaction
      const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();
      interactor.setInteractorStyle(interactorStyle);
      interactor.setDesiredUpdateRate(defaultConfig.target_fps);
      
      // Widget manager pour les annotations
      const widgetManager = vtkWidgetManager.newInstance();
      widgetManager.setRenderer(renderer);
      widgetManagerRef.current = widgetManager;
      
      // Widget d'orientation
      const axes = vtkAnnotatedCubeActor.newInstance();
      axes.setDefaultStyle({
        'X+': { faceColor: '#ff0000', faceRotation: 0, fontStyle: { fontColor: 'white', fontSize: 20 } },
        'X-': { faceColor: '#800000', faceRotation: 0, fontStyle: { fontColor: 'white', fontSize: 20 } },
        'Y+': { faceColor: '#00ff00', faceRotation: 90, fontStyle: { fontColor: 'white', fontSize: 20 } },
        'Y-': { faceColor: '#008000', faceRotation: 90, fontStyle: { fontColor: 'white', fontSize: 20 } },
        'Z+': { faceColor: '#0000ff', faceRotation: 0, fontStyle: { fontColor: 'white', fontSize: 20 } },
        'Z-': { faceColor: '#000080', faceRotation: 0, fontStyle: { fontColor: 'white', fontSize: 20 } },
      });
      
      const orientationWidget = vtkOrientationMarkerWidget.newInstance({
        actor: axes,
        interactor: interactor,
      });
      orientationWidget.setEnabled(true);
      orientationWidget.setViewportCorner(vtkOrientationMarkerWidget.Corners.BOTTOM_LEFT);
      orientationWidget.setViewportSize(0.15);
      orientationWidgetRef.current = orientationWidget;
      
      // Charger le maillage
      const meshData = await loadMesh(mesh.url, mesh.type);
      
      // Créer le contour du domaine
      const outlineFilter = vtkOutlineFilter.newInstance();
      outlineFilter.setInputData(meshData);
      
      const outlineMapper = vtkMapper.newInstance();
      outlineMapper.setInputConnection(outlineFilter.getOutputPort());
      
      const outlineActor = vtkActor.newInstance();
      outlineActor.setMapper(outlineMapper);
      outlineActor.getProperty().setColor(0.7, 0.7, 0.7);
      outlineActor.getProperty().setLineWidth(1);
      outlineActor.getProperty().setOpacity(0.3);
      
      renderer.addActor(outlineActor);
      outlineActorRef.current = outlineActor;
      cleanupFunctions.push(() => renderer.removeActor(outlineActor));
      
      // Appliquer les champs de données
      if (activeField) {
        await applyFieldToMesh(renderer, meshData, activeField);
      }
      
      // Configurer les slices
      if (slices.length > 0) {
        slices.forEach(slice => {
          if (slice.visible) {
            createIndustrialSlice(renderer, meshData, slice);
          }
        });
      }
      
      // Picking industriel
      const picker = vtkPointPicker.newInstance();
      picker.setTolerance(0.01);
      
      interactor.onLeftButtonPress(() => {
        const pos = interactor.getEventPosition();
        picker.pick(pos[0], pos[1], 0, renderer);
        const point = picker.getPickPosition();
        const pointId = picker.getPointId();
        
        if (pointId >= 0 && point && onPointSelected) {
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
          
          dispatch({ type: 'SET_SELECTED_POINT', payload: { point, fieldValues } });
        }
      });
      
      // Configuration de la caméra selon la vue par défaut
      setupDefaultView(renderer, meshData, defaultConfig.default_view);
      
      // Rendu initial
      renderWindow.setDesiredUpdateRate(defaultConfig.target_fps);
      renderWindow.render();
      
      // Surveillance des performances
      startPerformanceMonitoring(renderWindow);
      
      // Nettoyage
      cleanupFunctions.push(() => {
        if (fullScreenRenderer) {
          fullScreenRenderer.delete();
        }
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        if (performanceTimerRef.current) {
          clearInterval(performanceTimerRef.current);
        }
      });
      
      // Redimensionnement
      const handleResize = () => {
        if (renderWindow) {
          renderWindow.resize();
          renderWindow.render();
        }
      };
      
      window.addEventListener('resize', handleResize);
      cleanupFunctions.push(() => window.removeEventListener('resize', handleResize));
      
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 100, stage: 'Ready' } 
      });
      
      setTimeout(() => {
        dispatch({ type: 'SET_LOADING', payload: false });
      }, 500);
      
      return cleanupFunctions;
      
    } catch (error) {
      console.error('Failed to initialize VTK:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
      return [];
    }
  }, [
    mesh.url, 
    mesh.type, 
    fields, 
    activeField, 
    slices, 
    defaultConfig, 
    loadMesh, 
    onPointSelected
  ]);
  
  // Configuration de l'éclairage industriel
  const setupIndustrialLighting = useCallback((renderer: any) => {
    // Lumière principale (key light)
    renderer.addLight({
      position: [1000, 1000, 1000],
      intensity: 0.7,
      color: [1, 1, 1],
    });
    
    // Lumière de remplissage (fill light)
    renderer.addLight({
      position: [-1000, 1000, 500],
      intensity: 0.3,
      color: [1, 1, 1],
    });
    
    // Lumière dorsale (back light)
    renderer.addLight({
      position: [0, -1000, 1000],
      intensity: 0.2,
      color: [1, 1, 1],
    });
    
    // Lumière ambiante
    renderer.addLight({
      position: [0, 0, 1000],
      intensity: 0.1,
      color: [1, 1, 1],
      type: 'ambient',
    });
  }, []);
  
  // Application d'un champ au maillage
  const applyFieldToMesh = useCallback(async (
    renderer: any, 
    meshData: any, 
    field: IndustrialField
  ) => {
    dispatch({
      type: 'SET_PROGRESS',
      payload: { progress: 85, stage: `Applying ${field.name}...` }
    });
    
    try {
      // Créer le tableau de données
      const dataArray = vtkDataArray.newInstance({
        numberOfComponents: 1,
        values: field.values instanceof Float32Array 
          ? field.values 
          : new Float32Array(field.values),
        name: field.name,
      });
      
      // Appliquer au maillage
      const pointData = meshData.getPointData();
      pointData.setScalars(dataArray);
      
      // Créer le mapper
      const mapper = vtkMapper.newInstance();
      mapper.setInputData(meshData);
      mapper.setScalarVisibility(true);
      mapper.setScalarRange(field.min, field.max);
      
      // Table de couleurs adaptative
      const lut = createIndustrialColorMap(field, legend);
      mapper.setLookupTable(lut);
      
      // Créer l'acteur
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      
      // Propriétés matérielles selon le type de champ
      applyMaterialProperties(actor, field);
      
      // Gérer le mode d'affichage
      switch (state.viewMode) {
        case 'wireframe':
          actor.getProperty().setRepresentationToWireframe();
          actor.getProperty().setLineWidth(1);
          break;
        case 'point_cloud':
          actor.getProperty().setRepresentationToPoints();
          actor.getProperty().setPointSize(2);
          break;
        default:
          actor.getProperty().setRepresentationToSurface();
      }
      
      // Ajouter au renderer
      renderer.addActor(actor);
      fieldActorsRef.current.set(field.id, actor);
      
      // Barre de couleur
      const scalarBar = vtkScalarBarActor.newInstance();
      scalarBar.setLookupTable(lut);
      scalarBar.setTitle(`${field.name} (${field.units})`);
      scalarBar.setNumberOfLabels(legend?.num_ticks || 5);
      scalarBar.setMaximumNumberOfColors(256);
      scalarBar.setWidth(0.08);
      scalarBar.setHeight(0.4);
      scalarBar.setPosition(0.02, 0.6);
      
      renderer.addActor(scalarBar);
      fieldActorsRef.current.set(`${field.id}_scalar`, scalarBar);
      
      dispatch({
        type: 'SET_PROGRESS',
        payload: { progress: 90, stage: 'Field applied successfully' }
      });
      
    } catch (error) {
      console.error('Failed to apply field:', error);
      throw error;
    }
  }, [state.viewMode, legend]);
  
  // Création de table de couleurs industrielle
  const createIndustrialColorMap = useCallback((
    field: IndustrialField, 
    legendConfig?: IndustrialLegend
  ) => {
    const lut = vtkColorTransferFunction.newInstance();
    
    // Sélection de la palette
    const colorMapName = legendConfig?.color_map || 
      (field.type === 'temperature' ? 'heat' :
       field.type === 'stress' ? 'stress' :
       field.type === 'safety_factor' ? 'safety' : 'rainbow');
    
    const colorMap = INDUSTRIAL_COLOR_MAPS[colorMapName];
    
    // Application des points de couleur
    const min = field.min;
    const max = field.max;
    
    colorMap.forEach((color, index) => {
      const t = index / (colorMap.length - 1);
      const value = min + t * (max - min);
      lut.addRGBPoint(value, color[0], color[1], color[2]);
    });
    
    // Pour les échelles logarithmiques
    if (legendConfig?.type === 'logarithmic') {
      lut.setUseLogScale(true);
    }
    
    return lut;
  }, []);
  
  // Application des propriétés matérielles
  const applyMaterialProperties = useCallback((actor: any, field: IndustrialField) => {
    const property = actor.getProperty();
    
    switch (field.material) {
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
  }, []);
  
  // Création d'une slice industrielle
  const createIndustrialSlice = useCallback((
    renderer: any, 
    meshData: any, 
    slice: IndustrialSlice
  ) => {
    try {
      const plane = vtkPlane.newInstance();
      plane.setOrigin(slice.position);
      plane.setNormal(slice.normal);
      
      const cutter = vtkCutter.newInstance();
      cutter.setCutFunction(plane);
      cutter.setInputData(meshData);
      
      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(cutter.getOutputPort());
      mapper.setScalarVisibility(true);
      
      // Appliquer les données du champ actif
      if (activeField) {
        const cutData = cutter.getOutputData();
        if (cutData) {
          const dataArray = vtkDataArray.newInstance({
            numberOfComponents: 1,
            values: activeField.values instanceof Float32Array 
              ? activeField.values 
              : new Float32Array(activeField.values),
            name: activeField.name,
          });
          cutData.getPointData().setScalars(dataArray);
          mapper.setScalarRange(activeField.min, activeField.max);
          
          // Calcul des statistiques
          if (onSliceAnalyzed) {
            const values = Array.from(activeField.values);
            const stats = {
              min: Math.min(...values),
              max: Math.max(...values),
              mean: values.reduce((a, b) => a + b, 0) / values.length,
              std: Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - values.reduce((a, b) => a + b, 0) / values.length, 2), 0) / values.length),
              p95: values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)],
              p99: values.sort((a, b) => a - b)[Math.floor(values.length * 0.99)],
              rms: Math.sqrt(values.reduce((sq, n) => sq + n * n, 0) / values.length),
              area: 0, // À calculer géométriquement
              perimeter: 0, // À calculer géométriquement
            };
            onSliceAnalyzed(slice, stats);
          }
        }
      }
      
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      
      // Couleur et opacité
      const color = hexToRgb(slice.color);
      actor.getProperty().setColor(...color);
      actor.getProperty().setOpacity(slice.opacity);
      
      if (slice.thickness > 0) {
        // Pour les slices épaisses (volume slices)
        actor.getProperty().setEdgeVisibility(true);
        actor.getProperty().setLineWidth(1);
      }
      
      renderer.addActor(actor);
      sliceActorsRef.current.set(slice.id, actor);
      
    } catch (error) {
      console.error('Failed to create slice:', error);
    }
  }, [activeField, onSliceAnalyzed]);
  
  // Configuration de la vue par défaut
  const setupDefaultView = useCallback((
    renderer: any, 
    meshData: any, 
    viewType: IndustrialConfig['default_view']
  ) => {
    const camera = renderer.getActiveCamera();
    
    if (!meshData) return;
    
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
    
    switch (viewType) {
      case 'isometric':
        camera.setPosition(
          center[0] + diag * 0.7,
          center[1] + diag * 0.7,
          center[2] + diag * 0.7
        );
        camera.setFocalPoint(center[0], center[1], center[2]);
        camera.setViewUp(0, 0, 1);
        break;
      case 'front':
        camera.setPosition(center[0], center[1] - diag, center[2]);
        camera.setFocalPoint(center[0], center[1], center[2]);
        camera.setViewUp(0, 0, 1);
        break;
      case 'top':
        camera.setPosition(center[0], center[1], center[2] + diag);
        camera.setFocalPoint(center[0], center[1], center[2]);
        camera.setViewUp(0, 1, 0);
        break;
      case 'side':
        camera.setPosition(center[0] + diag, center[1], center[2]);
        camera.setFocalPoint(center[0], center[1], center[2]);
        camera.setViewUp(0, 0, 1);
        break;
    }
    
    camera.setClippingRange(diag * 0.01, diag * 10);
  }, []);
  
  // Surveillance des performances
  const startPerformanceMonitoring = useCallback((renderWindow: any) => {
    let frameCount = 0;
    let lastCheck = performance.now();
    
    const updatePerformance = () => {
      const now = performance.now();
      frameCount++;
      
      if (now - lastCheck >= 1000) {
        const fps = Math.round((frameCount * 1000) / (now - lastCheck));
        
        // Estimation de la mémoire utilisée
        const memory = performance.memory 
          ? performance.memory.usedJSHeapSize / 1024 / 1024 
          : 0;
        
        dispatch({
          type: 'SET_PERFORMANCE',
          payload: { fps, memory: Math.round(memory) }
        });
        
        frameCount = 0;
        lastCheck = now;
      }
      
      performanceTimerRef.current = requestAnimationFrame(updatePerformance);
    };
    
    performanceTimerRef.current = requestAnimationFrame(updatePerformance);
  }, []);
  
  // Export de données
  const handleExport = useCallback(async (format: string) => {
    if (!renderWindowRef.current || !onExportRequested) return;
    
    try {
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 0, stage: `Exporting ${format}...` } 
      });
      
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
      
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 100, stage: 'Export completed' } 
      });
      
      setTimeout(() => {
        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 0, stage: 'Ready' } 
        });
      }, 2000);
      
    } catch (error) {
      console.error('Export failed:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    }
  }, [onExportRequested, show_annotations]);
  
  // Initialisation
  useEffect(() => {
    let cleanupFunctions: Array<() => void> = [];
    
    const init = async () => {
      cleanupFunctions = await initializeVTKRenderer();
    };
    
    init();
    
    return () => {
      cleanupFunctions.forEach(fn => fn());
    };
  }, [initializeVTKRenderer]);
  
  // Mise à jour quand le champ actif change
  useEffect(() => {
    if (!rendererRef.current || !meshDataRef.current || !activeField) return;
    
    const renderer = rendererRef.current;
    
    // Supprimer les acteurs précédents
    fieldActorsRef.current.forEach(actor => renderer.removeActor(actor));
    fieldActorsRef.current.clear();
    
    // Appliquer le nouveau champ
    applyFieldToMesh(renderer, meshDataRef.current, activeField);
    
    // Rerendre
    if (renderWindowRef.current) {
      renderWindowRef.current.render();
    }
  }, [activeField, applyFieldToMesh]);
  
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
          {(['volume', 'slice', 'wireframe', 'point_cloud'] as const).map((mode) => (
            <button
              key={mode}
              className={`flex-1 px-3 py-2 text-xs rounded transition-all ${
                state.viewMode === mode 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: mode })}
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
          <span className="font-semibold">{state.loadingStage}</span>
          <span className="text-blue-400">
            {simulation ? `${simulation.engine} ${simulation.version}` : 'Industrial Viewer'}
          </span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-green-500 transition-all duration-500 ease-out"
            style={{ width: `${state.loadingProgress}%` }}
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
        {state.error ? '⚠️' : '⚙️'} {state.error || state.loadingStage}
      </div>
      
      {mesh.metadata && !state.error && (
        <div className="text-sm text-gray-400 mt-4 text-center">
          <div>Mesh: {mesh.metadata.vertices.toLocaleString()} vertices</div>
          <div>Quality: {mesh.metadata.quality.avg_aspect_ratio.toFixed(2)} aspect ratio</div>
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
            <span className="font-mono">{state.selectedPoint.point[0].toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span>Y:</span>
            <span className="font-mono">{state.selectedPoint.point[1].toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span>Z:</span>
            <span className="font-mono">{state.selectedPoint.point[2].toFixed(3)}</span>
          </div>
          {activeField && state.selectedPoint.fieldValues && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="text-gray-400">{activeField.name}:</div>
              <div className="font-mono text-green-300">
                {formatValue(state.selectedPoint.fieldValues[activeField.name], activeField)}
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
          <div>• C: Reset camera</div>
          <div>• S: Toggle slice mode</div>
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

// Composant pour la comparaison industrielle
export const IndustrialComparisonViewer: React.FC<{
  models: Array<{
    name: string;
    mesh: IndustrialVTKViewerProps['mesh'];
    fields: IndustrialField[];
    validation?: ValidationMetrics;
  }>;
  layout?: 'horizontal' | 'vertical' | 'grid';
}> = ({ models, layout = 'grid' }) => {
  const gridClass = layout === 'grid' ? 'grid grid-cols-2 gap-4' :
                   layout === 'horizontal' ? 'flex gap-4' :
                   'flex flex-col gap-4';
  
  return (
    <div className={`${gridClass} h-full`}>
      {models.map((model, index) => (
        <div key={index} className="relative border border-gray-700 rounded-lg overflow-hidden">
          <div className="absolute top-2 left-2 z-10 bg-gray-900/80 px-3 py-1 rounded text-sm">
            {model.name}
          </div>
          <IndustrialVTKViewer
            mesh={model.mesh}
            fields={model.fields}
            show_controls={false}
            show_stats={false}
            className="h-64"
          />
          {model.validation && (
            <div className="absolute bottom-2 left-2 right-2 bg-gray-900/90 p-2 rounded text-xs">
              <div className="flex justify-between">
                <span>RMS Error:</span>
                <span className={model.validation.meets_spec ? 'text-green-400' : 'text-red-400'}>
                  {model.validation.rms_error.toExponential(3)}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Hook pour le monitoring de performance
export const useIndustrialPerformance = () => {
  const [metrics, setMetrics] = useState({
    fps: 0,
    memory: 0,
    cpu: 0,
    gpu: 0,
    triangles: 0,
  });
  
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const updateMetrics = () => {
      const now = performance.now();
      frameCount++;
      
      if (now - lastTime >= 1000) {
        setMetrics(prev => ({
          ...prev,
          fps: Math.round((frameCount * 1000) / (now - lastTime)),
          memory: performance.memory ? 
            Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 0,
        }));
        
        frameCount = 0;
        lastTime = now;
      }
      
      requestAnimationFrame(updateMetrics);
    };
    
    const animationId = requestAnimationFrame(updateMetrics);
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  return metrics;
};

export default React.memo(IndustrialVTKViewer);
