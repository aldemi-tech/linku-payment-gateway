# Firebase Functions Environment Configuration
# Copy this file to configure your environment variables for deployment

# ==================== FIREBASE CONFIGURATION ====================
# Set these using Firebase CLI commands:
# firebase functions:config:set stripe.secret_key="sk_xxx"
# firebase functions:config:set stripe.public_key="pk_xxx"
# firebase functions:config:set stripe.webhook_secret="whsec_xxx"

# ==================== STRIPE CONFIGURATION ====================
# Production keys
firebase functions:config:set stripe.secret_key="sk_live_xxxxx"
firebase functions:config:set stripe.public_key="pk_live_xxxxx"
firebase functions:config:set stripe.webhook_secret="whsec_xxxxx"

# Test keys (for development)
# firebase functions:config:set stripe.secret_key="sk_test_xxxxx"
# firebase functions:config:set stripe.public_key="pk_test_xxxxx"
# firebase functions:config:set stripe.webhook_secret="whsec_test_xxxxx"

# ==================== TRANSBANK CONFIGURATION ====================
# Production keys
firebase functions:config:set transbank.commerce_code="your_production_commerce_code"
firebase functions:config:set transbank.api_key="your_production_api_key"
firebase functions:config:set transbank.environment="production"

# Integration/Test keys (default if not set)
# firebase functions:config:set transbank.commerce_code="597055555532"
# firebase functions:config:set transbank.api_key="579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C"
# firebase functions:config:set transbank.environment="integration"

# ==================== MERCADOPAGO CONFIGURATION ====================
# Production keys
firebase functions:config:set mercadopago.access_token="APP_USR-xxxxx"
firebase functions:config:set mercadopago.environment="live"

# Sandbox keys (for development)
# firebase functions:config:set mercadopago.access_token="TEST-xxxxx"
# firebase functions:config:set mercadopago.environment="sandbox"

# ==================== DEPLOYMENT NOTES ====================
# 1. All providers are optional - only configured providers will be initialized
# 2. If no configuration is provided for a provider, it will be skipped during initialization
# 3. The system will work with any combination of providers (1, 2, or all 3)
# 4. Environment variables can also be set directly in GitHub Actions secrets
# 5. For local development, you can use .env files (not committed to repository)

# ==================== GITHUB ACTIONS SECRETS ====================
# Set these in your GitHub repository Settings > Secrets and variables > Actions:
# FIREBASE_TOKEN - Get with: firebase login:ci
# STRIPE_SECRET_KEY - Your Stripe secret key
# STRIPE_PUBLIC_KEY - Your Stripe publishable key  
# STRIPE_WEBHOOK_SECRET - Your Stripe webhook endpoint secret
# TRANSBANK_COMMERCE_CODE - Your Transbank commerce code
# TRANSBANK_API_KEY - Your Transbank API key
# TRANSBANK_ENVIRONMENT - "production" or "integration"
# MERCADOPAGO_ACCESS_TOKEN - Your MercadoPago access token
# MERCADOPAGO_ENVIRONMENT - "live" or "sandbox"

# ==================== VERIFY CONFIGURATION ====================
# After setting configuration, verify with:
# firebase functions:config:get

# ==================== LOCAL DEVELOPMENT ====================
# For local development, create a .env file in the root directory:
# STRIPE_SECRET_KEY=sk_test_xxxxx
# STRIPE_PUBLIC_KEY=pk_test_xxxxx
# STRIPE_WEBHOOK_SECRET=whsec_test_xxxxx
# TRANSBANK_COMMERCE_CODE=597055555532
# TRANSBANK_API_KEY=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
# TRANSBANK_ENVIRONMENT=integration
# MERCADOPAGO_ACCESS_TOKEN=TEST-xxxxx
# MERCADOPAGO_ENVIRONMENT=sandbox