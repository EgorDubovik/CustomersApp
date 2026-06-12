import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme as useColorSchemeCore } from 'react-native';
import * as storage from '../utils/storage';

export type AppTheme = 'system' | 'light' | 'dark';
export type NavigationMap = 'apple' | 'google';

interface SettingsContextType {
  theme: AppTheme;
  navigationMap: NavigationMap;
  resolvedTheme: 'light' | 'dark';
  isSettingsLoading: boolean;
  setTheme: (theme: AppTheme) => Promise<void>;
  setNavigationMap: (map: NavigationMap) => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('system');
  const [navigationMap, setNavigationMapState] = useState<NavigationMap>('apple');
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  const systemTheme = useColorSchemeCore();

  useEffect(() => {
    async function loadSettings() {
      try {
        const storedTheme = await storage.getItem('setting_theme');
        const storedMap = await storage.getItem('setting_navigation_map');

        if (storedTheme) {
          setThemeState(storedTheme as AppTheme);
        }
        if (storedMap) {
          setNavigationMapState(storedMap as NavigationMap);
        }
      } catch (e) {
        console.error('Failed to load settings from storage', e);
      } finally {
        setIsSettingsLoading(false);
      }
    }
    loadSettings();
  }, []);

  const setTheme = async (newTheme: AppTheme) => {
    setThemeState(newTheme);
    try {
      await storage.setItem('setting_theme', newTheme);
    } catch (e) {
      console.error('Failed to save theme setting', e);
    }
  };

  const setNavigationMap = async (newMap: NavigationMap) => {
    setNavigationMapState(newMap);
    try {
      await storage.setItem('setting_navigation_map', newMap);
    } catch (e) {
      console.error('Failed to save navigation map setting', e);
    }
  };

  const resolvedTheme = theme === 'system'
    ? (systemTheme === 'unspecified' || !systemTheme ? 'light' : systemTheme) as 'light' | 'dark'
    : theme;

  return (
    <SettingsContext.Provider
      value={{
        theme,
        navigationMap,
        resolvedTheme,
        isSettingsLoading,
        setTheme,
        setNavigationMap,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
