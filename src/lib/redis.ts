import { Redis } from 'ioredis';

/**
 * Creates a Redis connection with Sentinel support for production
 * and fallback to direct connection for development
 */
export function createRedisConnection(): Redis {
  if (process.env.REDIS_SENTINEL_HOSTS) {
    // Production: Use Redis Sentinel for high availability
    const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS.split(',').map(host => {
      const [hostname, port] = host.split(':');
      return { host: hostname, port: parseInt(port) };
    });
    
    console.log('🔄 Connecting to Redis via Sentinel:', {
      sentinels: sentinelHosts,
      master: process.env.REDIS_SENTINEL_MASTER || 'mymaster'
    });
    
    return new Redis({
      sentinels: sentinelHosts,
      name: process.env.REDIS_SENTINEL_MASTER || 'mymaster',
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
      lazyConnect: true,
      // Important: Allow offline queue for BullMQ compatibility
      enableOfflineQueue: true,
    });
  } else {
    // Development: Direct Redis connection
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    console.log('🔄 Connecting to Redis directly:', redisUrl);
    
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
      lazyConnect: true,
    });
  }
}

/**
 * Shared Redis connection instance for BullMQ and other Redis operations
 */
export const redisConnection = createRedisConnection();

// Add connection event handlers for better debugging
redisConnection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redisConnection.on('ready', () => {
  console.log('✅ Redis ready for operations');
});

redisConnection.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

redisConnection.on('close', () => {
  console.log('⚠️ Redis connection closed');
});

redisConnection.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});