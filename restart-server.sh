#!/bin/bash

echo "🔄 Stopping existing server processes..."
pkill -f "node.*app.js" 2>/dev/null
pkill -f "nodemon.*app.js" 2>/dev/null
sleep 2

echo "🧹 Clearing rate limit cache..."
# Rate limits are in-memory, so killing the process clears them

echo "🚀 Starting server..."
cd "$(dirname "$0")"
npm start

echo "✅ Server restart complete!"
