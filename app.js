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
const { scheduleNotificationCleanup } = require('./utils/notificationCleanup');
const cors = require("cors"); 
const cookieParser = require('cookie-parser');

const app = express();

// Connect to database
connectDB();
require('./config/firebaseAdmin'); 

// CORS config
const corsOptions = {
  // origin: "https://bejewelled-florentine-dae7a2.netlify.app",
  origin:"https://bejewelled-florentine-dae7a2.netlify.app",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json({ limit: '10mb' })); // Increase limit for file uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

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