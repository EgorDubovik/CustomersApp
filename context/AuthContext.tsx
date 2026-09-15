import React, { createContext, useContext, useState, useEffect } from 'react';
import * as storage from '../utils/storage';
import { API_URL } from '../constants/Config';

export interface User {
  id?: number;
  name: string;
  email: string;
  phone?: string;
  company_id?: number;
  color?: string;
  roles_ids?: number[];
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

export interface CompanyEmployee {
  id: number;
  name: string;
  color: string;
  active?: number;
  roles_ids?: number[];
}

export interface CompanyPhone {
  id: number;
  phone: string;
  description?: string;
  color?: string;
  is_primary?: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  companySettings: CompanySettings | null;
  companyServices: CompanyService[];
  companyEmployees: CompanyEmployee[];
  companyPhones: CompanyPhone[];
  /** Admin or dispatcher — everything a technician-only account can't see (Calls tab, …) */
  isStaff: boolean;
  /** Company-wide unread calls + texts; seeded by initial-data, kept fresh by the socket */
  callsUnread: number;
  setCallsUnread: (n: number) => void;
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
  const [companyEmployees, setCompanyEmployees] = useState<CompanyEmployee[]>([]);
  const [companyPhones, setCompanyPhones] = useState<CompanyPhone[]>([]);
  const [callsUnread, setCallsUnread] = useState(0);

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
        if (data.user) {
          setUser(data.user);
          await storage.setItem('auth_user', JSON.stringify(data.user));
        }
        if (data.companySettings) {
          setCompanySettings(data.companySettings);
          await storage.setItem('company_settings', JSON.stringify(data.companySettings));
        }
        if (data.companyServices) {
          setCompanyServices(data.companyServices);
          await storage.setItem('company_services', JSON.stringify(data.companyServices));
        }
        if (data.companyEmployees) {
          // Keep only the fields the app needs — the full payload carries presence/roles we don't use
          const employees: CompanyEmployee[] = data.companyEmployees.map((e: any) => ({
            id: e.id,
            name: e.name,
            color: e.color,
            active: e.active,
            roles_ids: e.roles_ids,
          }));
          setCompanyEmployees(employees);
          await storage.setItem('company_employees', JSON.stringify(employees));
        }
        if (typeof data.callsUnread === 'number') setCallsUnread(data.callsUnread);
        if (Array.isArray(data.companyPhoneNumbers)) {
          const phones: CompanyPhone[] = data.companyPhoneNumbers.map((p: any) => ({
            id: p.id,
            phone: p.phone,
            description: p.description,
            color: p.color,
            is_primary: p.is_primary,
          }));
          setCompanyPhones(phones);
          await storage.setItem('company_phones', JSON.stringify(phones));
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
        const storedEmployees = await storage.getItem('company_employees');
        const storedPhones = await storage.getItem('company_phones');
        
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
        if (storedEmployees) {
          try {
            setCompanyEmployees(JSON.parse(storedEmployees));
          } catch (e) {
            console.error('Failed to parse stored company employees JSON', e);
          }
        }
        if (storedPhones) {
          try {
            setCompanyPhones(JSON.parse(storedPhones));
          } catch (e) {
            console.error('Failed to parse stored company phones JSON', e);
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
      await storage.removeItem('company_employees');
      await storage.removeItem('company_phones');
      setToken(null);
      setUser(null);
      setCompanySettings(null);
      setCompanyServices([]);
      setCompanyEmployees([]);
      setCompanyPhones([]);
      setCallsUnread(0);
    } catch (e) {
      console.error('Failed to remove auth data on logout', e);
    }
  };

  // Role ids: 1 admin, 2 technician, 3 dispatcher (nestjs/src/auth/enums/role.enum.ts)
  const isStaff = !!user?.roles_ids?.some((r) => r === 1 || r === 3);

  return (
    <AuthContext.Provider
      value={{ token, user, isLoading, companySettings, companyServices, companyEmployees, companyPhones, isStaff, callsUnread, setCallsUnread, login, logout, fetchInitialData }}
    >
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
