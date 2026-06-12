import { useContext } from 'react';
import { SettingsContext } from '@/context/SettingsContext';

export const useColorScheme = () => {
  const context = useContext(SettingsContext);
  return context?.resolvedTheme || 'light';
};
