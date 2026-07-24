import { Platform } from 'react-native';

import type { NutritionItem } from '@/types';
import { getBundledNutritionSeed, seedRowToNutritionItem } from './seed';

type NutritionDb = {
  init: () => Promise<void>;
  seed: () => Promise<number>;
  lookupByClassId: (classId: number) => Promise<NutritionItem | null>;
  lookupByIdentity: (identity: string) => Promise<NutritionItem | null>;
  search: (query: string, limit?: number) => Promise<NutritionItem[]>;
  listAll: () => Promise<NutritionItem[]>;
};

let backend: NutritionDb | null = null;
let ready = false;

function ensureMemoryItems(): NutritionItem[] {
  return getBundledNutritionSeed().map(seedRowToNutritionItem);
}

function createMemoryDb(): NutritionDb {
  let items: NutritionItem[] = [];

  return {
    async init() {
      if (items.length === 0) items = ensureMemoryItems();
    },
    async seed() {
      items = ensureMemoryItems();
      return items.length;
    },
    async lookupByClassId(classId) {
      return items.find((item) => item.classId === classId) ?? null;
    },
    async lookupByIdentity(identity) {
      return items.find((item) => item.itemIdentity === identity) ?? null;
    },
    async search(query, limit = 20) {
      const q = query.trim().toLowerCase();
      const filtered = !q
        ? [...items].sort((a, b) => a.nameEn.localeCompare(b.nameEn))
        : items.filter(
            (item) =>
              item.nameEn.toLowerCase().includes(q) ||
              (item.nameAr ?? '').toLowerCase().includes(q) ||
              item.itemIdentity.toLowerCase().includes(q),
          );
      return filtered.slice(0, limit);
    },
    async listAll() {
      return [...items].sort((a, b) => a.classId - b.classId);
    },
  };
}

async function createSqliteDb(): Promise<NutritionDb> {
  const SQLite = await import('expo-sqlite');
  type SqliteDatabase = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;
  const DB_NAME = 'calora_nutrition.db';
  let dbPromise: Promise<SqliteDatabase> | null = null;
  let seeded = false;

  async function getDb() {
    if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
    return dbPromise;
  }

  function mapRow(row: Record<string, unknown>): NutritionItem {
    return {
      classId: Number(row.class_id),
      itemIdentity: String(row.item_identity),
      nameEn: String(row.name_en),
      nameAr: (row.name_ar as string | null) ?? null,
      caloriesKcal: Number(row.calories_kcal),
      proteinG: Number(row.protein_g),
      carbsG: Number(row.carbs_g),
      fatG: Number(row.fat_g),
      servingSizeG: Number(row.serving_size_g),
      servingLabelEn: String(row.serving_label_en ?? 'serving'),
      servingLabelAr: (row.serving_label_ar as string | null) ?? null,
      category: (row.category as string | null) ?? null,
    };
  }

  const api: NutritionDb = {
    async init() {
      const db = await getDb();
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS nutrition_items (
          class_id INTEGER PRIMARY KEY NOT NULL,
          item_identity TEXT NOT NULL UNIQUE,
          name_en TEXT NOT NULL,
          name_ar TEXT,
          calories_kcal REAL NOT NULL DEFAULT 0,
          protein_g REAL NOT NULL DEFAULT 0,
          carbs_g REAL NOT NULL DEFAULT 0,
          fat_g REAL NOT NULL DEFAULT 0,
          serving_size_g REAL NOT NULL DEFAULT 100,
          serving_label_en TEXT DEFAULT 'serving',
          serving_label_ar TEXT,
          category TEXT
        );
        CREATE INDEX IF NOT EXISTS nutrition_name_en_idx ON nutrition_items (name_en);
        CREATE INDEX IF NOT EXISTS nutrition_identity_idx ON nutrition_items (item_identity);
      `);

      const countRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM nutrition_items',
      );
      if ((countRow?.count ?? 0) === 0) {
        await api.seed();
      }
      seeded = true;
    },
    async seed() {
      const db = await getDb();
      const rows = getBundledNutritionSeed();
      await db.withTransactionAsync(async () => {
        for (const row of rows) {
          await db.runAsync(
            `INSERT OR REPLACE INTO nutrition_items (
              class_id, item_identity, name_en, name_ar,
              calories_kcal, protein_g, carbs_g, fat_g,
              serving_size_g, serving_label_en, serving_label_ar, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.class_id,
              row.item_identity,
              row.name_en,
              row.name_ar,
              row.calories_kcal,
              row.protein_g,
              row.carbs_g,
              row.fat_g,
              row.serving_size_g,
              row.serving_label_en,
              row.serving_label_ar,
              row.category,
            ],
          );
        }
      });
      seeded = true;
      return rows.length;
    },
    async lookupByClassId(classId) {
      if (!seeded) await api.init();
      const db = await getDb();
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM nutrition_items WHERE class_id = ? LIMIT 1',
        [classId],
      );
      return row ? mapRow(row) : null;
    },
    async lookupByIdentity(identity) {
      if (!seeded) await api.init();
      const db = await getDb();
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM nutrition_items WHERE item_identity = ? LIMIT 1',
        [identity],
      );
      return row ? mapRow(row) : null;
    },
    async search(query, limit = 20) {
      if (!seeded) await api.init();
      const db = await getDb();
      const q = `%${query.trim()}%`;
      if (!query.trim()) {
        const rows = await db.getAllAsync<Record<string, unknown>>(
          'SELECT * FROM nutrition_items ORDER BY name_en ASC LIMIT ?',
          [limit],
        );
        return rows.map(mapRow);
      }
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM nutrition_items
         WHERE name_en LIKE ? OR name_ar LIKE ? OR item_identity LIKE ?
         ORDER BY name_en ASC
         LIMIT ?`,
        [q, q, q, limit],
      );
      return rows.map(mapRow);
    },
    async listAll() {
      if (!seeded) await api.init();
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM nutrition_items ORDER BY class_id ASC',
      );
      return rows.map(mapRow);
    },
  };

  return api;
}

async function getBackend(): Promise<NutritionDb> {
  if (backend) return backend;
  if (Platform.OS === 'web') {
    backend = createMemoryDb();
  } else {
    try {
      backend = await createSqliteDb();
    } catch (err) {
      console.warn('[calora/db] sqlite unavailable, using memory seed', err);
      backend = createMemoryDb();
    }
  }
  return backend;
}

export async function initNutritionDb(): Promise<void> {
  const db = await getBackend();
  await db.init();
  ready = true;
}

export async function seedNutritionDb(): Promise<number> {
  const db = await getBackend();
  return db.seed();
}

export async function lookupByClassId(classId: number): Promise<NutritionItem | null> {
  if (!ready) await initNutritionDb();
  return (await getBackend()).lookupByClassId(classId);
}

export async function lookupByIdentity(identity: string): Promise<NutritionItem | null> {
  if (!ready) await initNutritionDb();
  return (await getBackend()).lookupByIdentity(identity);
}

export async function searchNutrition(
  query: string,
  limit = 20,
): Promise<NutritionItem[]> {
  if (!ready) await initNutritionDb();
  return (await getBackend()).search(query, limit);
}

export async function listAllNutrition(): Promise<NutritionItem[]> {
  if (!ready) await initNutritionDb();
  return (await getBackend()).listAll();
}

/** In-memory fallback when SQLite is unavailable (web / rare Expo Go issues). */
export function getInMemoryNutrition(): NutritionItem[] {
  return ensureMemoryItems();
}
