# League of Legends Korean Bootcamp Tracker

A real-time dashboard for tracking League of Legends players during their Korean bootcamp sessions. Features live game detection via Riot API, Twitch stream integration, and multistream viewing.

## Features

- 📊 **Real-time Game Tracking** - Automatically detects when bootcampers start/end games using Riot Spectator API
- 🎮 **Live Stream Integration** - Twitch integration with EventSub webhooks for instant stream notifications  
- 📺 **MultiStream Viewing** - Watch multiple bootcampers stream simultaneously
- 🏆 **Rank Tracking** - Displays current rank, peak rank with LP, and leaderboard positions
- 🔄 **Auto Name Updates** - Automatically detects and updates summoner name changes using PUUID
- 🗃️ **PostgreSQL Database** - Persistent storage for bootcampers, games, and stream data
- ⚡ **Background Workers** - BullMQ-powered job queues for API polling and data processing
- 🎨 **Modern UI** - Built with Next.js, Tailwind CSS, shadcn/ui, and Syncfusion components

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Database:** PostgreSQL with Prisma ORM
- **Job Queue:** BullMQ with Redis
- **UI:** Tailwind CSS, shadcn/ui, Syncfusion
- **APIs:** Riot Games API, Twitch Helix API
- **Rate Limiting:** Bottleneck.js

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Redis instance
- Riot Games API key ([Get one here](https://developer.riotgames.com/))
- Twitch Developer Application ([Create one here](https://dev.twitch.tv/console))

## Setup

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/lol_bootcamp_tracker"

# Riot Games API
RIOT_API_KEY="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Twitch API
TWITCH_CLIENT_ID="your_twitch_client_id"
TWITCH_CLIENT_SECRET="your_twitch_client_secret"
TWITCH_EVENTSUB_SECRET="your_random_secret_string"
TWITCH_CALLBACK_URL="https://your-domain.com/api/webhooks/twitch"

# Redis
REDIS_URL="redis://localhost:6379"

# App Settings
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Set Up Database

Generate Prisma client and run migrations:

```bash
npx prisma generate
npx prisma db push
```

### 4. Start Redis

Make sure Redis is running:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or using brew (macOS)
brew services start redis
```

### 5. Run the Application

**Development mode:**

```bash
npm run dev
```

**Start background workers:**

In a separate terminal, run:

```bash
npm run workers
```

The app will be available at `http://localhost:3000`

## Usage

### Adding Bootcampers

1. Navigate to `/roster`
2. Click "Add Bootcamper"
3. Fill in:
   - Summoner name (required)
   - Region (required, e.g., "kr" for Korea)
   - Twitch username (optional, for stream tracking)
   - Role: Pro, Streamer, or Rookie (optional)
   - Start and end dates

The system will:
- Automatically fetch summoner data from Riot API
- Link Twitch account if provided
- Subscribe to Twitch EventSub for stream notifications
- Begin polling Spectator API every 30 seconds

### Dashboard Features

**Main Dashboard (`/`):**
- Live multistream embed when bootcampers are streaming
- Real-time game status tracking
- Stats overview (total bootcampers, live streams, active games)
- Filterable bootcamper list

**Roster Page (`/roster`):**
- Searchable and sortable Syncfusion Grid
- Filter by status, role, or region
- View all bootcampers with their current status

## API Endpoints

### Bootcampers

- `GET /api/bootcampers` - List all bootcampers (supports query params: `status`, `role`, `region`)
- `POST /api/bootcampers` - Add a new bootcamper
- `GET /api/bootcampers/[id]` - Get bootcamper details
- `PATCH /api/bootcampers/[id]` - Update bootcamper
- `DELETE /api/bootcampers/[id]` - Delete bootcamper
- `GET /api/bootcampers/ranks` - Get rank data for all bootcampers (used by leaderboard)
- `POST /api/bootcampers/update-names` - Manually trigger summoner name updates for all bootcampers
- `POST /api/bootcampers/[id]/twitch-subscribe` - Subscribe to Twitch EventSub

### Webhooks

- `POST /api/webhooks/twitch` - Twitch EventSub webhook endpoint

## How It Works

### Game Detection

1. Background worker polls Riot Spectator API every 30 seconds for each active bootcamper
2. When a game starts:
   - Creates a `Game` record in the database
   - Updates bootcamper status to `in_game`
   - Emits real-time update to dashboard
3. When a game ends:
   - Updates bootcamper status to `idle`
   - Marks game as `completed`
   - Schedules a job to fetch match data after 60 seconds

### Stream Detection

1. **Background Worker (Twitch Stream Polling)**:
   - Polls Twitch API every 60 seconds for all bootcampers with Twitch accounts
   - Updates `TwitchStream` table with live status
2. **Webhook Handler**:
   - Receives Twitch EventSub `stream.online` and `stream.offline` notifications
   - Provides instant updates when a stream goes live/offline
3. **Dashboard Integration**:
   - Displays live streams in multistream grid layout
   - Shows up to 3 concurrent streams with responsive layout

### Summoner Name Updates

The system automatically handles summoner name changes:

1. **Background Worker**:
   - Runs every hour for all active bootcampers
   - Uses PUUID to fetch current account data from Riot Account API
   - Compares current name with stored name
   - Updates database if name has changed
2. **Manual Update**:
   - Call `POST /api/bootcampers/update-names` to trigger immediate check for all bootcampers
   - Returns list of detected name changes
3. **PUUID-based Tracking**:
   - All Riot API calls use PUUID (permanent unique ID)
   - Name changes don't break game/rank tracking
   - Riot ID (GameName#TAG) is updated automatically

### Rate Limiting

- Riot API calls are rate-limited using Bottleneck.js
- Default limits: 20 requests/second, respects API headers
- Configurable per-method and per-app limits

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── bootcampers/       # Bootcamper CRUD endpoints
│   │   └── webhooks/           # Twitch EventSub webhooks
│   ├── roster/                 # Roster management page
│   └── page.tsx                # Main dashboard
├── components/
│   ├── ui/                     # shadcn/ui components
│   └── add-bootcamper-dialog.tsx
├── lib/
│   ├── db.ts                   # Prisma client
│   ├── riot-api.ts             # Riot API client with rate limiting
│   ├── twitch-api.ts           # Twitch API client
│   ├── types.ts                # TypeScript type definitions
│   └── workers.ts              # BullMQ workers
└── prisma/
    └── schema.prisma           # Database schema
```

## Syncfusion License

This project uses Syncfusion components which require a license for production use. For development, you can use the free community license. Add your license key in `src/app/roster/page.tsx`:

```typescript
registerLicense('YOUR_LICENSE_KEY_HERE');
```

Get a free community license: https://www.syncfusion.com/sales/communitylicense

## Deployment

### Prerequisites for Production

1. **PostgreSQL database** (e.g., Supabase, Railway, or self-hosted)
2. **Redis instance** (e.g., Redis Cloud, Upstash)
3. **Publicly accessible URL** for Twitch webhooks
4. **SSL certificate** (Twitch EventSub requires HTTPS)

### Environment Variables

Update production environment variables:
- `DATABASE_URL` - Your production PostgreSQL connection string
- `REDIS_URL` - Your production Redis connection string  
- `TWITCH_CALLBACK_URL` - Your production webhook URL (must be HTTPS)
- `NEXT_PUBLIC_APP_URL` - Your production app URL

### Deployment Options

**Vercel:**
```bash
vercel deploy
```

**Docker:**
```bash
docker build -t lol-bootcamp-tracker .
docker run -p 3000:3000 lol-bootcamp-tracker
```

Note: You'll need to run workers separately or use a process manager like PM2.

## Future Enhancements

- [ ] Real-time updates via WebSocket/Server-Sent Events
- [ ] OP.GG data enrichment
- [ ] lolpros.gg integration
- [ ] Discord/Slack notifications
- [ ] Advanced analytics and stats
- [ ] Multi-region support
- [ ] Match history and VOD replay

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

