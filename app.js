// server.js
const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('./config/db');

// Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const userManagementRoutes = require('./routes/userManagementroutes');
const supplierRoutes = require('./routes/supplierRoutes');
const customerRoutes = require('./routes/customerRoutes');
const billRoutes = require('./routes/billRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const inwardRoutes = require('./routes/inwardRoutes');
const productBatchRoutes = require('./routes/productBatchRoutes');
const { scheduleNotificationCleanup } = require('./utils/notificationCleanup');

// Middlewares
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const app = express();

// Connect to DB
connectDB();
require('./config/firebaseAdmin');

// ============================
// ⭐ CORS CONFIGURATION
// ============================
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'https://bejewelled-florentine-dae7a2.netlify.app',
  'https://app.shreesaiepoxy.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow requests with no origin

    const normalizedOrigin = origin.replace(/\/$/, ''); // remove trailing slash
    if (allowedOrigins.includes(normalizedOrigin)) {
      console.log('✅ CORS allowed for:', normalizedOrigin);
      return callback(null, true);
    }

    console.log('❌ CORS blocked for:', normalizedOrigin);
    return callback(new Error(`Not allowed by CORS. Origin: ${normalizedOrigin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-csrf-token','X-Requested-With','Accept','Origin'],
  exposedHeaders: ['x-csrf-token','set-cookie'],
  optionsSuccessStatus: 204
};

// Apply CORS middleware globally BEFORE helmet and routes
app.use(cors(corsOptions));

// ============================
// ⭐ SECURITY MIDDLEWARE
// ============================
app.use(
  helmet({
    crossOriginResourcePolicy: false, // disable CORP to allow CORS
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
  })
);

app.use(mongoSanitize());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: 'Too many requests, try again after 15 minutes',
  skip: (req) => process.env.NODE_ENV !== 'production'
});
app.use(limiter);

// ============================
// ⭐ MIDDLEWARES
// ============================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ============================
// ⭐ REQUEST LOGGER
// ============================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | Origin: ${req.headers.origin}`);
  next();
});

// ============================
// ⭐ ROUTES
// ============================
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userManagementRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/inwards', inwardRoutes);
app.use('/api/product-batches', productBatchRoutes);

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

// ============================
// ⭐ ERROR HANDLER
// ============================
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' 
  });
});

// ============================
// ⭐ START SERVER
// ============================
const PORT = process.env.PORT || 5005;

// Function to find available port
const findAvailablePort = (startPort) => {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    server.listen(startPort, () => {
      server.close();
      resolve(startPort);
    });
    server.on('error', () => resolve(findAvailablePort(startPort + 1)));
  });
};

// Start server
const startServer = async () => {
  try {
    const availablePort = await findAvailablePort(PORT);
    if (availablePort !== PORT) {
      console.log(`⚠️  Port ${PORT} is in use, using port ${availablePort} instead`);
    }

    app.listen(availablePort, () => {
      console.log(`✅ Server is running @ http://localhost:${availablePort}`);
      console.log(`📁 Upload endpoint: http://localhost:${availablePort}/api/upload/image`);
      scheduleNotificationCleanup();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
