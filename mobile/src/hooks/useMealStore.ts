import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createAppJSONStorage } from '@/storage/persistStorage';

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
  removeMeal: (id: string) => void;
  clearMeals: () => void;
}

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
      removeMeal: (id) => set((state) => ({ meals: state.meals.filter((m) => m.id !== id) })),
      clearMeals: () => set({ meals: [] }),
    }),
    {
      name: 'calora-meals-v1',
      storage: createAppJSONStorage(),
      partialize: (state) => ({
        meals: state.meals.map((m) => ({
          ...m,
          imageUri: m.imageUri?.startsWith('data:') ? undefined : m.imageUri,
        })),
      }),
    },
  ),
);
