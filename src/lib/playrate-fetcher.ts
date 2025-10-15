import { prisma } from './db';

interface ChampionSummary {
  id: number;
  name: string;
}

interface PlayrateData {
  [championId: string]: {
    TOP: { playRate: number };
    JUNGLE: { playRate: number };
    MIDDLE: { playRate: number };
    BOTTOM: { playRate: number };
    UTILITY: { playRate: number };
  };
}

interface PlayrateResponse {
  data: PlayrateData;
  patch: string;
}

/**
 * Fetch champion playrate data from Community Dragon
 */
export async function fetchChampionPlayrates(): Promise<PlayrateResponse> {
  console.log('🎮 Fetching champion playrate data...');

  const allMerakiRoles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
  const allJsonRoles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'];

  // Fetch champion list
  const champsResponse = await fetch(
    'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json'
  );
  const champs: ChampionSummary[] = await champsResponse.json();

  // Initialize all_champs object
  const allChamps: PlayrateData = {};
  for (const champ of champs) {
    if (champ.id === -1) continue;
    allChamps[champ.id.toString()] = {
      TOP: { playRate: 0 },
      JUNGLE: { playRate: 0 },
      MIDDLE: { playRate: 0 },
      BOTTOM: { playRate: 0 },
      UTILITY: { playRate: 0 },
    };
  }

  // Fetch playrate data
  const dataResponse = await fetch(
    'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champion-statistics/global/default/rcp-fe-lol-champion-statistics.js'
  );
  const dataText = await dataResponse.text();

  // Parse each role's playrates
  for (let i = 0; i < allMerakiRoles.length; i++) {
    const merakiRole = allMerakiRoles[i];
    const jsonRole = allJsonRoles[i];

    const regex = new RegExp(`${jsonRole}":(.*?})`, 'g');
    const matches = dataText.match(regex);

    if (matches && matches.length > 0) {
      const match = matches[0];
      const roleData = match.replace(`${jsonRole}":`, '').replace(/\s/g, '');

      const pairs = roleData
        .substring(1, roleData.length - 1)
        .split(',')
        .map(pair => pair.split(':'));

      for (const [championId, rateStr] of pairs) {
        const cleanChampId = championId.replace(/"/g, '');
        const rate = parseFloat(rateStr);

        if (allChamps[cleanChampId] && merakiRole in allChamps[cleanChampId]) {
          const roleKey = merakiRole as keyof typeof allChamps[string];
          allChamps[cleanChampId][roleKey].playRate = Math.round(rate * 100 * 100000) / 100000;
        }
      }
    }
  }

  const versionResponse = await fetch(
    'https://raw.communitydragon.org/latest/content-metadata.json'
  );
  const versionData = await versionResponse.json();
  const versionSplit = versionData.version.split('.');
  const patch = `${versionSplit[0]}.${versionSplit[1]}`;

  console.log(`✅ Fetched playrates for ${Object.keys(allChamps).length} champions (Patch ${patch})`);

  return { data: allChamps, patch };
}

/**
 * Update database with fetched playrate data
 */
export async function updateChampionPlayrates(): Promise<void> {
  try {
    const { data, patch } = await fetchChampionPlayrates();

    console.log('💾 Updating database with playrate data...');

    let updatedCount = 0;
    for (const [championIdStr, rates] of Object.entries(data)) {
      const championId = parseInt(championIdStr);

      await prisma.championPlayrate.upsert({
        where: { championId },
        create: {
          championId,
          topRate: rates.TOP.playRate,
          jungleRate: rates.JUNGLE.playRate,
          midRate: rates.MIDDLE.playRate,
          adcRate: rates.BOTTOM.playRate,
          supportRate: rates.UTILITY.playRate,
          patch,
        },
        update: {
          topRate: rates.TOP.playRate,
          jungleRate: rates.JUNGLE.playRate,
          midRate: rates.MIDDLE.playRate,
          adcRate: rates.BOTTOM.playRate,
          supportRate: rates.UTILITY.playRate,
          patch,
          updatedAt: new Date(),
        },
      });

      updatedCount++;
    }

    console.log(`✅ Updated ${updatedCount} champion playrates in database (Patch ${patch})`);
  } catch (error) {
    console.error('❌ Error updating champion playrates:', error);
    throw error;
  }
}

/**
 * Get playrate data from database
 */
export async function getChampionPlayrates(): Promise<Map<number, {
  top: number;
  jungle: number;
  mid: number;
  adc: number;
  support: number;
}>> {
  const playrates = await prisma.championPlayrate.findMany();

  const map = new Map<number, { top: number; jungle: number; mid: number; adc: number; support: number }>();

  for (const pr of playrates) {
    map.set(pr.championId, {
      top: pr.topRate,
      jungle: pr.jungleRate,
      mid: pr.midRate,
      adc: pr.adcRate,
      support: pr.supportRate,
    });
  }

  return map;
}
