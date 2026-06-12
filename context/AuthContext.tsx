import React, { createContext, useContext, useState, useEffect } from 'react';
import * as storage from '../utils/storage';
import { API_URL } from '../constants/Config';

export interface User {
  name: string;
  email: string;
}

export interface CompanySettings {
  timerEnabled?: string;
  [key: string]: any;
}

export interface CompanyService {
  id: number;
  title: string;
  description: string;
  price: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  companySettings: CompanySettings | null;
  companyServices: CompanyService[];
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  fetchInitialData: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [companyServices, setCompanyServices] = useState<CompanyService[]>([]);

  const fetchInitialData = async (activeToken: string) => {
    try {
      const response = await fetch(`${API_URL}/initial-data`, {
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Accept': 'application/json',
        },
      });
      if (response.status === 200 || response.status === 201) {
        const data = await response.json();
        if (data.companySettings) {
          setCompanySettings(data.companySettings);
          await storage.setItem('company_settings', JSON.stringify(data.companySettings));
        }
        if (data.companyServices) {
          setCompanyServices(data.companyServices);
          await storage.setItem('company_services', JSON.stringify(data.companyServices));
        }
      }
    } catch (e) {
      console.error('Failed to fetch initial data', e);
    }
  };

  useEffect(() => {
    async function loadStoredData() {
      try {
        const storedToken = await storage.getItem('auth_token');
        const storedUser = await storage.getItem('auth_user');
        const storedSettings = await storage.getItem('company_settings');
        const storedServices = await storage.getItem('company_services');
        
        if (storedToken) {
          setToken(storedToken);
          // Fetch fresh settings from api in background
          fetchInitialData(storedToken);
        }
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (e) {
            console.error('Failed to parse stored user JSON', e);
          }
        }
        if (storedSettings) {
          try {
            setCompanySettings(JSON.parse(storedSettings));
          } catch (e) {
            console.error('Failed to parse stored company settings JSON', e);
          }
        }
        if (storedServices) {
          try {
            setCompanyServices(JSON.parse(storedServices));
          } catch (e) {
            console.error('Failed to parse stored company services JSON', e);
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
      // Fetch settings immediately on login
      await fetchInitialData(newToken);
    } catch (e) {
      console.error('Failed to save auth data on login', e);
    }
  };

  const logout = async () => {
    try {
      await storage.removeItem('auth_token');
      await storage.removeItem('auth_user');
      await storage.removeItem('company_settings');
      await storage.removeItem('company_services');
      setToken(null);
      setUser(null);
      setCompanySettings(null);
      setCompanyServices([]);
    } catch (e) {
      console.error('Failed to remove auth data on logout', e);
    }
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, companySettings, companyServices, login, logout, fetchInitialData }}>
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
