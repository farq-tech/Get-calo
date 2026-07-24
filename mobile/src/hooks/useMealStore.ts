import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Platform } from 'react-native';

export interface SavedMeal {
  id: string;
  name: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingLabel: string;
  confidence: number;
  imageUri?: string;
  savedAt: string;
}

interface MealState {
  meals: SavedMeal[];
  addMeal: (meal: Omit<SavedMeal, 'id' | 'savedAt'>) => SavedMeal;
  clearMeals: () => void;
}

const webStorage = {
  getItem: (name: string) => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(name);
  },
};

export const useMealStore = create<MealState>()(
  persist(
    (set) => ({
      meals: [],
      addMeal: (meal) => {
        const saved: SavedMeal = {
          ...meal,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          savedAt: new Date().toISOString(),
        };
        set((state) => ({ meals: [saved, ...state.meals].slice(0, 200) }));
        return saved;
      },
      clearMeals: () => set({ meals: [] }),
    }),
    {
      name: 'calora-meals-v1',
      storage: createJSONStorage(() =>
        Platform.OS === 'web' ? webStorage : webStorage,
      ),
      partialize: (state) => ({
        meals: state.meals.map((m) => ({
          ...m,
          // Don't persist huge data URLs
          imageUri: m.imageUri?.startsWith('data:') ? undefined : m.imageUri,
        })),
      }),
    },
  ),
);
