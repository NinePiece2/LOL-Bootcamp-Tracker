// Script to check for ninepiece2 admin user and make admin if exists
// This runs automatically during container initialization

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAndMakeAdmin() {
  try {
    console.log('🔧 Checking for ninepiece2 user...');
    
    // Check if ninepiece2 user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        username: {
          equals: 'ninepiece2',
          mode: 'insensitive'
        }
      },
    });

    if (!existingUser) {
      console.log(`ℹ️  User ninepiece2 not found - skipping admin setup`);
      return;
    }

    if (existingUser.isAdmin) {
      console.log(`✅ User ninepiece2 already has admin privileges`);
      return;
    }

    // Make existing user admin
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { isAdmin: true },
    });
    
    console.log(`✅ Successfully granted admin privileges to ninepiece2`);
    
  } catch (error) {
    console.error('❌ Error checking/updating admin status:', error);
    // Don't exit with error - this shouldn't fail the migration
    console.log('⚠️  Continuing with migration...');
  } finally {
    await prisma.$disconnect();
  }
}

checkAndMakeAdmin();