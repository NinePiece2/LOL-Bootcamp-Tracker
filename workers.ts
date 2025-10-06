#!/usr/bin/env tsx

/**
 * Worker script to run background jobs for the League Bootcamp Tracker
 * This script initializes and runs BullMQ workers for:
 * - Spectator API polling (checking for live games)
 * - Match data fetching (post-game stats)
 */

import { initializeWorkers, shutdownWorkers } from './src/lib/workers.js';

console.log('🚀 Starting League Bootcamp Tracker Workers...');

// Initialize workers
initializeWorkers()
  .then(() => {
    console.log('✅ Workers started successfully');
    console.log('📊 Polling for live games every 30 seconds');
    console.log('Press Ctrl+C to stop');
  })
  .catch((error) => {
    console.error('❌ Failed to start workers:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n⏸️  Received SIGTERM, shutting down gracefully...');
  await shutdownWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n⏸️  Received SIGINT, shutting down gracefully...');
  await shutdownWorkers();
  process.exit(0);
});
