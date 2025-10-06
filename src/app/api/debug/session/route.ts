import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Debug endpoint to check current session status
 */
export async function GET() {
  try {
    const session = await auth();
    
    return NextResponse.json({
      session: session ? {
        user: {
          id: session.user?.id,
          email: session.user?.email,
          name: session.user?.name,
          isAdmin: session.user?.isAdmin,
        }
      } : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error checking session:', error);
    return NextResponse.json(
      { error: 'Failed to check session' },
      { status: 500 }
    );
  }
}