import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = prisma;
    const record = await client.userLayout.findUnique({ where: { userId: session.user.id } });
    return NextResponse.json(record?.layout ?? null);
  } catch (err) {
    console.error('GET /api/user/layout error', err);
    return NextResponse.json({ error: 'Failed to fetch layout' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    // Expect a JSON object describing layout (e.g., { selectedStreamers: [...] })
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = prisma;
    const existing = await client.userLayout.findUnique({ where: { userId: session.user.id } });
    if (existing) {
      await client.userLayout.update({ where: { userId: session.user.id }, data: { layout: body } });
    } else {
      await client.userLayout.create({ data: { userId: session.user.id, layout: body } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/user/layout error', err);
    return NextResponse.json({ error: 'Failed to save layout' }, { status: 500 });
  }
}
