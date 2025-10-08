#!/bin/bash

# Script to generate secure secrets
# - 128 bytes (1024-bit) for NextAuth
# - 64 bytes (512-bit) for Twitch EventSub

echo "🔐 Generating Secure Secrets"
echo "===================================="
echo ""

# Function to generate NextAuth secret (128 bytes)
generate_nextauth_secret() {
    openssl rand -base64 128
}

# Function to generate Twitch secret (64 bytes)
generate_twitch_secret() {
    openssl rand -base64 64
}

# Generate secrets
echo "1️⃣  AUTH_SECRET / NEXTAUTH_SECRET (128 bytes):"
AUTH_SECRET=$(generate_nextauth_secret)
echo "   $AUTH_SECRET"
echo ""

echo "2️⃣  TWITCH_EVENTSUB_SECRET (64 bytes):"
TWITCH_SECRET=$(generate_twitch_secret)
echo "   $TWITCH_SECRET"
echo ""

# echo "3️⃣  Additional Secret (if needed):"
# ADDITIONAL_SECRET=$(generate_secret)
# echo "   $ADDITIONAL_SECRET"
# echo ""

echo "===================================="
echo "✅ Secrets generated successfully!"
echo ""
echo "💡 Usage Tips:"
echo "   - NextAuth secret is 128 bytes (1024-bit) base64 encoded"
echo "   - Twitch secret is 64 bytes (512-bit) base64 encoded"
echo "   - Copy the secret without any extra whitespace"
echo "   - Store these securely (password manager, K8s secrets, etc.)"
echo "   - Never commit these to version control"
echo ""
echo "📋 Quick Copy Format:"
echo "   AUTH_SECRET=$AUTH_SECRET"
echo "   NEXTAUTH_SECRET=$AUTH_SECRET"
echo "   TWITCH_EVENTSUB_SECRET=$TWITCH_SECRET"
