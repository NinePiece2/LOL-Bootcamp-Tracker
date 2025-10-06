# Twitch EventSub Development Setup

## For Development Mode
The application automatically skips Twitch EventSub subscriptions when running in development mode (`NODE_ENV=development`).

## For Testing Twitch EventSub in Development

If you need to test Twitch EventSub functionality during development, you'll need to:

1. **Install ngrok**: `npm install -g ngrok` or download from https://ngrok.com
2. **Start your dev server**: `npm run dev`
3. **Create HTTPS tunnel**: `ngrok http 3000`
4. **Update environment variables**:
   ```bash
   TWITCH_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/webhooks/twitch
   TWITCH_EVENTSUB_SECRET=your-secret-here
   ```
5. **Restart your dev server**

## Production Setup

For production, ensure:
- `TWITCH_CALLBACK_URL` points to your production domain with HTTPS
- `TWITCH_EVENTSUB_SECRET` is set to a secure random string
- Your webhook endpoint is publicly accessible

## Required Environment Variables

```bash
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
TWITCH_CALLBACK_URL=https://yourdomain.com/api/webhooks/twitch
TWITCH_EVENTSUB_SECRET=your_eventsub_secret
```

## Webhook Endpoint

The webhook endpoint is already implemented at `/api/webhooks/twitch` and handles:
- Stream online events
- Stream offline events
- Signature verification