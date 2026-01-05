#!/bin/bash
# Better Auth Setup Script
# Run this after configuring Google OAuth credentials

set -e

echo "🔐 Better Auth Setup"
echo "===================="
echo ""

# Check if .env exists
if [ ! -f .env ] && [ ! -f .env.local ]; then
  echo "❌ Error: .env or .env.local file not found"
  echo "   Please copy .env.example to .env and configure it"
  exit 1
fi

# Check for required environment variables
ENV_FILE=".env"
if [ -f ".env.local" ]; then
  ENV_FILE=".env.local"
fi

echo "📋 Checking environment variables..."

if ! grep -q "GOOGLE_CLIENT_ID" $ENV_FILE || grep -q "GOOGLE_CLIENT_ID=xxxxx" $ENV_FILE; then
  echo "❌ GOOGLE_CLIENT_ID not configured"
  echo "   Get from: https://console.cloud.google.com/apis/credentials"
  exit 1
fi

if ! grep -q "GOOGLE_CLIENT_SECRET" $ENV_FILE || grep -q "GOOGLE_CLIENT_SECRET=xxxxx" $ENV_FILE; then
  echo "❌ GOOGLE_CLIENT_SECRET not configured"
  echo "   Get from: https://console.cloud.google.com/apis/credentials"
  exit 1
fi

if ! grep -q "BETTER_AUTH_SECRET" $ENV_FILE || grep -q "BETTER_AUTH_SECRET=your-secret" $ENV_FILE; then
  echo "⚠️  BETTER_AUTH_SECRET not set, generating..."
  SECRET=$(openssl rand -base64 32)

  if grep -q "BETTER_AUTH_SECRET" $ENV_FILE; then
    # Update existing line
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" $ENV_FILE
    else
      sed -i "s|BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" $ENV_FILE
    fi
  else
    # Add new line
    echo "BETTER_AUTH_SECRET=$SECRET" >> $ENV_FILE
  fi
  echo "✅ Generated BETTER_AUTH_SECRET"
fi

if ! grep -q "DATABASE_URL" $ENV_FILE || grep -q "DATABASE_URL=postgresql://user:password" $ENV_FILE; then
  echo "❌ DATABASE_URL not configured"
  echo "   Get from: https://console.neon.tech/"
  exit 1
fi

echo "✅ Environment variables configured"
echo ""

# Run database migration
echo "📦 Running database migration..."
npm run db:migrate

echo ""
echo "✅ Better Auth setup complete!"
echo ""
echo "Next steps:"
echo "1. Start dev server: npm run dev"
echo "2. Test sign-in at: http://localhost:3300"
echo "3. Check protected route: http://localhost:3300/api/protected/me"
echo ""
echo "📚 See docs/AUTH_SETUP.md for detailed usage guide"
