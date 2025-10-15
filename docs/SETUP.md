# Setup Guide

This guide will walk you through setting up the League Bootcamp Tracker from scratch.

## Step 1: Prerequisites

### Install Required Software

1. **Node.js 18+**
   ```bash
   # Check your version
   node --version
   ```

2. **PostgreSQL**
   - **macOS (Homebrew):**
     ```bash
     brew install postgresql@16
     brew services start postgresql@16
     ```
   - **Ubuntu/Debian:**
     ```bash
     sudo apt install postgresql postgresql-contrib
     sudo systemctl start postgresql
     ```
   - **Windows:** Download from https://www.postgresql.org/download/windows/
   - **Docker:**
     ```bash
     docker run -d \
       --name lol-tracker-postgres \
       -e POSTGRES_PASSWORD=postgres \
       -e POSTGRES_DB=lol_bootcamp_tracker \
       -p 5432:5432 \
       postgres:16-alpine
     ```

3. **Redis**
   - **macOS (Homebrew):**
     ```bash
     brew install redis
     brew services start redis
     ```
   - **Ubuntu/Debian:**
     ```bash
     sudo apt install redis-server
     sudo systemctl start redis
     ```
   - **Windows:** Use Docker or WSL
   - **Docker:**
     ```bash
     docker run -d \
       --name lol-tracker-redis \
       -p 6379:6379 \
       redis:alpine
     ```

## Step 2: Get API Keys

### Riot Games API Key

1. Go to https://developer.riotgames.com/
2. Sign in with your Riot Games account
3. Navigate to "Apps" and register a new application
4. Copy your API key (starts with `RGAPI-`)

**Note:** Development keys expire every 24 hours. For production, apply for a production key.

### Twitch API Credentials

1. Go to https://dev.twitch.tv/console
2. Sign in or create a Twitch account
3. Click "Register Your Application"
4. Fill in:
   - **Name:** League Bootcamp Tracker
   - **OAuth Redirect URLs:** `http://localhost:3000/api/auth/callback`
   - **Category:** Website Integration
5. Click "Create"
6. Copy your **Client ID** and **Client Secret**

## Step 3: Configure the Application

### 1. Clone/Download the Project

If you haven't already:
```bash
git clone https://github.com/NinePiece2/LOL-Bootcamp-Tracker
cd LOL-KR-Bootcamp-Tracker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lol_bootcamp_tracker?schema=public"

# Riot Games API
RIOT_API_KEY="RGAPI-your-key-here"

# Twitch API
TWITCH_CLIENT_ID="your_client_id_here"
TWITCH_CLIENT_SECRET="your_client_secret_here"
TWITCH_EVENTSUB_SECRET="some_random_secret_string_here"
TWITCH_CALLBACK_URL="http://localhost:3000/api/webhooks/twitch"

# Redis
REDIS_URL="redis://localhost:6379"

# App Settings
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

**Important:** 
- Replace the API keys with your actual keys
- For `TWITCH_EVENTSUB_SECRET`, generate a random string (at least 20 characters)
- In production, use HTTPS for `TWITCH_CALLBACK_URL`

### 4. Initialize the Database

```bash
# Generate Prisma client
npm run db:generate

# Create database tables
npm run db:push
```

Verify the database is set up correctly:
```bash
# Open Prisma Studio to view your database
npm run db:studio
```

## Step 4: Run the Application

### Terminal 1: Start the Next.js App

```bash
npm run dev
```

The app will be available at http://localhost:3000

### Terminal 2: Start the Background Workers

```bash
npm run workers
```

This starts the BullMQ workers that poll the Riot API for live games.

## Step 5: Add Your First Bootcamper

1. Open http://localhost:3000/roster in your browser
2. Click "Add Bootcamper"
3. Fill in the form:
   - **Summoner Name:** Any valid League summoner (e.g., "Hide on bush" on KR server)
   - **Region:** kr (for Korea)
   - **Twitch Username:** (Optional) Any Twitch streamer
   - **Role:** Pro/Streamer/Rookie (optional)
   - **Start Date:** Today's date
   - **End Date:** A future date
4. Click "Add Bootcamper"

The system will:
- Fetch the summoner's data from Riot API
- Link their Twitch account (if provided)
- Begin polling for live games every 60 seconds

## Step 6: Testing

### Test Game Detection

1. Add a bootcamper using a summoner name you can test with
2. Have that summoner start a game
3. Wait up to 30 seconds
4. The dashboard should show them as "In Game"

### Test Stream Detection (requires public webhook)

For local development, Twitch EventSub webhooks require a publicly accessible URL. Options:

1. **Use ngrok (easiest for testing):**
   ```bash
   # Install ngrok
   npm install -g ngrok
   
   # Start ngrok
   ngrok http 3000
   ```
   
   Update `.env`:
   ```env
   TWITCH_CALLBACK_URL="https://your-ngrok-url.ngrok.io/api/webhooks/twitch"
   ```

## Troubleshooting

### Database Connection Errors

```
Error: Can't reach database server
```

**Solution:**
- Ensure PostgreSQL is running: `brew services list` (macOS) or `sudo systemctl status postgresql` (Linux)
- Check the `DATABASE_URL` in your `.env` file
- Verify the database exists: `psql -l`

### Redis Connection Errors

```
Error: Redis connection refused
```

**Solution:**
- Ensure Redis is running: `brew services list` (macOS) or `sudo systemctl status redis` (Linux)
- Check the `REDIS_URL` in your `.env` file
- Test Redis: `redis-cli ping` (should return "PONG")

### Riot API Errors

```
Error 401: Unauthorized
```

**Solution:**
- Verify your `RIOT_API_KEY` is correct and not expired
- Development keys expire every 24 hours - get a new one from https://developer.riotgames.com/

```
Error 429: Rate Limit Exceeded
```

**Solution:**
- The app has built-in rate limiting, but if you're hitting limits:
- Reduce the number of bootcampers being tracked
- Increase the polling interval in `src/lib/workers.ts`

### Twitch API Errors

```
Error: Invalid Twitch credentials
```

**Solution:**
- Verify `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are correct
- Ensure there are no extra spaces in your `.env` file

### Workers Not Starting

```
Error: Cannot find module
```

**Solution:**
- Ensure all dependencies are installed: `npm install`
- Check that `workers.ts` is executable
- Verify Redis is running

## Next Steps

- Add more bootcampers
- Explore the dashboard at http://localhost:3000
- View the roster at http://localhost:3000/roster
- Check the Prisma Studio at http://localhost:5555 (run `npm run db:studio`)

## Production Deployment

See [README.md](./README.md#deployment) for production deployment instructions.
