# Environment Variables Setup

## Frontend (.env)
Create a file called `.env` in the `frontend/` directory with:
```
EXPO_PUBLIC_OPENAI_API_KEY=your_actual_openai_api_key_here
```

## Backend (.env)
Create a file called `.env` in the `backend/` directory with:
```
OPENAI_API_KEY=your_actual_openai_api_key_here
```

## Important Notes
- Replace `your_actual_openai_api_key_here` with your real OpenAI API key
- Never commit these `.env` files to Git (they are in .gitignore)
- The `.env` files are already created with placeholder values
- You just need to replace the placeholder with your actual API key

## Getting Your OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key and paste it in both `.env` files
