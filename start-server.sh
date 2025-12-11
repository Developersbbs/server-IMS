#!/bin/bash

# Script to kill process using port 5000 and start the server
# Usage: ./start-server.sh

echo "🔍 Checking for processes using port 5000..."

# Find and kill any process using port 5000
PID=$(lsof -ti:5000)
if [ ! -z "$PID" ]; then
    echo "⚠️  Found process $PID using port 5000. Killing it..."
    kill -9 $PID
    sleep 2
    echo "✅ Process killed successfully"
else
    echo "✅ Port 5000 is available"
fi

echo "🚀 Starting server..."
cd "$(dirname "$0")"
npm start
