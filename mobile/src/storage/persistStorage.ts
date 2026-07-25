import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const webStorage: StateStorage = {
  getItem: (name) => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(name);
  },
};

const nativeStorage: StateStorage = {
  getItem: async (name) => AsyncStorage.getItem(name),
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
  },
};

export function createAppJSONStorage() {
  return createJSONStorage(() => (Platform.OS === 'web' ? webStorage : nativeStorage));
}
