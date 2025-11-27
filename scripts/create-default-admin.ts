// Script to check for admin userw and make them admin if exists
// This runs automatically during container initialization

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function checkAndMakeAdmin() {
  try {
    console.log('🔧 Checking for admin user...');
    const adminUsername = process.env.ADMIN_USERNAME;

    // Check if admin user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        username: {
          equals: adminUsername,
          mode: 'insensitive'
        }
      },
    });

    if (!existingUser) {
      console.log(`ℹ️  User ${adminUsername} not found - skipping admin setup`);
      return;
    }

    if (existingUser.isAdmin) {
      console.log(`✅ User ${adminUsername} already has admin privileges`);
      return;
    }

    // Make existing user admin
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { isAdmin: true },
    });

    console.log(`✅ Successfully granted admin privileges to ${adminUsername}`);

  } catch (error) {
    console.error('❌ Error checking/updating admin status:', error);
    // Don't exit with error - this shouldn't fail the migration
    console.log('⚠️  Continuing with migration...');
  } finally {
    await prisma.$disconnect();
  }
}

checkAndMakeAdmin();