import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import { toast } from 'sonner'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: any | null
  loading: boolean
  signIn: (provider?: 'github' | 'google' | 'email') => Promise<void>
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

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        // User doesn't exist in our database, create profile
        const { data: newProfile, error: createError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: user?.email || '',
            full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User',
            role: 'user',
            subscription_plan: 'starter',
            subscription_status: 'active',
            simulations_used: 0,
            simulations_limit: 10,
          })
          .select()
          .single()

        if (createError) throw createError
        setProfile(newProfile)
        return newProfile
      }

      setProfile(data)
      return data
    } catch (error) {
      console.error('Error fetching profile:', error)
      toast.error('Failed to load user profile')
      throw error
    }
  }

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true)
      
      try {
        // Get current session
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          setLoading(false)
          return
        }

        setSession(initialSession)
        setUser(initialSession?.user ?? null)

        if (initialSession?.user) {
          await fetchUserProfile(initialSession.user.id)
        }

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('Auth state changed:', event)
            
            setSession(newSession)
            setUser(newSession?.user ?? null)

            if (newSession?.user) {
              await fetchUserProfile(newSession.user.id)
            } else {
              setProfile(null)
            }

            setLoading(false)
          }
        )

        return () => subscription.unsubscribe()
        
      } catch (error) {
        console.error('Auth initialization error:', error)
        toast.error('Authentication error')
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  const signIn = async (provider: 'github' | 'google' | 'email' = 'github') => {
    setLoading(true)
    
    try {
      if (provider === 'email') {
        // Email/password login (implement as needed)
        throw new Error('Email login not implemented')
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${window.location.origin}/dashboard`,
            scopes: provider === 'github' ? 'read:user user:email' : undefined,
          },
        })

        if (error) throw error
      }
    } catch (error: any) {
      console.error('Sign in error:', error)
      toast.error(`Sign in failed: ${error.message}`)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    setLoading(true)
    
    try {
      const { error } = await supabase.auth.signOut()
      
      if (error) throw error

      setUser(null)
      setSession(null)
      setProfile(null)
      
      toast.success('Logged out successfully')
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
