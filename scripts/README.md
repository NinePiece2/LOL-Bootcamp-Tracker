# Secret Generation Scripts

These scripts generate secure cryptographically random secrets that are base64 encoded. Perfect for authentication secrets, API keys, and other security-sensitive configurations.

## Available Scripts

### 1. Bash Script (`generate-secrets.sh`)

**Requirements:** OpenSSL (usually pre-installed on macOS/Linux)

**Usage:**
```bash
# Run the script
./scripts/generate-secrets.sh
```


## Output

Both scripts generate three secrets:

1. **AUTH_SECRET / NEXTAUTH_SECRET** - For NextAuth.js authentication
2. **TWITCH_EVENTSUB_SECRET** - For Twitch EventSub webhooks

Example output:
```
🔐 Generating Secure Secrets
====================================

1️⃣  AUTH_SECRET / NEXTAUTH_SECRET:
   E4AybBi0NHZIE/OYOpJmThFvgZ2xuKBbbxWpgcIaU+I=

2️⃣  TWITCH_EVENTSUB_SECRET:
   8KxPmN9qV2wL5tYhR3jD7cF6aG1bH4kE0sZ9mX2nW8=

3️⃣  Additional Secret (if needed):
   p5Q2rT8vY3xA6zC1bN4mK7jH9gF0dE3sW5R8tL2nM4=
```

## Security Best Practices

### ✅ DO:
- Store secrets in environment variables or secure secret management systems
- Use different secrets for development, staging, and production
- Rotate secrets periodically
- Use password managers or K8s secrets for storage

### ❌ DON'T:
- Commit secrets to version control
- Share secrets via insecure channels (Slack, email, etc.)
- Reuse secrets across different applications
- Store secrets in plain text files

## Using Generated Secrets

### Environment Variables (.env.local)
```bash
AUTH_SECRET=E4AybBi0NHZIE/OYOpJmThFvgZ2xuKBbbxWpgcIaU+I=
NEXTAUTH_SECRET=E4AybBi0NHZIE/OYOpJmThFvgZ2xuKBbbxWpgcIaU+I=
TWITCH_EVENTSUB_SECRET=8KxPmN9qV2wL5tYhR3jD7cF6aG1bH4kE0sZ9mX2nW8=
```

### Kubernetes Secrets
```bash
# Create from literal
kubectl create secret generic app-secrets \
  --from-literal=auth-secret='E4AybBi0NHZIE/OYOpJmThFvgZ2xuKBbbxWpgcIaU+I=' \
  --from-literal=twitch-secret='8KxPmN9qV2wL5tYhR3jD7cF6aG1bH4kE0sZ9mX2nW8=' \
  -n lol-bootcamp-tracker
```

### Docker Compose
```yaml
environment:
  - AUTH_SECRET=E4AybBi0NHZIE/OYOpJmThFvgZ2xuKBbbxWpgcIaU+I=
  - NEXTAUTH_SECRET=E4AybBi0NHZIE/OYOpJmThFvgZ2xuKBbbxWpgcIaU+I=
  - TWITCH_EVENTSUB_SECRET=8KxPmN9qV2wL5tYhR3jD7cF6aG1bH4kE0sZ9mX2nW8=
```

## Technical Details

- **Algorithm:** Cryptographically secure random number generation
- **Entropy:** 256 bits (32 bytes)
- **Encoding:** Base64
- **Length:** ~44 characters (base64 encoded)
- **Collision Probability:** Astronomically low (2^256 possible values)

## Troubleshooting

### Bash Script Issues
```bash
# If you get "command not found: openssl"
# Install OpenSSL (macOS)
brew install openssl

# Install OpenSSL (Ubuntu/Debian)
sudo apt-get install openssl
```

### Node.js Script Issues
```bash
# If you get module errors
# Make sure you're using Node.js v14 or higher
node --version

# The crypto module is built-in, no installation needed
```

## Quick Reference

```bash
# Generate a single secret quickly
openssl rand -base64 32

# Or with Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate and copy to clipboard (macOS)
openssl rand -base64 32 | pbcopy

# Generate and copy to clipboard (Linux with xclip)
openssl rand -base64 32 | xclip -selection clipboard
```
