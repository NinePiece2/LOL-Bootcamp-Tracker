# Quick Reference

Common commands and tasks for the League Bootcamp Tracker.

## 🚀 Starting the App

### Development (Most Common)
```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Background workers
npm run workers
```

Visit: **http://localhost:3000**

### Production
```bash
npm run build
npm start
```

## 📊 Database

### Common Operations
```bash
# View database in GUI
npm run db:studio

# Generate Prisma client (after schema changes)
npm run db:generate

# Push schema changes to database
npm run db:push

# Reset database (WARNING: deletes all data)
npx prisma db push --force-reset
```

### Direct PostgreSQL Access
```bash
# Connect to database
psql lol_bootcamp_tracker

# List tables
\dt

# View bootcampers
SELECT * FROM bootcampers;

# View live games
SELECT * FROM games WHERE status = 'live';

# Exit
\q
```

## 🔧 Troubleshooting

### App Won't Start

```bash
# 1. Check if ports are in use
lsof -i :3000  # Next.js
lsof -i :6379  # Redis
lsof -i :5432  # PostgreSQL

# 2. Kill processes if needed
kill -9 <PID>

# 3. Restart services
brew services restart postgresql
brew services restart redis

# 4. Clean reinstall
rm -rf node_modules .next
npm install
```

### Database Issues

```bash
# Reset Prisma
npx prisma generate
npx prisma db push

# Check PostgreSQL is running
brew services list | grep postgresql

# Start PostgreSQL
brew services start postgresql@16
```

### Redis Issues

```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Start Redis
brew services start redis

# Or with Docker
docker start lol-tracker-redis
```

### Worker Issues

```bash
# Check Redis is accessible
redis-cli

# View job queues
redis-cli
> KEYS *
> SMEMBERS bull:spectator-checks:*

# Clear all jobs (reset)
redis-cli FLUSHALL
```

## 📝 Common Tasks

### Add a Bootcamper via API (curl)

```bash
curl -X POST http://localhost:3000/api/bootcampers \
  -H "Content-Type: application/json" \
  -d '{
    "summonerName": "Hide on bush",
    "region": "kr",
    "twitchLogin": "faker",
    "role": "pro",
    "startDate": "2025-10-01",
    "plannedEndDate": "2025-11-01"
  }'
```

### List All Bootcampers

```bash
curl http://localhost:3000/api/bootcampers
```

### Subscribe to Twitch EventSub

```bash
# Replace {id} with actual bootcamper ID
curl -X POST http://localhost:3000/api/bootcampers/{id}/twitch-subscribe
```

## 🔐 Environment Variables Quick Check

```bash
# Check if all required vars are set
grep -v '^#' .env | grep -v '^$'

# Test database connection
npx prisma db pull

# Test Redis connection
redis-cli ping
```

## 📊 Monitoring

### View Worker Logs
```bash
# In the terminal running workers
# Ctrl+C to stop, restart with:
npm run workers
```

### Check Job Queue Status (Redis CLI)
```bash
redis-cli

# List all queues
KEYS bull:*

# Count jobs in spectator queue
LLEN bull:spectator-checks:wait

# View a job
LRANGE bull:spectator-checks:wait 0 0
```

### View Database Stats
```bash
npx prisma studio
# Opens GUI at http://localhost:5555
```

## 🐛 Debugging

### Enable Verbose Logging

In `.env`:
```env
NODE_ENV=development
```

In `src/lib/db.ts`, Prisma is already configured to log queries in development.

## 🔄 Reset Everything

```bash
# 1. Stop all processes (Ctrl+C in both terminals)

# 2. Clear Redis
redis-cli FLUSHALL

# 3. Reset database
npx prisma db push --force-reset

# 4. Clear Next.js cache
rm -rf .next

# 5. Restart
npm run dev
npm run workers
```

## 📱 Quick Links

- **Dashboard:** http://localhost:3000
- **Roster:** http://localhost:3000/roster
- **Prisma Studio:** http://localhost:5555 (run `npm run db:studio`)
- **Riot Developer Portal:** https://developer.riotgames.com/
- **Twitch Developer Console:** https://dev.twitch.tv/console

## 🆘 Getting Help

1. **Check logs** in both terminal windows
2. **Review .env** - ensure all keys are set correctly
3. **Check services** - PostgreSQL and Redis must be running
4. **Read error messages** - they usually point to the issue
5. **Check SETUP.md** for detailed troubleshooting

## 💡 Pro Tips

- Use **Prisma Studio** (`npm run db:studio`) to view/edit database records
- Keep both terminals visible to see logs in real-time
- Use **ngrok** for testing Twitch webhooks locally
- Riot dev keys expire daily - get a fresh one when needed
- Set polling interval to 60s+ when testing to avoid rate limits
- Use Redis GUI tools like **RedisInsight** for better job queue visibility
