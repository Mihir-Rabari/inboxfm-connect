import React, { createContext, useContext, useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import { Project, User } from '../api/types'

interface AuthContextType {
  user: User | null
  currentProject: Project | null
  projects: Project[]
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  signIn: (token: string, user: User, projectId?: string) => void
  signOut: () => void
  setCurrentProject: (project: Project) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => apiClient.getToken())
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const setCurrentProject = (project: Project) => {
    setCurrentProjectState(project)
    apiClient.setProjectId(project.id)
  }

  const signIn = (newToken: string, newUser: User, projectId?: string) => {
    apiClient.setToken(newToken)
    setToken(newToken)
    setUser(newUser)
    persistUser(newUser)
    if (projectId) {
      apiClient.setProjectId(projectId)
      const proj = projects.find((p) => p.id === projectId) || {
        id: projectId,
        displayName: 'Default Project',
        platformId: newUser.platformId ?? 'default',
      }
      setCurrentProjectState(proj)
    }
  }

  const signOut = () => {
    apiClient.setToken(null)
    apiClient.setProjectId(null)
    clearPersistedUser()
    setToken(null)
    setUser(null)
    setProjects([])
    setCurrentProjectState(null)
  }

  useEffect(() => {
    async function loadSession() {
      const storedToken = apiClient.getToken()
      if (!storedToken) {
        // Mock default dev developer principal when running locally without explicit token
        const devUser: User = {
          id: 'usr_developer',
          email: 'developer@inboxfm.local',
          firstName: 'Developer',
          lastName: 'Console',
          platformRole: 'ADMIN',
        }
        const devProject: Project = {
          id: 'proj_default',
          displayName: 'InboxFM Main Project',
          platformId: 'platform_main',
        }
        setUser(devUser)
        setProjects([devProject])
        setCurrentProjectState(devProject)
        apiClient.setProjectId(devProject.id)
        setIsLoading(false)
        return
      }

      try {
        // Identity comes from the session persisted at sign-in — the backend has no
        // `GET /users/me` (only `GET /users/:id` and `POST /users/me`), so calling
        // `/users/me` always 400'd and dropped every real session into the mock
        // fallback below. `GET /projects` is a real authenticated route, so it both
        // validates the stored token and yields the project list.
        const persistedUser = readPersistedUser()
        if (persistedUser) {
          setUser(persistedUser)
        }

        const projectsData = await apiClient.get<{ data: Project[] }>('/projects')
        const loadedProjects = projectsData.data || []
        setProjects(loadedProjects)

        const storedProjectId = apiClient.getProjectId()
        const matched = loadedProjects.find((p) => p.id === storedProjectId) || loadedProjects[0]
        if (matched) {
          setCurrentProject(matched)
        }

        if (!persistedUser) {
          // Token is valid but we never stored the identity (e.g. token seeded
          // out-of-band). Keep the session authenticated without fabricating a user.
          setUser({
            id: 'session',
            email: '',
            firstName: '',
            lastName: '',
          })
        }
      } catch (err) {
        console.warn('Session load failed, falling back to local developer session', err)
        const devUser: User = {
          id: 'usr_developer',
          email: 'developer@inboxfm.local',
          firstName: 'Developer',
          lastName: 'Console',
          platformRole: 'ADMIN',
        }
        const devProject: Project = {
          id: 'proj_default',
          displayName: 'InboxFM Main Project',
          platformId: 'platform_main',
        }
        setUser(devUser)
        setProjects([devProject])
        setCurrentProjectState(devProject)
        apiClient.setProjectId(devProject.id)
      } finally {
        setIsLoading(false)
      }
    }

    void loadSession()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        currentProject,
        projects,
        token,
        isAuthenticated: !!user,
        isLoading,
        signIn,
        signOut,
        setCurrentProject,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const PERSISTED_USER_KEY = 'ap-user'

function persistUser(user: User): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PERSISTED_USER_KEY, JSON.stringify(user))
}

function readPersistedUser(): User | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(PERSISTED_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

function clearPersistedUser(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(PERSISTED_USER_KEY)
}
