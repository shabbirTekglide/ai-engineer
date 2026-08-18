/**
 * Redis Cloud Configuration
 * =========================
 * 
 * Configuration for Redis Cloud connection used by BullMQ
 * Supports both development (local Redis) and production (Redis Cloud)
 * 
 * Environment Variables Required:
 * - REDIS_HOST: Redis server hostname (default: localhost)
 * - REDIS_PORT: Redis server port (default: 6379)
 * - REDIS_PASSWORD: Redis password (required for Redis Cloud)
 * - REDIS_URL: Full Redis URL (alternative to individual settings)
 * - REDIS_TLS: Enable TLS for Redis Cloud (default: false)
 */

import IORedis from 'ioredis';

/**
 * Parse Redis URL or construct from individual environment variables
 * 
 * TLS Handling:
 * - If REDIS_URL starts with 'rediss://' → TLS is enabled automatically
 * - If REDIS_URL starts with 'redis://' → No TLS (don't set REDIS_TLS=true)
 * - For individual settings, use REDIS_TLS=true only if your Redis requires it
 * 
 * Note: Redis Cloud free tier typically does NOT use TLS
 */
function getRedisConfig() {
  // If REDIS_URL is provided, parse it (common for Redis Cloud)
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    
    // Determine TLS based on protocol ONLY (rediss:// = TLS, redis:// = no TLS)
    // This prevents the "packet length too long" error from TLS mismatch
    const useTLS = url.protocol === 'rediss:';
    
    console.log(`[Redis] URL detected: ${url.hostname}:${url.port}`);
    console.log(`[Redis] TLS enabled: ${useTLS} (based on ${url.protocol} protocol)`);
    
    if (process.env.REDIS_TLS === 'true' && !useTLS) {
      console.warn(`[Redis] Warning: REDIS_TLS=true but URL uses redis:// (not rediss://)`);
      console.warn(`[Redis] TLS will be DISABLED to match the URL protocol`);
      console.warn(`[Redis] If you need TLS, change your REDIS_URL to use rediss://`);
    }
    
    return {
      host: url.hostname,
      port: parseInt(url.port, 10) || 6379,
      password: url.password || undefined,
      username: url.username || undefined,
      tls: useTLS ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 10) {
          console.error(`[Redis] Max reconnection attempts reached (${times})`);
          return null; // Stop retrying after 10 attempts
        }
        const delay = Math.min(times * 500, 5000);
        console.log(`[Redis] Reconnecting attempt ${times}, waiting ${delay}ms...`);
        return delay;
      }
    };
  }

  // Use individual environment variables
  const useTLS = process.env.REDIS_TLS === 'true';
  console.log(`[Redis] Using individual settings: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
  console.log(`[Redis] TLS enabled: ${useTLS}`);
  
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    tls: useTLS ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 10) {
        console.error(`[Redis] Max reconnection attempts reached (${times})`);
        return null; // Stop retrying after 10 attempts
      }
      const delay = Math.min(times * 500, 5000);
      console.log(`[Redis] Reconnecting attempt ${times}, waiting ${delay}ms...`);
      return delay;
    }
  };
}

/**
 * Create a new Redis connection
 * Each BullMQ component (Queue, Worker, QueueEvents) needs its own connection
 */
export function createRedisConnection(name = 'default') {
  const config = getRedisConfig();
  const connection = new IORedis(config);

  connection.on('connect', () => {
    console.log(`[Redis:${name}] Connected to Redis server`);
  });

  connection.on('ready', () => {
    console.log(`[Redis:${name}] Redis connection ready`);
  });

  connection.on('error', (err) => {
    console.error(`[Redis:${name}] Redis connection error:`, err.message);
  });

  connection.on('close', () => {
    console.log(`[Redis:${name}] Redis connection closed`);
  });

  connection.on('reconnecting', () => {
    console.log(`[Redis:${name}] Reconnecting to Redis...`);
  });

  return connection;
}

/**
 * Get Redis configuration object (for BullMQ)
 * BullMQ can accept either a connection instance or config object
 */
export function getRedisOptions() {
  return getRedisConfig();
}

/**
 * Shared Redis connections for different purposes
 * BullMQ recommends separate connections for Queue and Worker
 */
let queueConnection = null;
let workerConnection = null;

export function getQueueConnection() {
  if (!queueConnection) {
    queueConnection = createRedisConnection('queue');
  }
  return queueConnection;
}

export function getWorkerConnection() {
  if (!workerConnection) {
    workerConnection = createRedisConnection('worker');
  }
  return workerConnection;
}

/**
 * Close all Redis connections (for graceful shutdown)
 */
export async function closeAllConnections() {
  const connections = [];
  
  if (queueConnection) {
    connections.push(queueConnection.quit());
    queueConnection = null;
  }
  
  if (workerConnection) {
    connections.push(workerConnection.quit());
    workerConnection = null;
  }
  
  await Promise.all(connections);
  console.log('[Redis] All connections closed');
}

/**
 * Test Redis connection
 */
export async function testRedisConnection() {
  try {
    const connection = createRedisConnection('test');
    await connection.ping();
    console.log('[Redis] Connection test successful');
    await connection.quit();
    return true;
  } catch (error) {
    console.error('[Redis] Connection test failed:', error.message);
    return false;
  }
}

export default {
  createRedisConnection,
  getRedisOptions,
  getQueueConnection,
  getWorkerConnection,
  closeAllConnections,
  testRedisConnection
};

