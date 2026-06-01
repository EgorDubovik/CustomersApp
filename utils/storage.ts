import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const setItem = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('Error writing to localStorage', e);
    }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

export const getItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error('Error reading from localStorage', e);
      return null;
    }
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

export const removeItem = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('Error deleting from localStorage', e);
    }
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};
