import { createClient } from "npm:@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  Vary: "Origin",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed. Use POST." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let userId: string | null = null;
  let simulationId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Missing or invalid Authorization header.");
    }
    const token = authHeader.split(" ")[1];
    const { data: user, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL") as string,
      Deno.env.get("SUPABASE_ANON_KEY") as string
    ).auth.getUser(token);

    if (authError || !user?.user?.id) {
      throw new Error(`Authentication failed: ${authError?.message || "User ID not found."}`);
    }
    userId = user.user.id;

    const body = await req.json();
    const { fileName, fileData, simulation_id, geometry_config } = body ?? {};

    if (!fileName || !fileData || !simulation_id) {
      throw new Error("Missing required fields: fileName, fileData, simulation_id.");
    }
    simulationId = simulation_id;

    const allowedTypes = ["stl", "step", "stp", "obj", "iges", "igs", "vtp", "vti", "ply", "vtk"];
    const fileExt = fileName.toLowerCase().split(".").pop();
    if (!fileExt || !allowedTypes.includes(fileExt)) {
      throw new Error(`Unsupported format: ${fileExt}. Accepted: ${allowedTypes.join(", ")}.`);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Environment variables missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    }

    // Utiliser le service_role client pour l'upload
    const supabaseServiceRole = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const binaryString = atob(fileData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 9);
    // Chemin du fichier doit inclure l'ID utilisateur pour RLS
    const uniquePath = `${userId}/${timestamp}_${uniqueId}_${fileName}`;

    const fileBlob = new Blob([bytes], { type: "application/octet-stream" });

    const { error: uploadError } = await supabaseServiceRole.storage.from("geometries").upload(uniquePath, fileBlob, {
      contentType: "application/octet-octet-stream",
      upsert: false,
      cacheControl: "3600",
    });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabaseServiceRole.storage.from("geometries").getPublicUrl(uniquePath);
    const fileUrl = urlData.publicUrl;

    // Mettre à jour la simulation dans la base de données
    const { error: updateError } = await supabaseServiceRole
      .from("simulations")
      .update({
        geometry_config: {
          ...(geometry_config || {}),
          file_url: fileUrl,
          file_path: uniquePath,
          file_name: fileName,
          file_size: bytes.length,
          uploaded_at: new Date().toISOString(),
          file_type: fileExt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", simulationId)
      .eq("user_id", userId); // S'assurer que l'utilisateur est bien le propriétaire de la simulation

    if (updateError) {
      console.error("DB update error:", updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    return new Response(JSON.stringify({ success: true, fileUrl, fileName, fileSize: bytes.length, path: uniquePath, message: "File uploaded successfully." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[UploadGeometry] Critical Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "An unknown error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
