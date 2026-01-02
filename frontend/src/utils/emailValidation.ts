/**
 * Validation d'email robuste pour Supabase Auth
 * Évite les erreurs 400 "Unable to validate email address: invalid format"
 */

export const validateEmailForSupabase = (email: string): {
  isValid: boolean;
  normalizedEmail?: string;
  errors: string[];
} => {
  const errors: string[] = [];
  const trimmed = (email || '').trim();
  
  // 1. Vérification basique
  if (!trimmed) {
    errors.push('L\'email est requis');
    return { isValid: false, errors };
  }
  
  // 2. Conversion en minuscules (Supabase est case-sensitive)
  const normalized = trimmed.toLowerCase();
  
  // 3. Validation de longueur
  if (normalized.length > 254) {
    errors.push('Email trop long (max 254 caractères)');
  }
  
  if (normalized.length < 3) {
    errors.push('Email trop court');
  }
  
  // 4. Validation de format STRICTE (RFC 5322 simplifié)
  const emailRegex = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
  
  if (!emailRegex.test(normalized)) {
    errors.push('Format d\'email invalide');
  }
  
  // 5. Vérification des domaines invalides
  const invalidDomains = [
    'example.com', 'test.com', 'localhost', 
    '.local', '.test', '.example'
  ];
  
  const domain = normalized.split('@')[1];
  if (domain) {
    for (const invalid of invalidDomains) {
      if (domain.includes(invalid)) {
        errors.push(`Le domaine "${domain}" n'est pas autorisé`);
        break;
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    normalizedEmail: errors.length === 0 ? normalized : undefined,
    errors
  };
};

/**
 * Validation avant envoi OTP
 */
export const validateEmailBeforeOTP = (email: string): {
  success: boolean;
  email?: string;
  error?: string;
} => {
  const validation = validateEmailForSupabase(email);
  
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.errors[0] || 'Email invalide'
    };
  }
  
  return {
    success: true,
    email: validation.normalizedEmail
  };
};
