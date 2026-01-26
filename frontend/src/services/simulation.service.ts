import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
};

export const getContentTypeForFile = (fileName: string): string => {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeMap: Record<string, string> = {
    'stl': 'application/sla',
    'step': 'application/octet-stream',
    'stp': 'application/octet-stream',
    'iges': 'application/octet-stream',
    'igs': 'application/octet-stream',
    'vtk': 'text/plain',
    'vtp': 'application/octet-stream',
    'obj': 'model/obj'
  };
  return mimeMap[ext || ''] || 'application/octet-stream';
};

const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export const uploadGeometry = async (params: { file: File; userId: string; simulationId?: string; geometryConfig?: any }) => {
  const { file, userId, simulationId, geometryConfig } = params;
  try {
    const contentType = getContentTypeForFile(file.name);
    const fileName = `${userId}/${Date.now()}_${file.name}`;

    // Tentative 1: Direct Storage
    const { data, error: uploadError } = await supabase.storage
      .from('geometries')
      .upload(fileName, file, { contentType, upsert: false });

    if (uploadError) {
      console.warn('Direct upload failed, trying Edge Function fallback...');
      const arrayBuffer = await file.arrayBuffer();
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('upload-geometry', {
        body: { fileName: file.name, fileData: arrayBufferToBase64(arrayBuffer), userId, simulationId, geometry_config: geometryConfig }
      });
      if (edgeError) throw edgeError;
      return edgeData;
    }

    const { data: { publicUrl } } = supabase.storage.from('geometries').getPublicUrl(fileName);

    if (simulationId) {
      await supabase.from('simulations').update({
        geometry_config: { ...geometryConfig, file_url: publicUrl, file_name: file.name, file_size: file.size, uploaded_at: new Date().toISOString() }
      }).eq('id', simulationId);
    }

    return { success: true, fileUrl: publicUrl, fileName: file.name, path: fileName };
  } catch (error: any) {
    console.error('❌ Upload error:', error.message);
    throw error;
  }
};

export const startSimulation = async (simulationId: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const { data: simulation, error: fetchError } = await supabase.from('simulations').select('*').eq('id', simulationId).single();
    if (fetchError) throw fetchError;

    await supabase.from('simulations').update({ status: 'running', progress: 0, started_at: new Date().toISOString() }).eq('id', simulationId);

    const { data, error } = await supabase.functions.invoke('simulate', {
      body: { simulation_id: simulationId, config: simulation, user_id: session.user.id }
    });

    if (error) throw error;
    return data;
  } catch (error: any) {
    await supabase.from('simulations').update({ status: 'failed', error_message: error.message }).eq('id', simulationId);
    throw error;
  }
};

export const getSimulations = async () => {
  const { data, error } = await supabase.from('simulations').select('*, simulation_results (*)').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const SimulationService = { uploadGeometry, startSimulation, getSimulations };
export default SimulationService;
