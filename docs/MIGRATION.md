# Database Migration Container

This container handles database schema initialization and migrations for the LoL Bootcamp Tracker application.

## What it does

1. **Waits for PostgreSQL** to be ready and accepting connections
2. **Generates Prisma client** with the latest schema
3. **Applies database schema** using `prisma db push`
4. **Handles schema updates** safely without data loss

## Container Images

- **Main App**: `ninepiece2/lol-bootcamp-tracker:latest`
- **Migration**: `ninepiece2/lol-bootcamp-tracker:migrate`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `DB_HOST` | Database hostname | `postgres-rw` |
| `DB_PORT` | Database port | `5432` |
| `NODE_ENV` | Environment mode | `production` |

## Container Features

- **Alpine Linux** base for minimal size
- **Built-in health checks** for database connectivity
- **Safe schema updates** with Prisma
- **Automatic retries** if database is not ready
- **Logging** for troubleshooting

## Deployment Order

1. **PostgreSQL** - Database service
2. **Migration Container** - Schema initialization  
3. **Application Containers** - Web app and workers

This ensures your database schema is always up-to-date before the application starts.