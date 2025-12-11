// server.js or app.js
const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const uploadRoutes = require('./routes/uploadRoutes'); // Make sure this path is correct
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
const cors = require("cors");
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const app = express();

// Connect to database FIRST
connectDB();
require('./config/firebaseAdmin'); 

// CORS config - MUST BE BEFORE HELMET
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'https://bejewelled-florentine-dae7a2.netlify.app',
  'https://bejewelled-florentine-dae7a2.netlify.app/'
];

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('No origin - allowing request');
      return callback(null, true);
    }
    
    // Normalize origin by removing trailing slash for consistent comparison
    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    
    // Check if origin is in allowed origins
    if (allowedOrigins.includes(normalizedOrigin) || 
        allowedOrigins.includes(normalizedOrigin + '/')) {
      console.log('CORS allowed for origin:', normalizedOrigin);
      return callback(null, true);
    }
    
    // In development, allow all origins for easier testing
    if (process.env.NODE_ENV !== 'production') {
      console.log('Development mode - allowing origin:', normalizedOrigin);
      return callback(null, true);
    }
    
    console.log('CORS blocked for origin:', normalizedOrigin);
    return callback(new Error(`Not allowed by CORS. Origin: ${normalizedOrigin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-csrf-token',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['x-csrf-token', 'set-cookie'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
  maxAge: 600 // 10 minutes
};

// Apply CORS middleware FIRST - must be before helmet and routes
app.use(cors(corsOptions));

// Security middleware - Configure helmet to work with CORS
app.use(helmet({
  crossOriginResourcePolicy: false, // Disable CORP to allow CORS
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));

// Rate limiting - More lenient for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV !== 'production';
  }
});
app.use(limiter);


// Middleware
app.use(express.json({ limit: '10mb' })); // Increase limit for file uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Routes - ORDER MATTERS!
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes); // This should come before other routes
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

// Add a test route to verify upload endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' 
  });
});
const PORT = process.env.PORT || 5000;

// Function to find an available port
const findAvailablePort = (startPort) => {
  return new Promise((resolve) => {
    const server = require('net').createServer();

    server.listen(startPort, () => {
      server.close();
      resolve(startPort);
    });

    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
};

// Start server with automatic port detection
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