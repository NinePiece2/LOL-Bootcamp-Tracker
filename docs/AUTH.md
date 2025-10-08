# Authentication System

## Overview
The application now supports multi-user authentication with username/email login and user-specific bootcamper lists.

## Features

### User Registration
- **Username**: 3-20 characters, letters, numbers, and underscores only
- **Email**: Valid email address (required)
- **Display Name**: Optional friendly name
- **Password**: Minimum 6 characters

### Login
- Users can login with either their **username** or **email**
- Password authentication with bcrypt hashing

### User Roles
- **Regular User**: Can create and manage their own bootcamper lists
- **Admin**: Can create default bootcampers visible to all users

## User Experience

### For Non-Authenticated Users
- See the default bootcamper list (admin-created)
- Can browse dashboard and leaderboard
- **Cannot access** the Roster page
- **Cannot** add or edit bootcampers

### For Authenticated Users
- Full access to all pages including Roster
- Can switch between:
  - **Default List**: Admin-created bootcampers (visible to everyone)
  - **My List**: User's own bootcampers (private)
- Can add, edit, and delete their own bootcampers
- List selection persists across pages

### For Admin Users
- All regular user features
- Bootcampers they create are marked as "default" and visible to all users
- Can manage both default and personal bootcampers

## Making a User an Admin

After registering, you can promote yourself to admin:

```bash
npx tsx scripts/make-admin.ts <your-username-or-email>
```

Example:
```bash
npx tsx scripts/make-admin.ts romit
# or
npx tsx scripts/make-admin.ts romit@example.com
```

## API Changes

### Bootcampers API (`/api/bootcampers`)

#### GET
Query parameters:
- `listType`: `'default'` or `'user'`
  - `default`: Returns admin-created bootcampers
  - `user`: Returns logged-in user's bootcampers
  - If not authenticated, always returns default list

#### POST
- Requires authentication
- Creates bootcamper linked to authenticated user
- If user is admin, bootcamper is marked as `isDefault: true`

### Individual Bootcamper (`/api/bootcampers/[id]`)

#### PATCH/DELETE
- Requires authentication
- Users can only edit/delete their own bootcampers
- Admins can edit/delete any bootcamper

## Database Schema

### User Model
```prisma
model User {
  id          String   @id @default(uuid())
  username    String   @unique
  email       String   @unique
  password    String   // Hashed
  name        String?
  isAdmin     Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  bootcampers Bootcamper[]
  sessions    Session[]
  accounts    Account[]
}
```

### Bootcamper Model Updates
```prisma
model Bootcamper {
  // ... existing fields
  userId      String?  // If null, it's a legacy bootcamper
  isDefault   Boolean  @default(false) // Admin-created default
  user        User?    @relation(fields: [userId], references: [id])
  
  @@unique([puuid, userId]) // Each user can track the same player
}
```

## UI Components

### Navigation
- Shows Sign In/Sign Up buttons when not authenticated
- Shows user menu with avatar when authenticated
- Hides Roster link for non-authenticated users

### List Switcher
- Only visible to authenticated users
- Toggle between "Default List" and "My List"
- Persists selection in component state

### Dialogs
- **LoginDialog**: Username/email and password
- **RegisterDialog**: Username, display name, email, password
- **UserMenu**: User profile, admin badge (if admin), sign out

## Environment Variables

Required in `.env`:
```env
NEXTAUTH_SECRET=<generated-secret>
NEXTAUTH_URL=http://localhost:3000
```

The secret is automatically generated during setup.

## Security Features

- Passwords hashed with bcrypt (12 rounds)
- JWT-based sessions via NextAuth
- Authorization checks on all protected routes
- CSRF protection via NextAuth
- Users can only access/modify their own data (unless admin)

## Development Tips

### Testing
1. Register a new account
2. Make yourself admin: `npx tsx scripts/make-admin.ts <username>`
3. Create default bootcampers (will be visible to all users)
4. Sign out and view as non-authenticated user
5. Register another account to test user-specific lists

### Troubleshooting
- If Prisma types are stale, run: `rm -rf node_modules/.prisma && npx prisma generate`
- Check migration status: `npx prisma migrate status`
- Reset database (CAUTION - deletes data): `npx prisma migrate reset`
