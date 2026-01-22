import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import vtkTriangleFilter from '@kitware/vtk.js/Filters/Core/TriangleFilter';
import vtkPolyDataNormals from '@kitware/vtk.js/Filters/Core/PolyDataNormals';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkLookupTable from '@kitware/vtk.js/Common/Core/LookupTable';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkOutlineFilter from '@kitware/vtk.js/Filters/Core/OutlineFilter';
import vtkOBJReader from '@kitware/vtk.js/IO/Geometry/OBJReader';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkSkybox from '@kitware/vtk.js/Rendering/Core/Skybox';
import { Loader2, Maximize2, Minimize2, Grid3x3, Box, Eye, EyeOff } from 'lucide-react';

// Types simplifiés pour l'application
export type FieldType = 'temperature' | 'stress' | 'displacement' | 'pressure' | 'scalar';
export type ColorMap = 'heat' | 'coolwarm' | 'rainbow' | 'viridis' | 'plasma' | 'inferno';

export interface FieldData {
  id: string;
  name: string;
  type: FieldType;
  values: number[] | Float32Array;
  units: string;
  min: number;
  max: number;
  component?: 'x' | 'y' | 'z' | 'magnitude';
}

export interface MeshData {
  url: string;
  type: 'vtp' | 'vti' | 'stl' | 'obj' | 'ply';
  metadata?: {
    vertices: number;
    faces: number;
    bounds: number[];
  };
}

export interface ViewerConfig {
  showGrid?: boolean;
  showAxes?: boolean;
  showLegend?: boolean;
  colorMap?: ColorMap;
  opacity?: number;
  viewMode?: 'volume' | 'wireframe' | 'points';
  backgroundColor?: [number, number, number];
  lighting?: 'standard' | 'bright' | 'soft';
}

interface VTKViewerProps {
  // Données obligatoires
  mesh: MeshData;
  fieldData?: FieldData[];
  activeFieldId?: string;
  
  // Configuration
  config?: ViewerConfig;
  className?: string;
  
  // Callbacks
  onPointSelected?: (data: {
    position: [number, number, number];
    fieldValue?: number;
    elementId?: number;
  }) => void;
  
  onLoadComplete?: (metadata: any) => void;
  onError?: (error: Error) => void;
  
  // Contrôles UI
  showControls?: boolean;
  showStats?: boolean;
  showCoordinates?: boolean;
  isLoading?: boolean;
}

// Palettes de couleurs optimisées pour la performance
const COLOR_MAPS: Record<ColorMap, number[][]> = {
  heat: [
    [0, 0, 0],       // Noir
    [0.5, 0, 0],     // Rouge foncé
    [1, 0, 0],       // Rouge
    [1, 0.5, 0],     // Orange
    [1, 1, 0],       // Jaune
    [1, 1, 1]        // Blanc
  ],
  coolwarm: [
    [0.23, 0.299, 0.754],  // Bleu froid
    [0.865, 0.865, 0.865], // Gris neutre
    [0.706, 0.016, 0.15]   // Rouge chaud
  ],
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

export const VTKViewer: React.FC<VTKViewerProps> = ({
  mesh,
  fieldData = [],
  activeFieldId,
  config = {},
  className = '',
  onPointSelected,
  onLoadComplete,
  onError,
  showControls = true,
  showStats = true,
  showCoordinates = true,
  isLoading = false,
}) => {
  // Références
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const orientationWidgetRef = useRef<any>(null);
  
  // État local
  const [state, setState] = useState({
    isLoading: true,
    error: null as string | null,
    progress: 0,
    isFullscreen: false,
    activeField: null as FieldData | null,
    selectedPoint: null as {
      position: [number, number, number];
      fieldValue?: number;
    } | null,
    performance: {
      fps: 0,
      triangles: 0,
      memory: 0,
    },
    viewSettings: {
      showGrid: config.showGrid ?? true,
      showAxes: config.showAxes ?? true,
      showLegend: config.showLegend ?? true,
      colorMap: config.colorMap ?? 'heat',
      opacity: config.opacity ?? 0.8,
      viewMode: config.viewMode ?? 'volume',
      backgroundColor: config.backgroundColor ?? [0.05, 0.05, 0.08],
      lighting: config.lighting ?? 'standard',
    },
  });

  // Ref pour le maillage chargé
  const meshDataRef = useRef<any>(null);
  const actorsRef = useRef<Map<string, any>>(new Map());
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  // Champ actif
  const activeField = useMemo(() => {
    if (activeFieldId) {
      return fieldData.find(f => f.id === activeFieldId) || fieldData[0];
    }
    return fieldData[0];
  }, [fieldData, activeFieldId]);

  // Configuration par défaut fusionnée
  const viewerConfig = useMemo(() => ({
    showGrid: true,
    showAxes: true,
    showLegend: true,
    colorMap: 'heat' as ColorMap,
    opacity: 0.8,
    viewMode: 'volume' as 'volume' | 'wireframe' | 'points',
    backgroundColor: [0.05, 0.05, 0.08] as [number, number, number],
    lighting: 'standard' as 'standard' | 'bright' | 'soft',
    ...config,
  }), [config]);

  // Initialisation du renderer VTK
  const initializeRenderer = useCallback(async () => {
    if (!containerRef.current || !mesh.url) {
      setState(prev => ({ ...prev, error: 'Container or mesh URL not available' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null, progress: 0 }));

    let fullScreenRenderer: any = null;
    const cleanupFunctions: Array<() => void> = [];

    try {
      // Créer la fenêtre de rendu
      fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        container: containerRef.current,
        background: viewerConfig.backgroundColor,
        listenWindowResize: true,
        renderLater: false,
      });

      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();
      const interactor = fullScreenRenderer.getInteractor();

      rendererRef.current = renderer;
      renderWindowRef.current = renderWindow;

      // Configuration du renderer
      renderer.setTwoSidedLighting(true);
      renderer.setUseDepthPeeling(true);
      renderer.setMaximumNumberOfPeels(4);
      renderer.setOcclusionRatio(0.0);

      // Style d'interaction
      const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();
      interactor.setInteractorStyle(interactorStyle);
      interactor.setDesiredUpdateRate(60);

      // Widget d'orientation
      const axes = vtkAnnotatedCubeActor.newInstance();
      axes.setDefaultStyle({
        'X+': { faceColor: '#ff0000', faceRotation: 0 },
        'X-': { faceColor: '#800000', faceRotation: 0 },
        'Y+': { faceColor: '#00ff00', faceRotation: 90 },
        'Y-': { faceColor: '#008000', faceRotation: 90 },
        'Z+': { faceColor: '#0000ff', faceRotation: 0 },
        'Z-': { faceColor: '#000080', faceRotation: 0 },
      });

      const orientationWidget = vtkOrientationMarkerWidget.newInstance({
        actor: axes,
        interactor: interactor,
      });
      orientationWidget.setEnabled(viewerConfig.showAxes);
      orientationWidget.setViewportCorner(vtkOrientationMarkerWidget.Corners.BOTTOM_LEFT);
      orientationWidget.setViewportSize(0.15);
      orientationWidgetRef.current = orientationWidget;

      // Charger le maillage
      setState(prev => ({ ...prev, progress: 10, error: null }));
      const meshData = await loadMeshData(mesh.url, mesh.type);
      meshDataRef.current = meshData;

      if (!meshData) {
        throw new Error('Failed to load mesh data');
      }

      // Créer le contour
      const outlineFilter = vtkOutlineFilter.newInstance();
      outlineFilter.setInputData(meshData);

      const outlineMapper = vtkMapper.newInstance();
      outlineMapper.setInputConnection(outlineFilter.getOutputPort());

      const outlineActor = vtkActor.newInstance();
      outlineActor.setMapper(outlineMapper);
      outlineActor.getProperty().setColor(0.7, 0.7, 0.7);
      outlineActor.getProperty().setLineWidth(1);
      outlineActor.getProperty().setOpacity(0.3);
      outlineActor.setVisibility(viewerConfig.showGrid);

      renderer.addActor(outlineActor);
      actorsRef.current.set('outline', outlineActor);
      cleanupFunctions.push(() => renderer.removeActor(outlineActor));

      // Appliquer les données de champ
      if (activeField) {
        setState(prev => ({ ...prev, progress: 50 }));
        await applyFieldData(renderer, meshData, activeField, viewerConfig);
      }

      // Skybox pour un fond plus professionnel
      const skybox = vtkSkybox.newInstance();
      skybox.setProjection(vtkSkybox.Projection.SPHERE);
      renderer.addActor(skybox);

      // Picking de points
      if (onPointSelected) {
        const picker = vtkPointPicker.newInstance();
        picker.setTolerance(0.005);

        interactor.onLeftButtonPress(() => {
          const pos = interactor.getEventPosition();
          picker.pick(pos[0], pos[1], 0, renderer);
          const point = picker.getPickPosition();
          const pointId = picker.getPointId();

          if (pointId >= 0 && point) {
            const fieldValue = activeField?.values?.[pointId];
            const data = {
              position: [point[0], point[1], point[2]] as [number, number, number],
              fieldValue,
              elementId: pointId,
            };

            onPointSelected(data);
            setState(prev => ({ ...prev, selectedPoint: data }));
          }
        });
      }

      // Configuration de la caméra
      setupCamera(renderer, meshData);

      // Rendu initial
      renderWindow.render();
      setState(prev => ({ 
        ...prev, 
        progress: 100,
        isLoading: false,
        performance: {
          ...prev.performance,
          triangles: meshData.getNumberOfCells?.() || 0,
        }
      }));

      // Surveillance des FPS
      const updatePerformance = () => {
        const now = performance.now();
        frameCountRef.current++;

        if (now - lastFrameTimeRef.current >= 1000) {
          const fps = Math.round((frameCountRef.current * 1000) / (now - lastFrameTimeRef.current));
          const memory = performance.memory 
            ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
            : 0;

          setState(prev => ({
            ...prev,
            performance: {
              ...prev.performance,
              fps,
              memory,
            },
          }));

          frameCountRef.current = 0;
          lastFrameTimeRef.current = now;
        }

        requestAnimationFrame(updatePerformance);
      };

      lastFrameTimeRef.current = performance.now();
      requestAnimationFrame(updatePerformance);

      // Rappel de chargement complet
      if (onLoadComplete) {
        onLoadComplete({
          vertices: meshData.getNumberOfPoints?.(),
          cells: meshData.getNumberOfCells?.(),
          bounds: meshData.getBounds?.(),
        });
      }

      // Gestionnaire de redimensionnement
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
        if (orientationWidgetRef.current) {
          orientationWidgetRef.current.setEnabled(false);
        }
        cancelAnimationFrame(updatePerformance);
      });

      return () => {
        cleanupFunctions.forEach(fn => fn());
      };

    } catch (error: any) {
      console.error('Failed to initialize VTK renderer:', error);
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'Failed to initialize viewer',
        isLoading: false 
      }));
      
      if (onError) {
        onError(error instanceof Error ? error : new Error(error.message));
      }
      
      return () => {};
    }
  }, [mesh.url, mesh.type, activeField, viewerConfig, onPointSelected, onLoadComplete, onError]);

  // Chargement des données de maillage
  const loadMeshData = useCallback(async (url: string, type: string): Promise<any> => {
    try {
      let reader;
      switch (type.toLowerCase()) {
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

      // Chargement avec progression
      if (reader.setProgressCallback) {
        reader.setProgressCallback((progress: number) => {
          const overallProgress = 10 + progress * 0.4; // 10-50%
          setState(prev => ({ 
            ...prev, 
            progress: Math.round(overallProgress),
          }));
        });
      }

      await reader.setUrl(url);
      const data = reader.getOutputData();

      // Optimisation pour les gros maillages
      if (data.isA('vtkPolyData') && data.getNumberOfCells() > 100000) {
        const triangleFilter = vtkTriangleFilter.newInstance();
        triangleFilter.setInputData(data);
        
        const normals = vtkPolyDataNormals.newInstance();
        normals.setInputConnection(triangleFilter.getOutputPort());
        normals.setFeatureAngle(45);
        normals.setConsistency(true);
        normals.setAutoOrientNormals(true);
        normals.setComputePointNormals(true);
        
        normals.update();
        return normals.getOutputData();
      }

      return data;
    } catch (error: any) {
      console.error('Failed to load mesh:', error);
      throw new Error(`Failed to load mesh: ${error.message}`);
    }
  }, []);

  // Application des données de champ
  const applyFieldData = useCallback(async (
    renderer: any,
    meshData: any,
    field: FieldData,
    config: ViewerConfig
  ) => {
    try {
      // Nettoyer les acteurs existants
      actorsRef.current.forEach(actor => {
        if (actor !== actorsRef.current.get('outline')) {
          renderer.removeActor(actor);
        }
      });
      actorsRef.current.clear();

      // Créer le tableau de données scalaires
      const values = field.values instanceof Float32Array 
        ? field.values 
        : new Float32Array(field.values);
      
      const dataArray = vtkDataArray.newInstance({
        numberOfComponents: 1,
        values: values,
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

      // Table de couleurs
      const lut = vtkColorTransferFunction.newInstance();
      const colorMap = COLOR_MAPS[config.colorMap || 'heat'];
      
      colorMap.forEach((color, index) => {
        const t = index / (colorMap.length - 1);
        const value = field.min + t * (field.max - field.min);
        lut.addRGBPoint(value, color[0], color[1], color[2]);
      });

      mapper.setLookupTable(lut);

      // Créer l'acteur
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);

      // Configuration selon le mode de vue
      const property = actor.getProperty();
      switch (config.viewMode) {
        case 'wireframe':
          property.setRepresentationToWireframe();
          property.setLineWidth(1);
          property.setOpacity(1);
          break;
        case 'points':
          property.setRepresentationToPoints();
          property.setPointSize(3);
          property.setOpacity(1);
          break;
        default: // volume
          property.setRepresentationToSurface();
          property.setOpacity(config.opacity || 0.8);
      }

      // Éclairage
      property.setAmbient(0.1);
      property.setDiffuse(0.7);
      property.setSpecular(0.2);
      property.setSpecularPower(10);

      // Ajouter au renderer
      renderer.addActor(actor);
      actorsRef.current.set('main', actor);

      // Barre de couleur
      if (config.showLegend) {
        const scalarBar = vtkScalarBarActor.newInstance();
        scalarBar.setLookupTable(lut);
        scalarBar.setTitle(`${field.name} (${field.units})`);
        scalarBar.setNumberOfLabels(5);
        scalarBar.setMaximumNumberOfColors(256);
        scalarBar.setWidth(0.08);
        scalarBar.setHeight(0.4);
        scalarBar.setPosition(0.02, 0.3);

        renderer.addActor2D(scalarBar);
        actorsRef.current.set('scalarBar', scalarBar);
      }

      // Rerendre
      if (renderWindowRef.current) {
        renderWindowRef.current.render();
      }

    } catch (error) {
      console.error('Failed to apply field data:', error);
      throw error;
    }
  }, []);

  // Configuration de la caméra
  const setupCamera = useCallback((renderer: any, meshData: any) => {
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

    // Vue isométrique par défaut
    camera.setPosition(
      center[0] + diag * 0.7,
      center[1] + diag * 0.7,
      center[2] + diag * 0.7
    );
    camera.setFocalPoint(center[0], center[1], center[2]);
    camera.setViewUp(0, 0, 1);
    camera.setClippingRange(diag * 0.01, diag * 10);
  }, []);

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

  // Mise à jour de la configuration
  const updateViewSettings = useCallback((settings: Partial<typeof state.viewSettings>) => {
    setState(prev => ({
      ...prev,
      viewSettings: { ...prev.viewSettings, ...settings },
    }));

    // Appliquer les changements au renderer
    if (rendererRef.current) {
      const renderer = rendererRef.current;

      // Grille
      const outlineActor = actorsRef.current.get('outline');
      if (outlineActor) {
        outlineActor.setVisibility(settings.showGrid ?? state.viewSettings.showGrid);
      }

      // Axes
      if (orientationWidgetRef.current) {
        orientationWidgetRef.current.setEnabled(settings.showAxes ?? state.viewSettings.showAxes);
      }

      // Couleur de fond
      if (settings.backgroundColor) {
        renderer.setBackground(...settings.backgroundColor);
      }

      // Re-render
      if (renderWindowRef.current) {
        renderWindowRef.current.render();
      }
    }
  }, [state.viewSettings]);

  // Effet d'initialisation
  useEffect(() => {
    const cleanup = initializeRenderer();
    return () => {
      cleanup.then(fn => fn?.());
    };
  }, [initializeRenderer]);

  // Effet de mise à jour du champ actif
  useEffect(() => {
    if (!rendererRef.current || !meshDataRef.current || !activeField) return;

    const renderer = rendererRef.current;
    applyFieldData(renderer, meshDataRef.current, activeField, viewerConfig);
  }, [activeField, viewerConfig, applyFieldData]);

  // Interface de contrôle
  const renderControls = () => (
    <div className="absolute top-4 left-4 bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 text-sm text-gray-200 shadow-xl border border-gray-700/50 w-72">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-lg flex items-center gap-2">
          <Box className="w-5 h-5" />
          VTK Viewer
        </div>
        <button
          onClick={toggleFullscreen}
          className="p-2 hover:bg-gray-800 rounded transition-colors"
          title={state.isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        >
          {state.isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </div>

      <div className="space-y-3">
        {/* Sélection du champ */}
        {fieldData.length > 1 && (
          <div>
            <div className="text-xs text-gray-400 mb-2">Champ actif</div>
            <div className="space-y-1">
              {fieldData.map((field) => (
                <div
                  key={field.id}
                  className={`p-2 rounded cursor-pointer transition-all ${
                    activeField?.id === field.id
                      ? 'bg-blue-900/50 border border-blue-700'
                      : 'hover:bg-gray-800/50'
                  }`}
                  onClick={() => setState(prev => ({ ...prev, activeField: field }))}
                >
                  <div className="font-medium">{field.name}</div>
                  <div className="text-xs text-gray-400">
                    {field.min.toFixed(1)} - {field.max.toFixed(1)} {field.units}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Options d'affichage */}
        <div>
          <div className="text-xs text-gray-400 mb-2">Affichage</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`p-2 rounded text-xs ${
                state.viewSettings.viewMode === 'volume'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => updateViewSettings({ viewMode: 'volume' })}
            >
              Volume
            </button>
            <button
              className={`p-2 rounded text-xs ${
                state.viewSettings.viewMode === 'wireframe'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => updateViewSettings({ viewMode: 'wireframe' })}
            >
              Filaire
            </button>
            <button
              className={`p-2 rounded text-xs ${
                state.viewSettings.viewMode === 'points'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => updateViewSettings({ viewMode: 'points' })}
            >
              Points
            </button>
          </div>
        </div>

        {/* Options de visualisation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Grille</span>
            <button
              onClick={() => updateViewSettings({ showGrid: !state.viewSettings.showGrid })}
              className={`w-10 h-5 rounded-full transition-colors ${
                state.viewSettings.showGrid ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transform transition-transform ${
                  state.viewSettings.showGrid ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Axes</span>
            <button
              onClick={() => updateViewSettings({ showAxes: !state.viewSettings.showAxes })}
              className={`w-10 h-5 rounded-full transition-colors ${
                state.viewSettings.showAxes ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transform transition-transform ${
                  state.viewSettings.showAxes ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Légende</span>
            <button
              onClick={() => updateViewSettings({ showLegend: !state.viewSettings.showLegend })}
              className={`w-10 h-5 rounded-full transition-colors ${
                state.viewSettings.showLegend ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transform transition-transform ${
                  state.viewSettings.showLegend ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Palette de couleurs */}
        <div>
          <div className="text-xs text-gray-400 mb-2">Palette</div>
          <div className="grid grid-cols-3 gap-1">
            {Object.keys(COLOR_MAPS).map((key) => (
              <button
                key={key}
                className={`h-8 rounded ${
                  state.viewSettings.colorMap === key
                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-900'
                    : ''
                }`}
                style={{
                  background: `linear-gradient(to right, ${
                    COLOR_MAPS[key as ColorMap]
                      .map((color, i, arr) => 
                        `rgb(${Math.round(color[0]*255)}, ${Math.round(color[1]*255)}, ${Math.round(color[2]*255)}) ${(i/(arr.length-1))*100}%`
                      )
                      .join(', ')
                  })`,
                }}
                onClick={() => updateViewSettings({ colorMap: key as ColorMap })}
                title={key}
              />
            ))}
          </div>
        </div>

        {/* Opacité */}
        <div>
          <div className="text-xs text-gray-400 mb-2">Opacité</div>
          <input
            type="range"
            min="0"
            max="100"
            value={state.viewSettings.opacity * 100}
            onChange={(e) => updateViewSettings({ opacity: parseInt(e.target.value) / 100 })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="text-xs text-right mt-1">
            {Math.round(state.viewSettings.opacity * 100)}%
          </div>
        </div>

        {/* Métriques de performance */}
        {showStats && (
          <div className="pt-3 border-t border-gray-700">
            <div className="text-xs text-gray-400 mb-2">Performance</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span>FPS:</span>
                <span className="font-mono">{state.performance.fps}</span>
              </div>
              <div className="flex justify-between">
                <span>Triangles:</span>
                <span className="font-mono">
                  {state.performance.triangles.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Mémoire:</span>
                <span className="font-mono">{state.performance.memory} MB</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Overlay de chargement
  const renderLoadingOverlay = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 z-50">
      <div className="w-80 mb-6">
        <div className="flex justify-between text-sm text-gray-300 mb-2">
          <span className="font-semibold">Chargement du modèle...</span>
          <span>{state.progress}%</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500 ease-out"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      </div>
      <div className="text-gray-300 text-lg mb-2">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
        {state.error ? `⚠️ ${state.error}` : 'Initialisation du viewer...'}
      </div>
      {mesh.metadata && (
        <div className="text-sm text-gray-400 mt-4 text-center">
          <div>Vertices: {mesh.metadata.vertices?.toLocaleString() || '...'}</div>
        </div>
      )}
    </div>
  );

  // Overlay de coordonnées
  const renderCoordinatesOverlay = () => (
    <div className="absolute bottom-4 right-4 bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 text-xs text-gray-300">
      <div className="font-semibold mb-1">Coordonnées</div>
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
          {state.selectedPoint.fieldValue !== undefined && activeField && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="text-gray-400">{activeField.name}:</div>
              <div className="font-mono text-green-300">
                {state.selectedPoint.fieldValue.toFixed(1)} {activeField.units}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-500">Cliquez sur le modèle</div>
      )}
    </div>
  );

  // Guide d'utilisation
  const renderHelpOverlay = () => (
    <div className="absolute top-4 right-4 text-xs text-gray-500 bg-gray-900/70 rounded p-2">
      <div className="font-semibold mb-1">Contrôles</div>
      <div>• LMB: Rotation / Sélection</div>
      <div>• RMB: Déplacement</div>
      <div>• Molette: Zoom</div>
      <div>• R: Réinitialiser la vue</div>
    </div>
  );

  return (
    <div className={`relative w-full h-full bg-gray-900 ${className}`}>
      {/* Zone de rendu VTK */}
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Overlays */}
      {state.isLoading && renderLoadingOverlay()}
      {showControls && !state.isLoading && renderControls()}
      {showCoordinates && !state.isLoading && renderCoordinatesOverlay()}
      {!state.isLoading && renderHelpOverlay()}
      
      {/* Watermark */}
      {!state.isLoading && (
        <div className="absolute bottom-4 left-4 text-xs text-gray-600/30 pointer-events-none">
          VTK Viewer v2.0
        </div>
      )}
    </div>
  );
};

export default React.memo(VTKViewer);
