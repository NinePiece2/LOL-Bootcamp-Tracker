// Script to make a user an admin
// Usage: npx tsx scripts/make-admin.ts <email-or-username>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function makeAdmin(identifier: string) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { 
            username: {
              equals: identifier,
              mode: 'insensitive'
            }
          },
        ],
      },
    });

    if (!user) {
      console.error(`❌ User with email or username "${identifier}" not found`);
      process.exit(1);
    }

    if (user.isAdmin) {
      console.log(`ℹ️  User ${user.username} (${user.email}) is already an admin`);
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true },
    });

    console.log(`✅ Successfully made ${user.username} (${user.email}) an admin`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const identifier = process.argv[2];

if (!identifier) {
  console.error('❌ Please provide an email address or username');
  console.log('Usage: npx tsx scripts/make-admin.ts <email-or-username>');
  process.exit(1);
}

makeAdmin(identifier);
