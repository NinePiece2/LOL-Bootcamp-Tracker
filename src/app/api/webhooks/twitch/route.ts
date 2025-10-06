import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/db';
import {
  TwitchStreamOnlineEvent,
  TwitchStreamOfflineEvent,
} from '@/lib/types';

const TWITCH_EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET || '';

interface TwitchEventSubNotification {
  subscription: {
    id: string;
    type: string;
    version: string;
    status: string;
    cost: number;
    condition: Record<string, string>;
    created_at: string;
  };
  event: TwitchStreamOnlineEvent | TwitchStreamOfflineEvent | Record<string, unknown>;
}

interface TwitchEventSubChallenge {
  challenge: string;
  subscription: {
    id: string;
    type: string;
    version: string;
    status: string;
    cost: number;
    condition: Record<string, string>;
    created_at: string;
  };
}

/**
 * Verify Twitch EventSub signature
 */
function verifySignature(request: NextRequest, body: string): boolean {
  const messageId = request.headers.get('twitch-eventsub-message-id');
  const timestamp = request.headers.get('twitch-eventsub-message-timestamp');
  const signature = request.headers.get('twitch-eventsub-message-signature');

  if (!messageId || !timestamp || !signature) {
    return false;
  }

  const message = messageId + timestamp + body;
  const hmac = createHmac('sha256', TWITCH_EVENTSUB_SECRET);
  hmac.update(message);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  return signature === expectedSignature;
}

/**
 * Handle stream.online event
 */
async function handleStreamOnline(event: TwitchStreamOnlineEvent) {
  console.log(`Stream online: ${event.broadcaster_user_login}`);

  const bootcamper = await prisma.bootcamper.findFirst({
    where: { twitchUserId: event.broadcaster_user_id },
  });

  if (!bootcamper) {
    console.warn(`No bootcamper found for Twitch user ${event.broadcaster_user_login}`);
    return;
  }

  // Find existing stream record
  const existingStream = await prisma.twitchStream.findFirst({
    where: { bootcamperId: bootcamper.id },
    orderBy: { startedAt: 'desc' },
  });

  if (existingStream) {
    // Update existing stream
    await prisma.twitchStream.update({
      where: { id: existingStream.id },
      data: {
        live: true,
        startedAt: new Date(event.started_at),
        endedAt: null,
        twitchUserId: event.broadcaster_user_id,
        streamUrl: `https://www.twitch.tv/${event.broadcaster_user_login}`,
      },
    });
  } else {
    // Create new stream record
    await prisma.twitchStream.create({
      data: {
        bootcamperId: bootcamper.id,
        twitchUserId: event.broadcaster_user_id,
        streamUrl: `https://www.twitch.tv/${event.broadcaster_user_login}`,
        live: true,
        startedAt: new Date(event.started_at),
      },
    });
  }

  // TODO: Emit WebSocket event for stream online
}

/**
 * Handle stream.offline event
 */
async function handleStreamOffline(event: TwitchStreamOfflineEvent) {
  console.log(`Stream offline: ${event.broadcaster_user_login}`);

  const bootcamper = await prisma.bootcamper.findFirst({
    where: { twitchUserId: event.broadcaster_user_id },
  });

  if (!bootcamper) {
    console.warn(`No bootcamper found for Twitch user ${event.broadcaster_user_login}`);
    return;
  }

  // Update stream record
  await prisma.twitchStream.updateMany({
    where: {
      bootcamperId: bootcamper.id,
      live: true,
    },
    data: {
      live: false,
      endedAt: new Date(),
    },
  });

  // TODO: Emit WebSocket event for stream offline
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // Verify signature
    if (!verifySignature(request, body)) {
      console.error('Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const data = JSON.parse(body) as (TwitchEventSubNotification | TwitchEventSubChallenge);
    const messageType = request.headers.get('twitch-eventsub-message-type');

    // Handle webhook verification challenge
    if (messageType === 'webhook_callback_verification') {
      const challenge = (data as TwitchEventSubChallenge).challenge;
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Handle notification
    if (messageType === 'notification') {
      const notification = data as TwitchEventSubNotification;
      const eventType = notification.subscription.type;

      switch (eventType) {
        case 'stream.online':
          await handleStreamOnline(notification.event as TwitchStreamOnlineEvent);
          break;
        case 'stream.offline':
          await handleStreamOffline(notification.event as TwitchStreamOfflineEvent);
          break;
        default:
          console.warn(`Unknown event type: ${eventType}`);
      }

      return NextResponse.json({ success: true });
    }

    // Handle revocation
    if (messageType === 'revocation') {
      console.warn('Subscription revoked:', data.subscription);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown message type' }, { status: 400 });
  } catch (error) {
    console.error('Error processing Twitch webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
