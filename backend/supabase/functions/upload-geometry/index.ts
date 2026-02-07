import { createClient } from "npm:@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "Vary": "Origin",
  "Content-Type": "application/json",
};

// ✅ DÉTECTION TYPE GÉOMÉTRIE (intégrée)
function detectGeometryType(fileName: string): '1d_rod' | '2d_plate' | '3d_complex' {
  const lowerName = fileName.toLowerCase();
  if (lowerName.includes('rod') || lowerName.includes('1d') || lowerName.includes('bar')) {
    return '1d_rod';
  } else if (lowerName.includes('plate') || lowerName.includes('2d') || lowerName.includes('sheet')) {
    return '2d_plate';
  } else {
    return '3d_complex';
  }
}

// ✅ DÉTECTION SOLVEUR RECOMMANDÉ
function detectSolverType(geometryType: string, fileExt: string): string {
  if (geometryType === '1d_rod') return 'fem_fortran';
  if (geometryType === '2d_plate') return 'fem_fortran';
  if (fileExt === 'stl' || fileExt === 'step') return 'openfoam';
  return 'fem_fortran';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Méthode non autorisée. Utilisez POST." }),
      { status: 405, headers: corsHeaders }
    );
  }

  let userId: string | null = null;
  let simulationId: string | null = null;

  try {
    // 1. AUTHENTIFICATION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Non autorisé: Header Authorization manquant");
    }
    
    const token = authHeader.split(" ")[1];
    const { data: user, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL") as string,
      Deno.env.get("SUPABASE_ANON_KEY") as string
    ).auth.getUser(token);

    if (authError || !user?.user?.id) {
      throw new Error(`Authentification échouée: ${authError?.message || "ID utilisateur non trouvé"}`);
    }
    
    userId = user.user.id;

    // 2. PARSING CORPS
    const body = await req.json();
    const { fileName, fileData, simulation_id } = body ?? {};
    
    if (!fileName || !fileData || !simulation_id) {
      throw new Error("Champs requis manquants: fileName, fileData, simulation_id");
    }
    
    simulationId = simulation_id;

    // 3. VALIDATION FORMAT
    const allowedTypes = ["stl", "step", "stp", "obj", "iges", "igs", "vtp", "vti", "ply", "vtk", "vtu"];
    const fileExt = fileName.toLowerCase().split(".").pop() || "";
    
    if (!allowedTypes.includes(fileExt)) {
      throw new Error(`Format non supporté: ${fileExt}. Formats: ${allowedTypes.join(", ")}`);
    }

    // 4. INIT CLIENT SERVICE ROLE
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variables d'environnement Supabase manquantes");
    }

    const supabaseServiceRole = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 5. VÉRIFICATION PROPRIÉTÉ SIMULATION
    const { data: simulation, error: simError } = await supabaseServiceRole
      .from("simulations")
      .select("id, user_id")
      .eq("id", simulationId)
      .eq("user_id", userId)
      .single();

    if (simError || !simulation) {
      throw new Error("Simulation non trouvée ou accès non autorisé");
    }

    // 6. CONVERSION Base64 → Binary
    const binaryString = atob(fileData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 7. GÉNÉRATION CHEMIN UNIQUE
    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const uniquePath = `${userId}/${timestamp}_${uniqueId}_${fileName}`;

    // 8. UPLOAD STORAGE
    const fileBlob = new Blob([bytes], { type: "application/octet-stream" });
    
    const { error: uploadError } = await supabaseServiceRole.storage
      .from("geometries")
      .upload(uniquePath, fileBlob, {
        contentType: "application/octet-stream",
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("Erreur upload:", uploadError);
      throw new Error(`Échec upload: ${uploadError.message}`);
    }

    // 9. URL PUBLIQUE
    const { data: urlData } = supabaseServiceRole.storage
      .from("geometries")
      .getPublicUrl(uniquePath);
    
    const fileUrl = urlData.publicUrl;

    // 10. DÉTECTION CONFIGURATION AUTOMATIQUE
    const geometryType = detectGeometryType(fileName);
    const solverSuggestion = detectSolverType(geometryType, fileExt);
    
    // Dimensions estimées par type de géométrie
    const estimatedDimensions = {
      '1d_rod': { width: 1000, height: 10, depth: 10 },
      '2d_plate': { width: 500, height: 300, depth: 10 },
      '3d_complex': { width: 100, height: 100, depth: 100 }
    }[geometryType] || { width: 100, height: 100, depth: 100 };
    
    const geometryTypeSimple = geometryType === '1d_rod' ? 'simple' : 'complex';

    // 11. MISE À JOUR SIMULATION
    const { error: updateError } = await supabaseServiceRole
      .from("simulations")
      .update({
        geometry_config: {
          file_url: fileUrl,
          file_path: uniquePath,
          file_name: fileName,
          file_size: bytes.length,
          uploaded_at: new Date().toISOString(),
          file_type: fileExt,
          dimensions: estimatedDimensions,
          geometry_type: geometryType,
          solver_suggestion: solverSuggestion,
          fortran_compatible: geometryType !== '3d_complex'
        },
        geometry_type: geometryTypeSimple,
        solver_type: solverSuggestion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", simulationId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Erreur DB:", updateError);
      throw new Error(`Échec mise à jour: ${updateError.message}`);
    }

    // 12. RÉPONSE SUCCÈS
    return new Response(
      JSON.stringify({
        success: true,
        fileUrl,
        fileName,
        fileSize: bytes.length,
        path: uniquePath,
        geometry_type: geometryTypeSimple,
        solver_suggestion: solverSuggestion,
        estimated_dimensions: estimatedDimensions,
        message: "Géométrie uploadée avec succès",
        metadata: {
          fortran_compatible: geometryType !== '3d_complex',
          recommended_mesh_density: geometryType === '1d_rod' ? 'high' : 'medium'
        }
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );

  } catch (error: any) {
    console.error("[UploadGeometry] Erreur:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Erreur inconnue",
        simulation_id: simulationId,
        user_id: userId
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
