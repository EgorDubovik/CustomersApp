import React, { createContext, useContext, useState, useEffect } from 'react';
import * as storage from '../utils/storage';

export interface User {
  name: string;
  email: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStoredData() {
      try {
        const storedToken = await storage.getItem('auth_token');
        const storedUser = await storage.getItem('auth_user');
        
        if (storedToken) {
          setToken(storedToken);
        }
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (e) {
            console.error('Failed to parse stored user JSON', e);
          }
        }
      } catch (e) {
        console.error('Failed to load auth data from storage', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadStoredData();
  }, []);

  const login = async (newToken: string, newUser: User) => {
    try {
      await storage.setItem('auth_token', newToken);
      await storage.setItem('auth_user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    } catch (e) {
      console.error('Failed to save auth data on login', e);
    }
  };

  const logout = async () => {
    try {
      await storage.removeItem('auth_token');
      await storage.removeItem('auth_user');
      setToken(null);
      setUser(null);
    } catch (e) {
      console.error('Failed to remove auth data on logout', e);
    }
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
