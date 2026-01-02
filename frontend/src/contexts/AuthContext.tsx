// Correction spécifique de la fonction signIn dans AuthContext.tsx
const signIn = useCallback(async (email: string) => {
  setLoading(true);
  setError(null);
  
  // VALIDATION CRITIQUE AVANT ENVOI
  const validation = validateEmailForAuth(email);
  if (!validation.valid) {
    setLoading(false);
    setError(validation.error || 'Email invalide');
    console.error('❌ Email invalide pour OTP:', email);
    return { error: new Error(validation.error) };
  }
  
  const trimmedEmail = email.trim().toLowerCase();
  
  try {
    // Configuration CORRECTE de l'OTP
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          email: trimmedEmail,
          created_at: new Date().toISOString()
        }
      }
    });
    
    setLoading(false);
    
    if (error) {
      // Gestion spécifique des erreurs OTP
      let userMessage = error.message;
      
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        userMessage = 'Trop de tentatives. Veuillez patienter quelques minutes.';
      } else if (error.message.includes('disabled')) {
        userMessage = 'L\'authentification par email est désactivée.';
      } else if (error.message.includes('invalid format')) {
        userMessage = 'Format d\'email invalide.';
      }
      
      setError(userMessage);
      console.error('❌ Erreur OTP détaillée:', {
        error,
        email: trimmedEmail,
        timestamp: new Date().toISOString()
      });
      return { error: new Error(userMessage) };
    }
    
    // Succès
    console.log('✅ OTP envoyé à:', trimmedEmail);
    return { error: null };
    
  } catch (e: any) {
    setLoading(false);
    const errorMessage = e.message || 'Erreur inattendue lors de l\'envoi de l\'OTP';
    setError(errorMessage);
    console.error('❌ Exception OTP:', e);
    return { error: new Error(errorMessage) };
  }
}, []);
