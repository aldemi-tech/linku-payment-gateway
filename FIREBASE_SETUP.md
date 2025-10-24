# 🚀 Configuración Firebase + GitHub Actions para Linku Payment Gateway

## 📋 **Información del Proyecto Firebase**

**Proyecto Principal:** `linku-app` (ID: 890859388137)
**Firebase Token:** Generado automáticamente por el script `setup.sh`

## 🏗️ **Paso 1: Configuración de Ambientes Firebase**

### Opción A: Proyecto único con múltiples databases (✅ RECOMENDADO)
Usar `linku-app` para todos los ambientes con databases separadas:

```bash
# Crear databases para cada ambiente
gcloud firestore databases create \
  --database=linku-dev \
  --location=us-central \
  --project=linku-app

gcloud firestore databases create \
  --database=linku-qa \
  --location=us-central \
  --project=linku-app

gcloud firestore databases create \
  --database=linku-prod \
  --location=us-central \
  --project=linku-app

# Configurar alias único
firebase use linku-app
```

### Opción B: Proyectos separados (Para empresas grandes)
```bash
# Crear proyectos adicionales (ejecutar en consola)
firebase projects:create linku-payment-dev --display-name "Linku Payment Dev"
firebase projects:create linku-payment-qa --display-name "Linku Payment QA"

# Configurar aliases
firebase use --add linku-payment-dev --alias development
firebase use --add linku-payment-qa --alias qa  
firebase use --add linku-app --alias production
```

## 🔧 **Paso 2: Configurar Firebase Functions**

```bash
# Ir a la consola de Firebase para cada proyecto
# https://console.firebase.google.com/project/linku-app/functions

# Habilitar Cloud Functions API
gcloud services enable cloudfunctions.googleapis.com --project=linku-app

# Configurar variables de ambiente (ejecutar para cada proyecto)
firebase use linku-app

# Variables de producción
firebase functions:config:set \
  stripe.secret_key="sk_live_xxx" \
  stripe.webhook_secret="whsec_xxx" \
  transbank.commerce_code="CODIGO_COMERCIO_PROD" \
  transbank.api_key="API_KEY_PROD" \
  transbank.environment="production" \
  mercadopago.access_token="APP_USR_xxx" \
  app.environment="production"
```

## 🔑 **Paso 3: Generar Service Accounts para GitHub Actions**

### Para cada proyecto Firebase, ir a:
1. **Google Cloud Console**: https://console.cloud.google.com/
2. **IAM & Admin** > **Service Accounts**
3. **Create Service Account**

#### Configuración del Service Account:
```
Name: github-actions-deploy
Description: Service account for GitHub Actions deployment
Roles:
- Firebase Admin SDK Administrator Service Agent
- Cloud Functions Admin  
- Cloud Functions Service Agent
- Service Account User
```

#### Generar claves:
1. Hacer clic en el service account creado
2. **Keys** > **Add Key** > **Create new key** > **JSON**
3. Descargar el archivo JSON

## 📁 **Paso 4: Secretos de GitHub**

### En tu repositorio GitHub: **Settings** > **Secrets and variables** > **Actions**

#### Secretos Firebase:
```bash
# Token de Firebase (generado automáticamente por setup.sh)
FIREBASE_TOKEN=[GENERADO_AUTOMATICAMENTE]

# Project ID (único para todos los ambientes si usas Opción A)
FIREBASE_PROJECT_ID=linku-app

# Database Names por ambiente (si usas Opción A - múltiples databases)
FIREBASE_DATABASE_DEV=linku-dev
FIREBASE_DATABASE_QA=linku-qa
FIREBASE_DATABASE_PROD=linku-prod

# O Project IDs separados (si usas Opción B - múltiples proyectos)
FIREBASE_PROJECT_ID_DEV=linku-payment-dev
FIREBASE_PROJECT_ID_QA=linku-payment-qa        
FIREBASE_PROJECT_ID_PROD=linku-app

# Service Account Key (uno solo si usas Opción A)
FIREBASE_SERVICE_ACCOUNT_KEY=[base64 del JSON del service account]
```

#### Secretos de Payment Providers:

**Desarrollo:**
```bash
STRIPE_SECRET_KEY_DEV=sk_test_xxx
STRIPE_WEBHOOK_SECRET_DEV=whsec_xxx
TRANSBANK_COMMERCE_CODE_DEV=597055555532
TRANSBANK_API_KEY_DEV=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
MERCADOPAGO_ACCESS_TOKEN_DEV=TEST-xxx
```

**QA:**
```bash
STRIPE_SECRET_KEY_QA=sk_test_xxx
STRIPE_WEBHOOK_SECRET_QA=whsec_xxx  
STRIPE_PUBLISHABLE_KEY_QA=pk_test_xxx
TRANSBANK_COMMERCE_CODE_QA=597055555532
TRANSBANK_API_KEY_QA=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
MERCADOPAGO_ACCESS_TOKEN_QA=TEST-xxx
MERCADOPAGO_PUBLIC_KEY_QA=TEST-xxx
```

**Producción:**
```bash
STRIPE_SECRET_KEY_PROD=sk_live_xxx
STRIPE_WEBHOOK_SECRET_PROD=whsec_xxx
TRANSBANK_COMMERCE_CODE_PROD=[TU_CODIGO_COMERCIO_REAL]
TRANSBANK_API_KEY_PROD=[TU_API_KEY_REAL]
MERCADOPAGO_ACCESS_TOKEN_PROD=APP_USR_xxx
```

#### Secretos adicionales:
```bash
# Para notificaciones
SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx

# Para análisis de código
CODECOV_TOKEN=xxx
SONAR_TOKEN=xxx  
SNYK_TOKEN=xxx
```

## 🔐 **Paso 5: Convertir Service Account a Base64**

```bash
# Para cada archivo JSON descargado:
base64 -i service-account-key.json

# Copiar el resultado completo a los secretos de GitHub
```

## ⚙️ **Paso 6: Configurar GitHub Environments**

### En GitHub: **Settings** > **Environments**

#### Environment: `development`
- **Deployment branches:** `develop`
- **Environment secrets:** Todos los `*_DEV`
- **Reviewers:** No required

#### Environment: `qa`  
- **Deployment branches:** `qa`
- **Environment secrets:** Todos los `*_QA`
- **Reviewers:** 1 required

#### Environment: `production`
- **Deployment branches:** `main`
- **Environment secrets:** Todos los `*_PROD`  
- **Reviewers:** 2 required
- **Wait timer:** 5 minutes

#### Environment: `production-approval`
- **Deployment branches:** `main`
- **Reviewers:** 2 required (senior developers)
- **Wait timer:** 10 minutes

## 🌿 **Paso 7: Crear Branches**

```bash
# Crear y configurar branches
git checkout -b develop
git push -u origin develop

git checkout -b qa  
git push -u origin qa

git checkout main
```

## 🛡️ **Paso 8: Configurar Branch Protection**

### En GitHub: **Settings** > **Branches**

#### `develop` branch:
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- Status checks required: `Run Tests`, `Security Scan`

#### `qa` branch:
- ✅ Require a pull request before merging
- ✅ Require 1 approval
- ✅ Require status checks to pass before merging
- Status checks required: `Comprehensive Testing`, `Security & Compliance`, `Code Quality Analysis`

#### `main` branch:
- ✅ Require a pull request before merging  
- ✅ Require 2 approvals
- ✅ Require review from CODEOWNERS
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ✅ Restrict pushes that create merge commits

## 📝 **Paso 9: Configurar Webhooks**

### Para cada payment provider, configurar webhooks:

#### Stripe:
- **URL:** `https://us-central1-linku-app.cloudfunctions.net/stripeWebhook`
- **Events:** `payment_intent.succeeded`, `payment_method.attached`, `customer.subscription.updated`

#### MercadoPago:  
- **URL:** `https://us-central1-linku-app.cloudfunctions.net/mercadopagoWebhook`
- **Events:** `payment.created`, `payment.updated`

#### Transbank:
- **URL:** `https://us-central1-linku-app.cloudfunctions.net/transbankWebhook`
- Configurar según documentación de Transbank

## 🧪 **Paso 10: Primer Deploy de Prueba**

```bash
# Hacer un commit inicial
git add .
git commit -m "feat: initial payment gateway setup"

# Push a develop para activar el pipeline
git push origin develop

# Verificar en GitHub Actions que todo funcione
```

## ✅ **Checklist Final**

- [ ] Token Firebase generado y agregado a GitHub Secrets
- [ ] Proyectos Firebase creados para cada ambiente  
- [ ] Service Accounts creados y configurados
- [ ] Secretos de GitHub configurados
- [ ] Environments de GitHub configurados
- [ ] Branch protection configurado
- [ ] Webhooks de payment providers configurados
- [ ] Primer deploy ejecutado exitosamente

## 🆘 **URLs Importantes**

- **Firebase Console:** https://console.firebase.google.com/project/linku-app
- **Google Cloud Console:** https://console.cloud.google.com/
- **GitHub Repository Settings:** [TU_REPO]/settings
- **Firebase Functions Logs:** https://console.firebase.google.com/project/linku-app/functions/logs

---

**Siguiente paso:** Configurar los secretos en GitHub y hacer el primer push a `develop` para activar el pipeline de CI/CD.