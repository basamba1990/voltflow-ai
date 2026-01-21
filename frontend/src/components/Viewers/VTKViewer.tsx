import React, { useEffect, useRef, useState } from 'react';
import {
  vtkFullScreenRenderWindow,
} from '@kitware/vtk.js/Rendering/Core';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkScalarBarActor from '@kitware/vtk.js/Rendering/Core/ScalarBarActor';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';

interface VTKViewerProps {
  dataUrl: string;
  temperatureData?: number[];
  onPointSelect?: (point: { x: number; y: number; z: number; temp: number }) => void;
}

export const VTKViewer: React.FC<VTKViewerProps> = ({
  dataUrl,
  temperatureData,
  onPointSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !dataUrl) return;

    const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
      container: containerRef.current,
      background: [0.1, 0.1, 0.1],
    });

    const renderer = fullScreenRenderer.getRenderer();
    const renderWindow = fullScreenRenderer.getRenderWindow();
    const interactor = fullScreenRenderer.getInteractor();

    interactor.setInteractorStyle(
      vtkInteractorStyleTrackballCamera.newInstance()
    );

    const reader = vtkXMLPolyDataReader.newInstance();
    reader.setUrl(dataUrl).then(() => {
      const polyData = reader.getOutputData();

      const mapper = vtkMapper.newInstance();
      mapper.setInputData(polyData);
      mapper.setScalarVisibility(true);
      
      const minTemp = temperatureData ? Math.min(...temperatureData) : 20;
      const maxTemp = temperatureData ? Math.max(...temperatureData) : 100;
      mapper.setScalarRange(minTemp, maxTemp);

      const lut = vtkColorTransferFunction.newInstance();
      lut.addRGBPoint(minTemp, 0, 0, 1);
      lut.addRGBPoint(minTemp + (maxTemp - minTemp) * 0.5, 0, 1, 0);
      lut.addRGBPoint(maxTemp, 1, 0, 0);
      mapper.setLookupTable(lut);

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);

      const scalarBar = vtkScalarBarActor.newInstance();
      scalarBar.setLookupTable(lut);
      scalarBar.setTitle('Temperature (°C)');
      
      const plane = vtkPlane.newInstance();
      plane.setOrigin(0, 0, 0);
      plane.setNormal(1, 0, 0);

      const cutter = vtkCutter.newInstance();
      cutter.setCutFunction(plane);
      cutter.setInputData(polyData);

      const cutMapper = vtkMapper.newInstance();
      cutMapper.setInputConnection(cutter.getOutputPort());
      cutMapper.setScalarVisibility(true);
      cutMapper.setLookupTable(lut);

      const cutActor = vtkActor.newInstance();
      cutActor.setMapper(cutMapper);
      cutActor.getProperty().setEdgeVisibility(true);

      renderer.addActor(actor);
      renderer.addActor(cutActor);
      renderer.addActor(scalarBar);
      renderer.resetCamera();

      interactor.onLeftButtonPress(() => {
        const pos = interactor.getEventPosition();
        const picker = vtkCellPicker.newInstance();
        picker.pick(pos[0], pos[1], 0, renderer);

        const pickedPoint = picker.getPickPosition();
        if (pickedPoint && onPointSelect) {
          const pointId = picker.getPointId();
          if (pointId >= 0 && temperatureData) {
            onPointSelect({
              x: pickedPoint[0],
              y: pickedPoint[1],
              z: pickedPoint[2],
              temp: temperatureData[pointId],
            });
          }
        }
      });

      renderWindow.render();
      setIsLoading(false);
    });

    return () => {
      fullScreenRenderer.delete();
    };
  }, [dataUrl, temperatureData, onPointSelect]);

  return (
    <div className="relative w-full h-[600px] border border-gray-800 rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
          <div className="text-white flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
            Loading 3D visualization...
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-4 left-4 bg-gray-900/70 p-3 rounded-lg text-white text-xs z-10">
        <div className="font-bold mb-1">Controls:</div>
        <div>• Left drag: Rotate</div>
        <div>• Right drag: Pan</div>
        <div>• Scroll: Zoom</div>
        <div>• Click: Select point</div>
      </div>
    </div>
  );
};
