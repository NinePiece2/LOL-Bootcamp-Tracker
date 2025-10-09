import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getChampionNameById } from '@/lib/utils';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bootcamperId = url.searchParams.get('bootcamperId');
    const puuid = url.searchParams.get('puuid');

    if (!bootcamperId && !puuid) {
      return NextResponse.json({ error: 'bootcamperId or puuid required' }, { status: 400 });
    }

    // Find latest in-progress game for given bootcamperId or by puuid
    type Participant = {
      puuid?: string;
      championId?: number;
      championName?: string;
      summonerName?: string;
    };

    const findGameByBootcamperId = async (id: string) =>
      prisma.game.findFirst({
        where: { bootcamperId: id, status: { in: ['live', 'in_progress'] } },
        orderBy: { startedAt: 'desc' },
      });

    let gameRecord = null;

    if (bootcamperId) {
      gameRecord = await findGameByBootcamperId(bootcamperId);
    } else if (puuid) {
      // Resolve bootcamper by puuid and query by bootcamperId
      const bc = await prisma.bootcamper.findFirst({ where: { puuid } });
      if (bc) gameRecord = await findGameByBootcamperId(bc.id);
    }

    if (!gameRecord || !gameRecord.matchData) {
      return NextResponse.json({ championId: null, championName: null });
    }

    const matchData = gameRecord.matchData as { participants?: Participant[] };

    // Try to find participant by puuid if provided, otherwise try to match using bootcamperId -> puuid
    let participant: Participant | undefined;
    if (puuid && matchData.participants) {
      participant = matchData.participants.find((p) => p.puuid === puuid);
    }

    if (!participant && bootcamperId && matchData.participants) {
      const bc = await prisma.bootcamper.findUnique({ where: { id: bootcamperId } });
      if (bc) participant = matchData.participants.find((p) => p.puuid === bc.puuid || p.summonerName === bc.summonerName);
    }

    if (!participant) return NextResponse.json({ championId: null, championName: null });

    // Convert championId to championName if we have the ID but not the name
    let championName = participant.championName ?? null;
    if (!championName && participant.championId) {
      championName = await getChampionNameById(participant.championId);
    }

    return NextResponse.json({ championId: participant.championId ?? null, championName });
  } catch (err) {
    console.error('Error in current-champ route', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
