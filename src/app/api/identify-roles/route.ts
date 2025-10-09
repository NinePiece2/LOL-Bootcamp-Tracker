import { NextRequest, NextResponse } from 'next/server';
import { identifyRoles } from '@/lib/role-identification';

export async function POST(request: NextRequest) {
  try {
    const { participants } = await request.json();

    if (!participants || !Array.isArray(participants)) {
      return NextResponse.json(
        { error: 'Invalid participants data' },
        { status: 400 }
      );
    }

    // Identify roles using the server-side algorithm
    const roleAssignments = await identifyRoles(participants);

    // Convert Map to object for JSON serialization
    const rolesObject: Record<string, string> = {};
    roleAssignments.forEach((role, puuid) => {
      rolesObject[puuid] = role;
    });

    return NextResponse.json({ roles: rolesObject });
  } catch (error) {
    console.error('Error identifying roles:', error);
    return NextResponse.json(
      { error: 'Failed to identify roles' },
      { status: 500 }
    );
  }
}
