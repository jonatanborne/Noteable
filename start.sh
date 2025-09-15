#!/bin/bash

# Noteable Docker Startup Script

echo "🚀 Starting Noteable App with Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f backend/.env ]; then
    echo "📝 Creating .env file for backend..."
    cat > backend/.env << EOF
# MongoDB Configuration
MONGODB_URI=mongodb://admin:password123@mongodb:27017/noteable?authSource=admin

# Server Configuration
PORT=5000
NODE_ENV=production

# OpenAI API Key (add your key here)
OPENAI_API_KEY=your_openai_api_key_here
EOF
    echo "⚠️  Please edit backend/.env and add your OpenAI API key!"
fi

# Build and start all services
echo "🔨 Building and starting all services..."
docker-compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🎉 Noteable App is starting up!"
echo ""
echo "📱 Frontend (Expo): http://localhost:8081"
echo "🔧 Backend API: http://localhost:5000"
echo "🗄️  MongoDB Express: http://localhost:8082 (admin/admin123)"
echo ""
echo "📱 To access the app on your phone:"
echo "1. Install Expo Go app"
echo "2. Scan the QR code from http://localhost:8081"
echo ""
echo "🛑 To stop the app: ./stop.sh"
echo "📋 To view logs: docker-compose logs -f"
