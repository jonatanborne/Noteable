# 🐳 Noteable Docker Setup

Denna guide visar hur du kör Noteable-appen med Docker för en smidig utvecklingsmiljö.

## 📋 Förutsättningar

- Docker Desktop installerat och igång
- Docker Compose installerat
- Git (för att klona projektet)

## 🚀 Snabbstart

### 1. Starta appen
```bash
# Gör skriptet körbart (Linux/Mac)
chmod +x start.sh

# Starta appen
./start.sh
```

### 2. Öppna appen
- **Frontend (Expo)**: http://localhost:8081
- **Backend API**: http://localhost:5000
- **MongoDB Express**: http://localhost:8082 (admin/admin123)

### 3. På telefonen
1. Installera **Expo Go** appen
2. Skanna QR-koden från http://localhost:8081
3. Appen laddas automatiskt på telefonen

## 🛑 Stoppa appen
```bash
./stop.sh
```

## 🔧 Manuell kontroll

### Starta alla tjänster
```bash
docker-compose up -d
```

### Visa loggar
```bash
# Alla tjänster
docker-compose logs -f

# Endast backend
docker-compose logs -f backend

# Endast frontend
docker-compose logs -f frontend
```

### Stoppa tjänster
```bash
docker-compose down
```

### Starta om en specifik tjänst
```bash
docker-compose restart backend
docker-compose restart frontend
```

## 🗄️ Databas

### MongoDB
- **Port**: 27017
- **Användare**: admin
- **Lösenord**: password123
- **Databas**: noteable

### MongoDB Express (Web GUI)
- **URL**: http://localhost:8082
- **Användare**: admin
- **Lösenord**: admin123

## 🔑 Miljövariabler

Redigera `backend/.env` för att konfigurera:
```env
# MongoDB Configuration
MONGODB_URI=mongodb://admin:password123@mongodb:27017/noteable?authSource=admin

# Server Configuration
PORT=5000
NODE_ENV=production

# OpenAI API Key (VIKTIGT!)
OPENAI_API_KEY=sk-proj-your-key-here
```

## 🐛 Felsökning

### Portar är upptagna
```bash
# Kontrollera vilka portar som används
netstat -tulpn | grep :5000
netstat -tulpn | grep :8081

# Stoppa processer som använder portarna
sudo kill -9 <PID>
```

### Docker containers startar inte
```bash
# Visa container status
docker-compose ps

# Visa detaljerade loggar
docker-compose logs backend
docker-compose logs frontend
```

### Rensa allt och börja om
```bash
# Stoppa och ta bort allt
docker-compose down -v

# Rensa Docker cache
docker system prune -f

# Starta om
./start.sh
```

### MongoDB problem
```bash
# Återställ databas
docker-compose down -v
docker volume rm noteable_mongodb_data
./start.sh
```

## 📱 Utveckling

### Live reload
- **Backend**: Ändringar i `backend/` laddas om automatiskt
- **Frontend**: Ändringar i `frontend/` laddas om automatiskt
- **Telefon**: Appen uppdateras automatiskt via Expo

### Debugging
```bash
# Följ backend loggar
docker-compose logs -f backend

# Följ frontend loggar
docker-compose logs -f frontend

# Gå in i backend container
docker-compose exec backend sh

# Gå in i frontend container
docker-compose exec frontend sh
```

## 🏗️ Bygga för produktion

```bash
# Bygg production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Starta production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 📊 Övervakning

### Resursanvändning
```bash
# Visa container resurser
docker stats

# Visa disk användning
docker system df
```

### Hälsokontroll
```bash
# Kontrollera backend hälsa
curl http://localhost:5000/api/health

# Kontrollera MongoDB
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

## 🔒 Säkerhet

### Produktionsmiljö
- Ändra alla lösenord i `docker-compose.yml`
- Använd starka lösenord för MongoDB
- Aktivera SSL/TLS för produktion
- Begränsa nätverksåtkomst

### Backup
```bash
# Backup MongoDB
docker-compose exec mongodb mongodump --out /backup

# Restore MongoDB
docker-compose exec mongodb mongorestore /backup
```

## 🆘 Support

Om du stöter på problem:
1. Kontrollera Docker Desktop är igång
2. Kontrollera portar är lediga
3. Kör `./stop.sh` och sedan `./start.sh`
4. Kontrollera loggar med `docker-compose logs -f`

## 🎯 Nästa steg

När appen körs med Docker kan du:
- Utveckla lokalt med live reload
- Testa på telefon via Expo Go
- Hantera databas via MongoDB Express
- Skala upp för produktion
- Deploya till molnet (AWS, Google Cloud, etc.)
