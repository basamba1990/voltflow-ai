import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import { toast } from 'sonner'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: any | null
  loading: boolean
  signIn: (provider?: 'github' | 'google') => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (data: Partial<any>) => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  updateProfile: async () => {},
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  // Fonction pour obtenir l'URL de redirection dynamique
  const getRedirectUrl = () => {
    if (typeof window === 'undefined') return ''
    
    // En production, utilisez l'URL actuelle
    const currentUrl = window.location.origin
    console.log('Current URL for redirect:', currentUrl)
    
    // Ajoute /dashboard à la fin
    return `${currentUrl}/dashboard`
  }

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {
      console.log('Fetching profile for user:', userId)
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // User doesn't exist in our database yet, create profile
          console.log('User profile not found, creating...')
          return await createUserProfile(userId)
        }
        console.error('Error fetching profile:', error)
        throw error
      }

      console.log('Profile fetched successfully:', data)
      setProfile(data)
      return data
    } catch (error: any) {
      console.error('Error in fetchUserProfile:', error)
      toast.error('Failed to load user profile')
      throw error
    }
  }, [])

  const createUserProfile = async (userId: string) => {
    try {
      console.log('Creating user profile for:', userId)
      
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) throw new Error('No authenticated user found')

      const { data, error } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || 
                    authUser.user_metadata?.user_name || 
                    authUser.email?.split('@')[0] || 
                    'User',
          avatar_url: authUser.user_metadata?.avatar_url || 
                     authUser.user_metadata?.picture,
          role: 'user',
          subscription_plan: 'starter',
          subscription_status: 'active',
          simulations_used: 0,
          simulations_limit: 10,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating user profile:', error)
        throw error
      }

      console.log('User profile created:', data)
      setProfile(data)
      return data
    } catch (error: any) {
      console.error('Error in createUserProfile:', error)
      throw error
    }
  }

  const initializeAuth = useCallback(async () => {
    try {
      setLoading(true)
      console.log('Initializing auth...')

      // First, check for OAuth errors in URL
      const urlParams = new URLSearchParams(window.location.search)
      const error = urlParams.get('error')
      const errorDescription = urlParams.get('error_description')

      if (error) {
        console.error('OAuth error from URL:', error, errorDescription)
        toast.error(`Authentication error: ${errorDescription || error}`)
        
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname)
      }

      // Get current session
      const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('Session error:', sessionError)
        setLoading(false)
        return
      }

      console.log('Initial session:', initialSession)
      setSession(initialSession)
      setUser(initialSession?.user ?? null)

      if (initialSession?.user) {
        console.log('User found, fetching profile...')
        await fetchUserProfile(initialSession.user.id)
      } else {
        console.log('No user found')
        setProfile(null)
      }

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, newSession) => {
          console.log('Auth state changed:', event, newSession?.user?.id)
          
          setSession(newSession)
          setUser(newSession?.user ?? null)

          if (newSession?.user) {
            console.log('New user authenticated, fetching profile...')
            await fetchUserProfile(newSession.user.id)
          } else {
            console.log('User signed out, clearing profile')
            setProfile(null)
          }

          setLoading(false)
        }
      )

      setInitialized(true)
      setLoading(false)

      return () => {
        subscription.unsubscribe()
      }
      
    } catch (error) {
      console.error('Auth initialization error:', error)
      toast.error('Authentication system error')
      setLoading(false)
    }
  }, [fetchUserProfile])

  useEffect(() => {
    if (!initialized) {
      initializeAuth()
    }
  }, [initialized, initializeAuth])

  const signIn = async (provider: 'github' | 'google' = 'github') => {
    try {
      setLoading(true)
      console.log(`Signing in with ${provider}...`)
      
      const redirectUrl = getRedirectUrl()
      console.log('Redirect URL:', redirectUrl)

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          scopes: provider === 'github' ? 'read:user user:email' : undefined,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      if (error) {
        console.error('Sign in error:', error)
        throw error
      }

      // Note: signInWithOAuth will redirect the user, so code after this won't run
      // until the user returns from OAuth provider
      
    } catch (error: any) {
      console.error('Sign in failed:', error)
      
      let errorMessage = 'Sign in failed'
      if (error.message.includes('popup')) {
        errorMessage = 'Please disable popup blocker for this site'
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection'
      } else if (error.message.includes('configuration')) {
        errorMessage = 'Authentication not configured. Please contact support'
      }
      
      toast.error(errorMessage)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      console.log('Signing out...')
      
      const { error } = await supabase.auth.signOut()
      
      if (error) throw error

      setUser(null)
      setSession(null)
      setProfile(null)
      
      toast.success('Logged out successfully')
      
      // Redirect to home
      window.location.href = '/'
    } catch (error: any) {
      console.error('Sign out error:', error)
      toast.error(`Logout failed: ${error.message}`)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.id)
    }
  }

  const updateProfile = async (data: Partial<any>) => {
    if (!user) throw new Error('Not authenticated')

    try {
      const { data: updatedProfile, error } = await supabase
        .from('users')
        .update(data)
        .eq('id', user.id)
        .select()
        .single()

      if (error) throw error
      
      setProfile(updatedProfile)
      toast.success('Profile updated successfully')
      return updatedProfile
    } catch (error: any) {
      console.error('Update profile error:', error)
      toast.error(`Failed to update profile: ${error.message}`)
      throw error
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signOut,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
