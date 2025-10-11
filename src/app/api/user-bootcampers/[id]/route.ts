import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Find association
    const assoc = await prisma.userBootcamper.findUnique({
      where: { id },
      select: { id: true, userId: true, bootcamperId: true },
    });

    if (!assoc) {
      return NextResponse.json({ error: 'Association not found' }, { status: 404 });
    }

    // Only owner or admin may delete association
    if (assoc.userId !== session.user.id && !session.user.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.userBootcamper.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting user bootcamper association:', err);
    return NextResponse.json({ error: 'Failed to delete association' }, { status: 500 });
  }
}
