import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Debug endpoint to check environment variables
 * Only accessible to admins
 */
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const envCheck = {
      TWITCH_CLIENT_ID: !!process.env.TWITCH_CLIENT_ID,
      TWITCH_CLIENT_SECRET: !!process.env.TWITCH_CLIENT_SECRET,
      TWITCH_CALLBACK_URL: process.env.TWITCH_CALLBACK_URL || 'NOT_SET',
      TWITCH_EVENTSUB_SECRET: !!process.env.TWITCH_EVENTSUB_SECRET,
      NODE_ENV: process.env.NODE_ENV,
    };

    return NextResponse.json({
      message: 'Environment variables check',
      config: envCheck,
      warnings: [
        ...(!process.env.TWITCH_CLIENT_ID ? ['TWITCH_CLIENT_ID is not set'] : []),
        ...(!process.env.TWITCH_CLIENT_SECRET ? ['TWITCH_CLIENT_SECRET is not set'] : []),
        ...(!process.env.TWITCH_CALLBACK_URL ? ['TWITCH_CALLBACK_URL is not set'] : []),
        ...(!process.env.TWITCH_EVENTSUB_SECRET ? ['TWITCH_EVENTSUB_SECRET is not set'] : []),
      ]
    });
  } catch (error) {
    console.error('Error checking environment:', error);
    return NextResponse.json(
      { error: 'Failed to check environment' },
      { status: 500 }
    );
  }
}