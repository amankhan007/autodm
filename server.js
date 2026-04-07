require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/database');
const connectRedis = require('./config/redis');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes      = require('./routes/auth');
const instagramRoutes = require('./routes/instagram');
const campaignRoutes  = require('./routes/campaigns');
const webhookRoutes   = require('./routes/webhook');
const paymentRoutes   = require('./routes/payments');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes     = require('./routes/admin');
const logsRoutes      = require('./routes/logs');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Raw body for webhook signature verification
app.use('/api/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));
}

// Rate limiters
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many requests, please try again later.' } }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, message: 'Too many auth attempts.' } });

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0', db: 'supabase', environment: process.env.NODE_ENV }));

// Routes
app.use('/api/auth',      authLimiter, authRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/webhook',   webhookRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/logs',      logsRoutes);

app.use('*', (req, res) => res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();
    await connectRedis();
    app.listen(PORT, () => logger.info(`🚀 InstaFlow API on :${PORT} [${process.env.NODE_ENV}] — DB: Supabase`));
  } catch (err) {
    logger.error('Startup failed:', err);
    process.exit(1);
  }
};

start();

process.on('unhandledRejection', (err) => { logger.error('Unhandled Rejection:', err); process.exit(1); });
process.on('uncaughtException',  (err) => { logger.error('Uncaught Exception:',  err); process.exit(1); });

module.exports = app;
