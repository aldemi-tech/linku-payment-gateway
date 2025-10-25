# GitHub Actions CI/CD Pipeline

## Descripción del Pipeline

Este proyecto implementa un pipeline CI/CD completo con tres ambientes: **Desarrollo**, **QA** y **Producción**. El flujo está diseñado para garantizar la máxima calidad y seguridad del código antes del despliegue.

## 🚀 Ambientes y Flujo de Trabajo

### Estrategia de Branching
- **`develop`** → Ambiente de Desarrollo
- **`qa`** → Ambiente de QA  
- **`main`** → Ambiente de Producción

### 1. Desarrollo (Development)
- **Trigger**: Push a la rama `develop`
- **URL**: `https://us-central1-{PROJECT_ID_DEV}.cloudfunctions.net`
- **Configuración**: Ambiente de integración/testing

#### Proceso:
1. ✅ Tests unitarios y linting
2. 🔒 Auditoría de seguridad básica  
3. 🏗️ Build del proyecto
4. 🚀 Deploy automático
5. 🧪 Tests de integración básicos

### 2. QA (Quality Assurance)
- **Trigger**: Push a la rama `qa`
- **URL**: `https://us-central1-{PROJECT_ID_QA}.cloudfunctions.net`
- **Configuración**: Ambiente de pre-producción

#### Proceso:
1. ✅ Suite completa de tests con cobertura
2. 🔒 Análisis de seguridad avanzado (SAST, dependencias)
3. 📊 Análisis de calidad de código (SonarCloud)
4. 🏗️ Build con validaciones estrictas
5. 🚀 Deploy automático a QA
6. 🧪 Tests E2E y de rendimiento
7. 📝 Comentario automático en el PR con resultados

### 3. Producción (Production)
- **Trigger**: 
  - Pull Request hacia `main` (solo cuando se hace merge)
  - Release publicado
  - Manual con `workflow_dispatch`
- **URL**: `https://us-central1-{PROJECT_ID_PROD}.cloudfunctions.net`
- **Configuración**: Ambiente de producción

#### Proceso:
**En PR abierto:**
1. ✅ Validación de preparación para producción
2. 🔒 Auditoría de seguridad básica
3. 💬 Comentario automático con resultados

**Al hacer merge del PR:**
1. ✅ Validación completa de preparación para producción
2. 🔒 Escaneo final de seguridad (OWASP ZAP, Snyk)
3. 👥 **Aprobación manual requerida** (excepto emergencias)
4. 💾 Backup automático de la configuración actual
5. 🏗️ Build de producción optimizado
6. 🚀 Deploy con estrategia Blue-Green
7. 🔥 Warm-up de funciones
8. 🧪 Tests de smoke en producción
9. 📊 Monitoreo post-deploy por 24h
10. 📢 Notificaciones a equipos

### 4. Promoción Entre Ambientes
- **Trigger**: Manual con `workflow_dispatch`
- **Flujo**: `develop` → `qa` → `main`
- **Proceso**: Crea PRs automáticos con validaciones

### 5. Rollback de Emergencia
- **Trigger**: Manual con `workflow_dispatch`
- **Requiere**: Confirmación explícita y razón del rollback

## 📋 Variables de Entorno Requeridas

### Secrets de GitHub (por ambiente)

#### Development
- `FIREBASE_PROJECT_ID_DEV`
- `FIREBASE_SERVICE_ACCOUNT_DEV` (base64)
- `FIREBASE_TOKEN`
- `STRIPE_SECRET_KEY_DEV`
- `STRIPE_WEBHOOK_SECRET_DEV`
- `TRANSBANK_COMMERCE_CODE_DEV`
- `TRANSBANK_API_KEY_DEV`
- `MERCADOPAGO_ACCESS_TOKEN_DEV`

#### QA
- `FIREBASE_PROJECT_ID_QA`
- `FIREBASE_SERVICE_ACCOUNT_QA` (base64)
- `STRIPE_SECRET_KEY_QA`
- `STRIPE_WEBHOOK_SECRET_QA`
- `STRIPE_PUBLISHABLE_KEY_QA`
- `TRANSBANK_COMMERCE_CODE_QA`
- `TRANSBANK_API_KEY_QA`
- `MERCADOPAGO_ACCESS_TOKEN_QA`
- `MERCADOPAGO_PUBLIC_KEY_QA`

#### Production
- `FIREBASE_PROJECT_ID_PROD`
- `FIREBASE_SERVICE_ACCOUNT_PROD` (base64)
- `STRIPE_SECRET_KEY_PROD`
- `STRIPE_WEBHOOK_SECRET_PROD`
- `TRANSBANK_COMMERCE_CODE_PROD`
- `TRANSBANK_API_KEY_PROD`
- `MERCADOPAGO_ACCESS_TOKEN_PROD`

#### Herramientas y Notificaciones
- `SLACK_WEBHOOK_URL`
- `CODECOV_TOKEN`
- `SONAR_TOKEN`
- `SNYK_TOKEN`

## 🔧 Configuración Inicial

### 1. Configurar Firebase Projects
```bash
# Crear proyectos para cada ambiente
firebase projects:create aldemi-payment-dev
firebase projects:create aldemi-payment-qa  
firebase projects:create aldemi-payment-prod

# Habilitar Cloud Functions en cada proyecto
firebase use aldemi-payment-dev
firebase functions:config:set app.environment="development"

firebase use aldemi-payment-qa
firebase functions:config:set app.environment="qa"

firebase use aldemi-payment-prod
firebase functions:config:set app.environment="production"
```

### 2. Generar Service Accounts
Para cada proyecto de Firebase:
```bash
# Ir a Firebase Console > Project Settings > Service Accounts
# Generar nueva clave privada
# Convertir a base64 para GitHub Secrets:
cat service-account-key.json | base64
```

### 3. Configurar GitHub Environments

#### Development Environment
- No requiere aprobación
- Auto-deploy habilitado
- Secrets de desarrollo configurados

#### QA Environment  
- No requiere aprobación
- Deploy condicional en PRs
- Secrets de QA configurados

#### Production Environment
- **Requiere aprobación manual**
- Reviewers configurados
- Wait timer de 5 minutos
- Secrets de producción configurados

#### Production-Approval Environment
- **Requiere aprobación de 2 revisores**
- Solo para deployments críticos
- Wait timer de 10 minutos

### 4. Configurar Branch Protection

#### Rama `develop`
- Require PR reviews: No (desarrollo rápido)
- Require status checks: Sí
  - `Run Tests`
  - `Security Scan`
- Allow force pushes: Sí (para desarrollo)

#### Rama `qa`
- Require PR reviews: Sí (1 revisor)
- Require status checks: Sí
  - `Comprehensive Testing`
  - `Security & Compliance`  
  - `Code Quality Analysis`
- Require branches to be up to date: Sí
- Restrict pushes that create merge commits: No

#### Rama `main`
- Require PR reviews: Sí (2 revisores)
- Require status checks: Sí
  - `Validate Production Readiness`
  - `Final Security Scan`
- Require branches to be up to date: Sí
- Restrict pushes that create merge commits: Sí
- Require review from CODEOWNERS: Sí

## 🔒 Seguridad y Compliance

### Validaciones de Seguridad
1. **npm audit** - Vulnerabilidades en dependencias
2. **Snyk** - Análisis profundo de vulnerabilidades
3. **SAST** - Análisis estático de código
4. **Secrets Detection** - Detección de secretos hardcoded
5. **OWASP ZAP** - Escaneo de seguridad web (producción)

### Calidad de Código
1. **ESLint** - Linting con reglas estrictas
2. **TypeScript** - Verificación de tipos
3. **Jest** - Tests unitarios con 80% cobertura mínima
4. **SonarCloud** - Análisis completo de calidad

## 📊 Monitoreo y Alertas

### Notificaciones Slack
- ✅ Deploy exitoso en cada ambiente
- ❌ Fallos en el pipeline
- 🚨 Rollbacks de emergencia
- 📊 Resultados de tests y cobertura

### Métricas Rastreadas
- Tiempo de build
- Cobertura de código
- Vulnerabilidades encontradas
- Tiempo de deploy
- Health checks post-deploy

## 🚨 Procedimientos de Emergencia

### Rollback de Emergencia
1. Ir a Actions > "Emergency Rollback"
2. Seleccionar ambiente (production/qa)
3. Especificar backup tag
4. Escribir razón del rollback
5. Confirmar con "CONFIRM"
6. Se creará automáticamente un issue de incidencia

### Hotfix de Producción
1. Crear rama `hotfix/nombre-descriptivo`
2. Implementar fix mínimo
3. Crear PR hacia `main`
4. Pipeline QA se ejecuta automáticamente
5. Merge tras aprobación
6. Deploy automático a producción

## 📝 Scripts Disponibles

```bash
# Tests
npm run test              # Tests unitarios
npm run test:coverage     # Tests con cobertura
npm run test:e2e         # Tests end-to-end
npm run test:integration # Tests de integración

# Calidad
npm run lint             # Linting
npm run lint:fix         # Fix automático de linting

# Validación
npm run validate:config:production  # Validar config de producción
npm run check:breaking-changes     # Detectar cambios breaking

# Monitoreo
npm run monitor:deployment:health  # Monitorear salud del deployment
```

## 🔄 Flujo de Desarrollo Recomendado

### Feature Development
```bash
# 1. Crear feature branch desde develop
git checkout develop
git pull origin develop
git checkout -b feature/nueva-funcionalidad

# 2. Desarrollar y commitear cambios
git add .
git commit -m "feat: nueva funcionalidad"

# 3. Push a rama feature
git push origin feature/nueva-funcionalidad

# 4. Crear PR hacia develop
# 5. Merge a develop (deploy automático a Development)
git checkout develop
git merge feature/nueva-funcionalidad
git push origin develop  # 🚀 Auto-deploy a Development
```

### Promoción a QA
```bash
# 1. Usar GitHub Actions "Promote Between Environments"
# 2. Seleccionar: develop → qa
# 3. Se crea PR automático con validaciones
# 4. Review y merge del PR 
# 5. Deploy automático a QA 🧪
```

### Release a Producción  
```bash
# 1. Usar GitHub Actions "Promote Between Environments"
# 2. Seleccionar: qa → main
# 3. Se crea PR automático con validaciones estrictas
# 4. Code review y aprobación por 2 revisores ✅
# 5. Merge a main (requiere aprobación manual para producción) 👥
# 6. Deploy automático a producción tras aprobación 🚀
```

### Hotfix de Emergencia
```bash
# 1. Crear hotfix branch desde main
git checkout main
git pull origin main  
git checkout -b hotfix/critical-fix

# 2. Implementar fix mínimo
git add .
git commit -m "hotfix: critical security fix"

# 3. Crear PR directo a main (bypass normal flow)
# 4. Emergency approval process
# 5. Deploy inmediato con monitoreo intensivo
```

## 🆘 Troubleshooting

### Deploy Fallido
1. Revisar logs en GitHub Actions
2. Verificar configuración de ambiente
3. Validar secrets y variables
4. Ejecutar tests localmente
5. Si es crítico, usar rollback de emergencia

### Tests Fallando
1. Ejecutar localmente: `npm test`
2. Verificar cobertura: `npm run test:coverage`
3. Revisar cambios en PR
4. Actualizar tests si es necesario

### Variables Faltantes
1. Revisar GitHub Secrets
2. Validar nombres de variables
3. Verificar permisos de ambiente
4. Contactar DevOps si persiste

Este pipeline está diseñado para garantizar despliegues seguros y confiables con múltiples capas de validación y la capacidad de recuperación rápida en caso de problemas.