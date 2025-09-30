// const express = require('express');
// const dotenv = require('dotenv');
// const connectDB = require('./config/db'); // ✅ use only this
// const authRoutes = require('./routes/authRoutes');
// const productRoutes = require('./routes/productRoutes');
// const supplierRoutes = require('./routes/supplierRoutes');
// const customerRoutes = require('./routes/customerRoutes');
// const uploadRoutes = require('./routes/uploadRoutes');
// const cors = require("cors"); 
// const cookieParser = require('cookie-parser');
// const mongoose = require("mongoose");
// dotenv.config();
// console.log("ENV Loaded:", process.env.S3_BUCKET_NAME, process.env.AWS_REGION);

// const app = express();

// // Load environment variables


// // Connect to database
// connectDB();

// // ✅ CORS config
// const corsOptions = {
//   origin: "http://localhost:5173",
//   methods: ["GET", "POST", "PUT", "DELETE", "patch", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   credentials: true,
// };
// app.use(cors(corsOptions));

// // Middleware
// app.use(express.json());
// app.use(cookieParser());

// // Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/products', productRoutes);
// app.use('/api/suppliers', supplierRoutes);
// app.use('/api/customers', customerRoutes);
// app.use('/api/upload', uploadRoutes);

// // Error handling middleware
// app.use((error, req, res, next) => {
//   console.error(error);
//   res.status(500).json({ 
//     message: 'Something went wrong!', 
//     error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' 
//   });
// });

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//   console.log(`✅ Server is running @ http://localhost:${PORT}`);
// });
