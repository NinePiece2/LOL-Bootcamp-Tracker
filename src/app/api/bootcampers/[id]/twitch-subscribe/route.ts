import { NextRequest, NextResponse } from 'next/server';
import { getTwitchClient } from '@/lib/twitch-api';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

const TWITCH_CALLBACK_URL = process.env.TWITCH_CALLBACK_URL || '';
const TWITCH_EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET || '';

/**
 * Subscribe a bootcamper to Twitch EventSub
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authenticated admin
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session.user.isAdmin) {
      return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
    }

    const { id } = await params;
    console.log('Attempting to subscribe bootcamper to Twitch EventSub:', id);
    
    // Skip EventSub in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Skipping Twitch EventSub subscription in development mode');
      return NextResponse.json({
        success: true,
        message: 'Twitch EventSub skipped in development mode',
        subscriptions: {
          online: null,
          offline: null,
        },
      });
    }
    
    // Check required environment variables
    if (!TWITCH_CALLBACK_URL) {
      console.error('TWITCH_CALLBACK_URL is not set');
      return NextResponse.json(
        { error: 'Twitch callback URL not configured' },
        { status: 500 }
      );
    }
    
    if (!TWITCH_EVENTSUB_SECRET) {
      console.error('TWITCH_EVENTSUB_SECRET is not set');
      return NextResponse.json(
        { error: 'Twitch EventSub secret not configured' },
        { status: 500 }
      );
    }
    
    const bootcamper = await prisma.bootcamper.findUnique({
      where: { id },
    });

    if (!bootcamper) {
      console.log('Bootcamper not found:', id);
      return NextResponse.json(
        { error: 'Bootcamper not found' },
        { status: 404 }
      );
    }

    if (!bootcamper.twitchUserId) {
      console.log('Bootcamper has no Twitch user ID:', { 
        id: bootcamper.id, 
        twitchLogin: bootcamper.twitchLogin,
        twitchUserId: bootcamper.twitchUserId 
      });
      return NextResponse.json(
        { error: 'Bootcamper does not have a Twitch account linked' },
        { status: 400 }
      );
    }

    console.log('Bootcamper details:', {
      id: bootcamper.id,
      twitchLogin: bootcamper.twitchLogin,
      twitchUserId: bootcamper.twitchUserId
    });

    const twitchClient = getTwitchClient();

    console.log('Creating EventSub subscriptions for user:', bootcamper.twitchUserId);
    console.log('Callback URL:', TWITCH_CALLBACK_URL);

    // Subscribe to stream.online
    console.log('Subscribing to stream.online...');
    const onlineSubscription = await twitchClient.subscribeToStreamOnline(
      bootcamper.twitchUserId,
      TWITCH_CALLBACK_URL,
      TWITCH_EVENTSUB_SECRET
    );
    console.log('Online subscription created:', onlineSubscription);

    // Subscribe to stream.offline
    console.log('Subscribing to stream.offline...');
    const offlineSubscription = await twitchClient.subscribeToStreamOffline(
      bootcamper.twitchUserId,
      TWITCH_CALLBACK_URL,
      TWITCH_EVENTSUB_SECRET
    );
    console.log('Offline subscription created:', offlineSubscription);

    return NextResponse.json({
      success: true,
      subscriptions: {
        online: onlineSubscription,
        offline: offlineSubscription,
      },
    });
  } catch (error) {
    console.error('Error subscribing to Twitch EventSub:', error);
    return NextResponse.json(
      { error: 'Failed to subscribe to Twitch EventSub' },
      { status: 500 }
    );
  }
}
