// src/components/DebugAuth.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import { supabase, testStorageConnection } from '@/lib/supabase';

export function DebugAuth() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      console.log('🔍 Lancement diagnostics Supabase...');
      
      // 1. Vérifier la session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // 2. Tester le storage
      const storageTest = await testStorageConnection();
      
      // 3. Tester l'upload
      let uploadTest = { success: false, message: 'Non testé' };
      if (session) {
        try {
          const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
          const testPath = `test/${Date.now()}_diagnostic.txt`;
          
          const { error: uploadError } = await supabase.storage
            .from('simulation-files')
            .upload(testPath, testFile);
          
          uploadTest = {
            success: !uploadError,
            message: uploadError ? uploadError.message : 'Upload test réussi'
          };
          
          // Nettoyer
          if (!uploadError) {
            await supabase.storage.from('simulation-files').remove([testPath]);
          }
        } catch (uploadErr: any) {
          uploadTest = { success: false, message: uploadErr.message };
        }
      }
      
      setResults({
        timestamp: new Date().toISOString(),
        session: {
          exists: !!session,
          user: session?.user,
          error: sessionError
        },
        storage: storageTest,
        upload: uploadTest
      });
      
      console.log('📊 Résultats diagnostics:', results);
    } catch (error) {
      console.error('❌ Erreur diagnostics:', error);
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-yellow-800 bg-yellow-900/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-yellow-600">
          <ShieldAlert className="w-5 h-5" />
          Diagnostics Supabase
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={runDiagnostics}
          disabled={loading}
          variant="outline"
          className="w-full border-yellow-700 text-yellow-600 hover:bg-yellow-900/20"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : null}
          Lancer les diagnostics
        </Button>
        
        {results && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-zinc-400">Session</div>
                <div className="flex items-center gap-1">
                  {results.session?.exists ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-500">Active</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-red-500">Inactive</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="text-zinc-400">Storage</div>
                <div className="flex items-center gap-1">
                  {results.storage?.success ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-500">OK</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-red-500">Erreur</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {results.session?.error && (
              <div className="p-2 bg-red-900/20 rounded text-xs">
                <div className="font-semibold text-red-400">Erreur session:</div>
                <div>{results.session.error.message}</div>
              </div>
            )}
            
            {results.storage?.auth?.message && (
              <div className="p-2 bg-blue-900/20 rounded text-xs">
                <div className="font-semibold">Auth:</div>
                <div>{results.storage.auth.message}</div>
              </div>
            )}
            
            {results.upload?.message && (
              <div className="p-2 bg-purple-900/20 rounded text-xs">
                <div className="font-semibold">Upload test:</div>
                <div>{results.upload.message}</div>
              </div>
            )}
            
            <div className="text-xs text-zinc-500">
              Timestamp: {new Date(results.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
