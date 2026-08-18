import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import compression from 'compression';
import dotenv from 'dotenv/config';
import connectDB from './config/mongoose-connection.js';
import authRoutes from './routes/authRoutes.js';
import cmsRoutes from './routes/pages/cmsRoutes.js';
import sessionRoutes from './routes/sessionRoute.js';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import classRoutes from './routes/classRoutes.js'
import lectureRoutes from './routes/lectureRoutes.js'
import learnRoutes from './routes/learnRoutes.js'
import calendarRoutes from './routes/calendarRoutes.js'
import settingRoutes from './routes/settingRoutes.js'
import chatRoutes from './routes/chatRoutes.js'
import comprehensionRoutes from './routes/comprehensionRoutes.js'
import transcriptionRoutes from './routes/transcriptionRoutes.js'
import queueRoutes from './routes/queueRoutes.js'
import billingRoutes from './routes/skybankRoutes.js'
import usageAnalyticsRoutes from './routes/usageAnalyticsRoutes.js'
import adminLectureRoutes from './routes/adminLectureRoutes.js'
import studentProfileRoutes from './routes/studProfileRoutes.js'
import configController from './routes/configRoutes.js'
import promoCodeRoutes from './routes/promocodeRoutes.js'
import referenceCodeRoutes from './routes/referenceCodeRoutes.js'
import termsConditionRoutes from './routes/termsConditionRoutes.js'
import { startWorker } from './services/queueWorker.js';
import { initializeBullMQ, shutdownBullMQ } from './services/bullmq/index.js';
import contactusRoutes from './routes/contactUsRoutes.js';
import passport from './config/passport.js';
import webhookRoutes from './routes/webhookRoutes.js';
// Replicating __dirname in ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(compression({
  threshold: 1024,
}));
app.set("trust proxy", 1); // so req.ip works behind proxy
app.use(helmet());
app.use(cookieParser());
app.use('/api/webhook', webhookRoutes);
// Increase payload limits for large audio file uploads
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded audio files from local storage
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use(cors({
//   origin: [process.env.STORE_URL, 'http://localhost:5173'],
//   credentials: true,
// }));

app.use(cors({
  origin: [
    process.env.STORE_URL, // https://app.koralearning.com
    process.env.CMS_URL,   // https://dev.koralearning.com
    'https://www.koralearning.com',
    'http://localhost:5173', // local dev (optional),
    'http://localhost:5000'   // local cms (optional),
  ],
  credentials: true,
  //  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  //  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(passport.initialize());
app.use('/api/auth', authRoutes);
app.use('/api/me', sessionRoutes);
app.use('/api/class', classRoutes);
app.use('/api/lecture', lectureRoutes);
app.use('/api/learn', learnRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/setting', settingRoutes)
app.use('/api/chat', chatRoutes);
app.use('/api/comprehension', comprehensionRoutes);
app.use('/api/transcription', transcriptionRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/subscriptions', billingRoutes);
app.use('/api/config', configController);
app.use('/api/student-profile', studentProfileRoutes);
app.use('/api/promocodes', promoCodeRoutes);
app.use('/api/reference-codes', referenceCodeRoutes);
app.use('/api/admin/lectures', adminLectureRoutes);
app.use('/api/terms-condition', termsConditionRoutes);
app.use('/api/contact-us', contactusRoutes);
// Public API Routes
app.use('/api/public', usageAnalyticsRoutes);
// CMS Routes Invoked
app.use('/', cmsRoutes);

const server = app.listen(process.env.PORT || 5000, async () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);

  // Configure server timeouts for long-running operations (e.g., syllabus parsing, study guide generation)
  // Set to 45 minutes to accommodate 40-minute request timeout with buffer
  server.timeout = parseInt(process.env.SERVER_TIMEOUT_MS) || 45 * 60 * 1000; // 45 minutes
  // Keep-alive and headers timeouts must allow long AI operations (e.g. study guide for multiple lectures)
  const keepAliveMs = parseInt(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS) || 10 * 60 * 1000; // 10 minutes
  server.keepAliveTimeout = keepAliveMs;
  server.headersTimeout = parseInt(process.env.SERVER_HEADERS_TIMEOUT_MS) || keepAliveMs + 1000; // must be > keepAliveTimeout

  console.log(`Server timeout configured: ${server.timeout / 1000 / 60} minutes`);
  console.log(`Keep-alive timeout: ${server.keepAliveTimeout / 1000} seconds`);

  // Initialize BullMQ with Redis for scalable concurrent processing
  // This is the primary queue system for 100+ simultaneous users
  const useBullMQ = process.env.USE_BULLMQ !== 'false'; // Default to true

  if (useBullMQ) {
    try {
      const bullMQInitialized = await initializeBullMQ({ enableWorkers: true });
      if (bullMQInitialized) {
        console.log('✅ BullMQ initialized - Redis-based distributed queue active');
        console.log('   Scalable concurrent processing enabled for 100+ users');
      } else {
        console.warn('⚠️ BullMQ initialization failed - falling back to legacy queue');
        // Fall back to legacy worker
        await startWorker();
        console.log('Legacy queue worker started as fallback');
      }
    } catch (error) {
      console.error('Failed to initialize BullMQ:', error.message);
      console.log('Attempting fallback to legacy queue worker...');
      try {
        await startWorker();
        console.log('Legacy queue worker started successfully');
      } catch (legacyError) {
        console.error('Failed to start legacy queue worker:', legacyError);
        console.error('Background processing will not be available');
      }
    }
  } else {
    // Use legacy worker if BullMQ is disabled
    try {
      await startWorker();
      console.log('Queue worker started successfully (legacy mode)');
    } catch (error) {
      console.error('Failed to start queue worker:', error);
      console.error('Background processing will not be available');
    }
  }
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Shutdown BullMQ first
    await shutdownBullMQ();
    console.log('BullMQ shutdown complete');
  } catch (error) {
    console.error('Error during BullMQ shutdown:', error.message);
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
