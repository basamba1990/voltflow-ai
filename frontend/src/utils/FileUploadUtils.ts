// src/utils/FileUploadUtils.ts

export const validateFile = (file: File): { valid: boolean; error?: string } => {
  // Validation extension
  const validExtensions = ['.stl', '.step', '.stp', '.obj', '.vtp', '.vti', '.ply', '.vtk', '.iges', '.igs', '.vtu'];
  const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  
  if (!validExtensions.includes(fileExt)) {
    return {
      valid: false,
      error: `Extension non supportée: ${fileExt}. Formats acceptés: ${validExtensions.join(', ')}`
    };
  }

  // Validation taille (50MB max)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 50MB`
    };
  }

  return { valid: true };
};

export const getSafeContentType = (fileName: string): string => {
  // Toujours utiliser octet-stream pour éviter les erreurs 415
  return 'application/octet-stream';
};

export const createUniqueFileName = (userId: string, originalName: string): string => {
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = originalName.split('.').pop()?.toLowerCase() || 'vtp';
  return `${userId}/${timestamp}_${uniqueId}.${fileExt}`;
};
