# Starting the Workers

## ⚠️ IMPORTANT: Workers Must Run Separately

The LoL KR Bootcamp Tracker uses **background workers** to:
- Poll Riot's Spectator API for live games
- Fetch rank data for all players in games
- Update match data every 60 seconds

**The workers DO NOT start with `npm run dev`** - you must run them in a separate terminal!

## Quick Start

### Terminal 1: Next.js Development Server
```bash
npm run dev
```

### Terminal 2: Background Workers
```bash
npm run workers
```

## What the Workers Do

When running, you'll see logs like:
```
🚀 Starting League Bootcamp Tracker Workers...
✅ Workers started successfully
📊 Polling for live games every 60 seconds
Press Ctrl+C to stop

🎮 Game started for Jankos (ID: 7849820160)
📊 Enriching 10 participants with rank data...
Fetching rank for PlayerName (summonerId: xyz...)
✅ Enriched participant PlayerName: { rank: 'DIAMOND I', tier: 'DIAMOND', division: 'I', LP: 50 }
```

## Troubleshooting

### Workers Not Fetching Ranks
- Check for error messages like `❌ Failed to fetch rank`
- Verify your Riot API key is valid (dev keys expire after 24 hours)
- Check if you're hitting rate limits (429 errors)

### Workers Not Starting
- Ensure Redis is running: `redis-cli ping` (should return `PONG`)
- Check `.env` file has valid `REDIS_URL` and `RIOT_API_KEY`

### No Live Game Updates
- Workers poll every 30 seconds
- Games only appear when bootcampers are actually in a match
- Check worker logs for spectator API errors

## Environment Requirements

Make sure your `.env` file contains:
```
DATABASE_URL="postgresql://..."
REDIS_URL="redis://localhost:6379"
RIOT_API_KEY="RGAPI-..."
```