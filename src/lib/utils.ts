import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Cache for champion data
let championDataCache: { [key: string]: { id: string; name: string; key: string } } | null = null;
let championIdToNameMap: { [key: number]: string } | null = null;

/**
 * Fetch champion data from Data Dragon
 */
async function fetchChampionData() {
  if (championDataCache) return championDataCache;
  
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/cdn/13.24.1/data/en_US/champion.json');
    const data = await response.json();
    championDataCache = data.data;
    
    // Build championId -> championName map
    championIdToNameMap = {};
    for (const championName in championDataCache) {
      const champion = championDataCache[championName];
      championIdToNameMap[parseInt(champion.key)] = championName;
    }
    
    return championDataCache;
  } catch (error) {
    console.error('Failed to fetch champion data:', error);
    return null;
  }
}

/**
 * Convert championId to championName
 */
export async function getChampionNameById(championId: number): Promise<string | null> {
  if (!championIdToNameMap) {
    await fetchChampionData();
  }
  
  return championIdToNameMap?.[championId] || null;
}

/**
 * Convert multiple championIds to championNames
 */
export async function getChampionNamesByIds(championIds: number[]): Promise<{ [key: number]: string }> {
  if (!championIdToNameMap) {
    await fetchChampionData();
  }
  
  const result: { [key: number]: string } = {};
  for (const id of championIds) {
    const name = championIdToNameMap?.[id];
    if (name) {
      result[id] = name;
    }
  }
  
  return result;
}
