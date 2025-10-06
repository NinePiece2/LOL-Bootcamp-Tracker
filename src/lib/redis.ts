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
      connectTimeout: 30000,
      lazyConnect: false,
      enableOfflineQueue: true,
      // Keep connection alive
      keepAlive: 30000,
      family: 4, // Use IPv4
    });
  } else {
    // Development: Direct Redis connection
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    console.log('🔄 Connecting to Redis directly:', redisUrl);
    
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
      lazyConnect: false,
      keepAlive: 30000,
      // Network tuning
      family: 4, // Use IPv4
      // Keep connection alive settings
      enableOfflineQueue: true,
      autoResubscribe: true,
      autoResendUnfulfilledCommands: true,
      // TCP settings for better connection stability
      commandTimeout: 5000,
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
  // Don't exit process on Redis errors, let it retry
});

redisConnection.on('close', () => {
  console.log('⚠️ Redis connection closed');
});

redisConnection.on('reconnecting', (ms: number) => {
  console.log(`🔄 Redis reconnecting in ${ms}ms...`);
});

redisConnection.on('end', () => {
  console.log('� Redis connection ended');
});

// For Sentinel mode, add Sentinel-specific event handlers
if (process.env.REDIS_SENTINEL_HOSTS) {
  redisConnection.on('+sentinel', (sentinel) => {
    console.log('📡 Sentinel connected:', sentinel);
  });
  
  redisConnection.on('-sentinel', (sentinel) => {
    console.log('📡 Sentinel disconnected:', sentinel);
  });
  
  redisConnection.on('+switch-master', (masterName, oldHost, oldPort, newHost, newPort) => {
    console.log(`🔄 Redis master switched: ${masterName} from ${oldHost}:${oldPort} to ${newHost}:${newPort}`);
  });
}