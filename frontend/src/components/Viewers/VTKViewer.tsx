import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Loader2, Maximize2, Minimize2, Eye, EyeOff, Box, Settings } from 'lucide-react';

// Import dynamique pour éviter les problèmes de build
const loadVTK = async () => {
  // On charge les modules VTK de manière dynamique
  const vtk = await import('@kitware/vtk.js');
  return vtk;
};

// Types simplifiés
export type FieldType = 'temperature' | 'stress' | 'displacement' | 'pressure' | 'scalar';
export type ColorMap = 'heat' | 'coolwarm' | 'rainbow' | 'viridis';

export interface FieldData {
  id: string;
  name: string;
  type: FieldType;
  values: number[] | Float32Array;
  units: string;
  min: number;
  max: number;
}

export interface MeshData {
  url: string;
  type: 'vtp' | 'vti' | 'stl' | 'obj';
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
}

interface VTKViewerProps {
  mesh: MeshData;
  fieldData?: FieldData[];
  activeFieldId?: string;
  config?: ViewerConfig;
  className?: string;
  
  onPointSelected?: (data: {
    position: [number, number, number];
    fieldValue?: number;
    elementId?: number;
  }) => void;
  
  onLoadComplete?: (metadata: any) => void;
  onError?: (error: Error) => void;
  
  showControls?: boolean;
  showStats?: boolean;
  showCoordinates?: boolean;
  isLoading?: boolean;
}

// Palettes de couleurs simplifiées
const COLOR_MAPS: Record<ColorMap, number[][]> = {
  heat: [
    [0, 0, 0],
    [0.5, 0, 0],
    [1, 0, 0],
    [1, 0.5, 0],
    [1, 1, 0],
    [1, 1, 1]
  ],
  coolwarm: [
    [0.23, 0.299, 0.754],
    [0.865, 0.865, 0.865],
    [0.706, 0.016, 0.15]
  ],
  rainbow: [
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
    [1, 1, 0],
    [1, 0.5, 0],
    [1, 0, 0]
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
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<any>(null);
  const vtkRef = useRef<any>(null);
  
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
    },
  });

  // Champ actif
  const activeField = useMemo(() => {
    if (activeFieldId) {
      return fieldData.find(f => f.id === activeFieldId) || fieldData[0];
    }
    return fieldData[0];
  }, [fieldData, activeFieldId]);

  // Configuration fusionnée
  const viewerConfig = useMemo(() => ({
    showGrid: true,
    showAxes: true,
    showLegend: true,
    colorMap: 'heat' as ColorMap,
    opacity: 0.8,
    viewMode: 'volume' as 'volume' | 'wireframe' | 'points',
    backgroundColor: [0.05, 0.05, 0.08] as [number, number, number],
    ...config,
  }), [config]);

  // Initialisation du renderer
  const initializeRenderer = useCallback(async () => {
    if (!containerRef.current || !mesh.url) {
      setState(prev => ({ ...prev, error: 'Container or mesh URL not available' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null, progress: 0 }));

    try {
      // Charger VTK dynamiquement
      const vtk = await loadVTK();
      vtkRef.current = vtk;
      setState(prev => ({ ...prev, progress: 30 }));

      // Créer la fenêtre de rendu
      const fullScreenRenderer = vtk.Rendering.Misc.FullScreenRenderWindow.newInstance({
        container: containerRef.current,
        background: viewerConfig.backgroundColor,
        listenWindowResize: true,
      });

      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();
      const interactor = fullScreenRenderer.getInteractor();

      renderWindowRef.current = renderWindow;

      // Configurer le renderer
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
      orientationWidget.setEnabled(viewerConfig.showAxes);
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

      // Créer le contour
      const outlineFilter = vtk.Filters.Core.OutlineFilter.newInstance();
      outlineFilter.setInputData(meshData);

      const outlineMapper = vtk.Rendering.Core.Mapper.newInstance();
      outlineMapper.setInputConnection(outlineFilter.getOutputPort());

      const outlineActor = vtk.Rendering.Core.Actor.newInstance();
      outlineActor.setMapper(outlineMapper);
      outlineActor.getProperty().setColor(0.7, 0.7, 0.7);
      outlineActor.getProperty().setLineWidth(1);
      outlineActor.getProperty().setOpacity(0.3);
      outlineActor.setVisibility(viewerConfig.showGrid);

      renderer.addActor(outlineActor);

      // Appliquer les données de champ
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

        // Table de couleurs
        const lut = vtk.Rendering.Core.ColorTransferFunction.newInstance();
        const colorMap = COLOR_MAPS[viewerConfig.colorMap];
        
        colorMap.forEach((color, index) => {
          const t = index / (colorMap.length - 1);
          const value = activeField.min + t * (activeField.max - activeField.min);
          lut.addRGBPoint(value, color[0], color[1], color[2]);
        });

        mapper.setLookupTable(lut);

        // Créer l'acteur
        const actor = vtk.Rendering.Core.Actor.newInstance();
        actor.setMapper(mapper);

        // Configuration selon le mode de vue
        const property = actor.getProperty();
        switch (viewerConfig.viewMode) {
          case 'wireframe':
            property.setRepresentationToWireframe();
            property.setLineWidth(1);
            break;
          case 'points':
            property.setRepresentationToPoints();
            property.setPointSize(3);
            break;
          default:
            property.setRepresentationToSurface();
            property.setOpacity(viewerConfig.opacity);
        }

        // Éclairage
        property.setAmbient(0.1);
        property.setDiffuse(0.7);
        property.setSpecular(0.2);
        property.setSpecularPower(10);

        // Ajouter au renderer
        renderer.addActor(actor);

        // Barre de couleur
        if (viewerConfig.showLegend) {
          const scalarBar = vtk.Rendering.Core.ScalarBarActor.newInstance();
          scalarBar.setLookupTable(lut);
          scalarBar.setTitle(`${activeField.name} (${activeField.units})`);
          scalarBar.setNumberOfLabels(5);
          scalarBar.setMaximumNumberOfColors(256);
          scalarBar.setWidth(0.08);
          scalarBar.setHeight(0.4);
          scalarBar.setPosition(0.02, 0.3);

          renderer.addActor2D(scalarBar);
        }

        // Picking
        if (onPointSelected) {
          const picker = vtk.Rendering.Core.PointPicker.newInstance();
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
      }

      // Configurer la caméra
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
      
      setState(prev => ({ 
        ...prev, 
        progress: 100,
        isLoading: false,
        activeField: activeField || null,
        performance: {
          ...prev.performance,
          triangles: meshData.getNumberOfCells?.() || 0,
        }
      }));

      // Surveillance des FPS
      let frameCount = 0;
      let lastTime = performance.now();
      
      const updatePerformance = () => {
        const now = performance.now();
        frameCount++;

        if (now - lastTime >= 1000) {
          const fps = Math.round((frameCount * 1000) / (now - lastTime));
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

          frameCount = 0;
          lastTime = now;
        }

        requestAnimationFrame(updatePerformance);
      };

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

      // Nettoyage
      return () => {
        window.removeEventListener('resize', handleResize);
        if (fullScreenRenderer) {
          fullScreenRenderer.delete();
        }
        orientationWidget.setEnabled(false);
        cancelAnimationFrame(updatePerformance);
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

    // Ici, vous pourriez appliquer les changements au renderer VTK
    // Pour l'instant, nous laissons cela comme point d'extension
  }, []);

  // Effet d'initialisation
  useEffect(() => {
    const cleanup = initializeRenderer();
    return () => {
      cleanup.then(fn => fn?.());
    };
  }, [initializeRenderer]);

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

  // Contrôles
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
          <div className="grid grid-cols-2 gap-1">
            {Object.keys(COLOR_MAPS).map((key) => (
              <button
                key={key}
                className={`h-6 rounded ${
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
          VTK Viewer v1.0
        </div>
      )}
    </div>
  );
};

export default React.memo(VTKViewer);
