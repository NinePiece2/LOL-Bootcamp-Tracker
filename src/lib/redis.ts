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
      enableOfflineQueue: false,
    });
  } else {
    // Development: Direct Redis connection
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    console.log('🔄 Connecting to Redis directly:', redisUrl);
    
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
}

/**
 * Shared Redis connection instance for BullMQ and other Redis operations
 */
export const redisConnection = createRedisConnection();