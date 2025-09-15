#!/bin/bash

# Noteable Docker Stop Script

echo "🛑 Stopping Noteable App..."

# Stop all services
docker-compose down

echo "✅ All services stopped successfully!"
echo ""
echo "🗑️  To remove all data and start fresh:"
echo "   docker-compose down -v"
echo "   docker system prune -f"
