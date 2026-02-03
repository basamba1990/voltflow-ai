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
  if (req.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { fileName, fileData, userId, simulationId, geometry_config } = body ?? {};

    if (!fileName || !fileData || !userId || !simulationId) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields: fileName, fileData, userId, simulationId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const allowedTypes = ["stl", "step", "stp", "obj", "iges", "igs", "vtp", "vti", "ply", "vtk"];
    const fileExt = fileName.toLowerCase().split(".").pop();
    if (!fileExt || !allowedTypes.includes(fileExt)) {
      return new Response(JSON.stringify({ success: false, error: `Format non supporté: ${fileExt}. Acceptés: ${allowedTypes.join(", ")}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Env variables missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // decode base64 to Uint8Array
    const binaryString = atob(fileData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const uniquePath = `${userId}/${timestamp}_${uniqueId}_${fileName}`;

    const fileBlob = new Blob([bytes], { type: "application/octet-stream" });

    const { error: uploadError } = await supabase.storage.from("simulation-files").upload(uniquePath, fileBlob, {
      contentType: "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });

    if (uploadError) {
      console.error("Storage error:", uploadError);
      throw new Error(`Storage error: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from("simulation-files").getPublicUrl(uniquePath);
    const fileUrl = (urlData as any).publicUrl;

    const { error: updateError } = await supabase
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
      .eq("id", simulationId);

    if (updateError) {
      console.error("DB update error:", updateError);
      throw new Error(`DB update error: ${updateError.message}`);
    }

    return new Response(JSON.stringify({ success: true, fileUrl, fileName, fileSize: bytes.length, path: uniquePath, message: "Fichier uploadé" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[UploadGeometry] Error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error?.message ?? error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
