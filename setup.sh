#!/bin/bash

# 🚀 Script de Setup Simple para Linku Payment Gateway
# Deploy a Firebase linku-app

echo "🔥 Setup Automático - Linku Payment Gateway"
echo "============================================"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuración del repositorio
REPO_OWNER="aldemi-tech"
REPO_NAME="linku-payment-gateway"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}"

echo -e "${BLUE}📁 Repositorio: ${REPO_URL}${NC}"
echo ""

# Verificar que GitHub CLI esté instalado
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI no está instalado${NC}"
    echo -e "${YELLOW}Instalando GitHub CLI...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install gh
        else
            echo "Instala Homebrew primero: https://brew.sh"
            exit 1
        fi
    else
        # Linux/Other
        echo "Instala GitHub CLI: https://cli.github.com"
        exit 1
    fi
fi

echo -e "${GREEN}✅ GitHub CLI detectado${NC}"

# Verificar que Firebase CLI esté instalado
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI no está instalado${NC}"
    echo "Instala con: npm install -g firebase-tools"
    exit 1
fi

echo -e "${GREEN}✅ Firebase CLI detectado${NC}"

# Verificar login GitHub
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠️  No estás logueado en GitHub${NC}"
    echo "Ejecutando gh auth login..."
    gh auth login --scopes "repo,admin:repo_hook,workflow"
fi

echo -e "${GREEN}✅ Sesión GitHub verificada${NC}"

# Verificar permisos
echo -e "${BLUE}🔍 Verificando permisos GitHub...${NC}"
if ! gh auth status | grep -q "repo"; then
    echo -e "${YELLOW}⚠️  Necesitas permisos adicionales${NC}"
    gh auth refresh --scopes "repo,admin:repo_hook,workflow"
fi

# Verificar login Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${YELLOW}⚠️  No estás logueado en Firebase${NC}"
    echo "Ejecutando firebase login..."
    firebase login
fi

echo -e "${GREEN}✅ Sesión Firebase verificada${NC}"

# Configurar proyecto por defecto
echo -e "${BLUE}📋 Configurando proyecto linku-app...${NC}"
firebase use linku-app

# Verificar estructura de archivos
echo -e "${BLUE}📁 Verificando estructura del proyecto...${NC}"

required_files=(
    "package.json"
    "firebase.json" 
    "firestore.rules"
    "firestore.indexes.json"
    "src/index.ts"
    ".github/workflows/deploy.yml"
)

for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        echo -e "${GREEN}  ✅ $file${NC}"
    else
        echo -e "${RED}  ❌ $file (faltante)${NC}"
    fi
done

# Instalar dependencias si no existen
if [[ ! -d "node_modules" ]]; then
    echo -e "${BLUE}📦 Instalando dependencias...${NC}"
    npm install
fi

# Build inicial
echo -e "${BLUE}🔨 Compilando TypeScript...${NC}"
npm run build

# Verificar que el build fue exitoso
if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ Build exitoso${NC}"
else
    echo -e "${RED}❌ Error en build${NC}"
    exit 1
fi

# Verificar Firebase Functions
echo -e "${BLUE}🔍 Verificando Firebase Functions...${NC}"
firebase functions:list

# Configuración de ambiente local
echo -e "${BLUE}⚙️  Configurando variables de ambiente locales...${NC}"

# Archivo .env.local para desarrollo
cat > .env.local << EOF
# Variables de desarrollo local
STRIPE_SECRET_KEY=sk_test_51234567890
STRIPE_WEBHOOK_SECRET=whsec_test_123
TRANSBANK_COMMERCE_CODE=597055555532
TRANSBANK_API_KEY=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
TRANSBANK_ENVIRONMENT=integration
MERCADOPAGO_ACCESS_TOKEN=TEST-123456789
MERCADOPAGO_PUBLIC_KEY=TEST-987654321
APP_ENVIRONMENT=development
EOF

echo -e "${GREEN}✅ Archivo .env.local creado${NC}"

# Inicializar Firestore si no está inicializado
echo -e "${BLUE}🗄️  Inicializando Firestore...${NC}"
firebase firestore:databases:list > /dev/null 2>&1

# Verificar reglas de Firestore
echo -e "${BLUE}🛡️  Desplegando reglas de Firestore...${NC}"
firebase deploy --only firestore:rules

# Crear/verificar repositorio GitHub
echo -e "${BLUE}🏗️  Configurando repositorio GitHub...${NC}"

# Verificar si el repo ya existe
if gh repo view "${REPO_OWNER}/${REPO_NAME}" &> /dev/null; then
    echo -e "${GREEN}✅ Repositorio ya existe: ${REPO_URL}${NC}"
else
    echo -e "${YELLOW}🆕 Creando repositorio: ${REPO_URL}${NC}"
    
    # Crear repositorio
    gh repo create "${REPO_OWNER}/${REPO_NAME}" \
        --description "🚀 Linku Payment Gateway - Firebase Functions for Stripe, Transbank & MercadoPago" \
        --homepage "https://linku.app" \
        --public \
        --clone=false
        
    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✅ Repositorio creado exitosamente${NC}"
    else
        echo -e "${RED}❌ Error creando repositorio${NC}"
        exit 1
    fi
fi

# Configurar remote origin
if git remote get-url origin &> /dev/null; then
    echo -e "${GREEN}✅ Remote origin ya configurado${NC}"
else
    echo -e "${BLUE}🔗 Configurando remote origin...${NC}"
    git remote add origin "git@github.com:${REPO_OWNER}/${REPO_NAME}.git"
fi

# Configurar GitHub Secrets automáticamente
echo ""
echo -e "${PURPLE}🔑 Configurando GitHub Secrets...${NC}"

# Firebase Token - generar dinámicamente
echo -e "${BLUE}📝 Generando FIREBASE_TOKEN...${NC}"

# Generar token CI usando Firebase CLI
FIREBASE_TOKEN=$(firebase login:ci --no-localhost 2>/dev/null | grep -o '1//[A-Za-z0-9_-]*' || echo "")

if [[ -z "$FIREBASE_TOKEN" ]]; then
    echo -e "${YELLOW}⚠️  No se pudo generar token automáticamente${NC}"
    echo -e "${BLUE}🔑 Por favor ingresa tu Firebase CI token:${NC}"
    echo -e "${YELLOW}💡 Ejecuta: firebase login:ci${NC}"
    echo -n "Token: "
    read -rs FIREBASE_TOKEN
    echo ""
fi

if [[ -n "$FIREBASE_TOKEN" ]]; then
    gh secret set FIREBASE_TOKEN --body "$FIREBASE_TOKEN" --repo "${REPO_OWNER}/${REPO_NAME}"
    echo -e "${GREEN}✅ FIREBASE_TOKEN configurado${NC}"
else
    echo -e "${RED}❌ Error: No se pudo configurar FIREBASE_TOKEN${NC}"
    exit 1
fi

# Configurar secrets de payment providers
echo ""
echo -e "${YELLOW}🔑 ¿Quieres configurar las claves reales de los payment providers? (y/n)${NC}"
read -r configure_production_keys

if [[ $configure_production_keys == "y" || $configure_production_keys == "Y" ]]; then
    echo -e "${BLUE}📝 Configurando claves de producción...${NC}"
    
    # Stripe
    echo -e "${PURPLE}🟣 STRIPE:${NC}"
    echo -n "Secret Key (sk_live_...): "
    read -rs stripe_secret
    echo ""
    if [[ -n "$stripe_secret" ]]; then
        gh secret set STRIPE_SECRET_KEY --body "$stripe_secret" --repo "${REPO_OWNER}/${REPO_NAME}"
    fi
    
    echo -n "Webhook Secret (whsec_...): "
    read -rs stripe_webhook
    echo ""
    if [[ -n "$stripe_webhook" ]]; then
        gh secret set STRIPE_WEBHOOK_SECRET --body "$stripe_webhook" --repo "${REPO_OWNER}/${REPO_NAME}"
    fi
    
    # Transbank
    echo -e "${PURPLE}🔵 TRANSBANK:${NC}"
    echo -n "Commerce Code: "
    read -r transbank_commerce
    if [[ -n "$transbank_commerce" ]]; then
        gh secret set TRANSBANK_COMMERCE_CODE --body "$transbank_commerce" --repo "${REPO_OWNER}/${REPO_NAME}"
    fi
    
    echo -n "API Key: "
    read -rs transbank_api
    echo ""
    if [[ -n "$transbank_api" ]]; then
        gh secret set TRANSBANK_API_KEY --body "$transbank_api" --repo "${REPO_OWNER}/${REPO_NAME}"
    fi
    
    # MercadoPago
    echo -e "${PURPLE}� MERCADOPAGO:${NC}"
    echo -n "Access Token (APP_USR_...): "
    read -rs mercadopago_token
    echo ""
    if [[ -n "$mercadopago_token" ]]; then
        gh secret set MERCADOPAGO_ACCESS_TOKEN --body "$mercadopago_token" --repo "${REPO_OWNER}/${REPO_NAME}"
    fi
    
    echo -e "${GREEN}✅ Claves de producción configuradas${NC}"
else
    echo -e "${BLUE}📝 Configurando claves de testing/desarrollo...${NC}"
    
    # Stripe Test Keys
    gh secret set STRIPE_SECRET_KEY --body "sk_test_51234567890abcdef" --repo "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
    gh secret set STRIPE_WEBHOOK_SECRET --body "whsec_test123456789" --repo "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
    
    # Transbank Integration Keys  
    gh secret set TRANSBANK_COMMERCE_CODE --body "597055555532" --repo "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
    gh secret set TRANSBANK_API_KEY --body "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C" --repo "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
    
    # MercadoPago Test Keys
    gh secret set MERCADOPAGO_ACCESS_TOKEN --body "TEST-1234567890-123456-abcdef123456789-123456789" --repo "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
    
    echo -e "${YELLOW}⚠️  Usando claves de testing. Configura las reales después en:${NC}"
    echo "   ${REPO_URL}/settings/secrets/actions"
fi

echo -e "${GREEN}✅ Secrets configurados${NC}"

# Test de emuladores
echo -e "${BLUE}🧪 ¿Quieres ejecutar los emuladores para testing? (y/n)${NC}"
read -r start_emulators

if [[ $start_emulators == "y" || $start_emulators == "Y" ]]; then
    echo -e "${BLUE}🚀 Iniciando emuladores Firebase...${NC}"
    firebase emulators:start --only functions,firestore
fi

echo ""
echo -e "${GREEN}🎉 ¡Configuración completada!${NC}"
# Push inicial y activar GitHub Actions
echo ""
echo -e "${PURPLE}🚀 Realizando push inicial...${NC}"

# Cambiar a branch main si estamos en otra
current_branch=$(git branch --show-current)
if [[ "$current_branch" != "main" ]]; then
    git checkout -b main 2>/dev/null || git checkout main
fi

# Push inicial
git push -u origin main --force

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ Push exitoso - GitHub Actions activado${NC}"
else
    echo -e "${RED}❌ Error en push${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 ¡SETUP COMPLETADO EXITOSAMENTE! 🎉${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}📁 Repositorio:${NC} ${REPO_URL}"
echo -e "${BLUE}🔥 Firebase:${NC} https://console.firebase.google.com/project/linku-app"
echo -e "${BLUE}⚡ GitHub Actions:${NC} ${REPO_URL}/actions"
echo -e "${BLUE}📊 Firestore:${NC} https://console.firebase.google.com/project/linku-app/firestore"
echo ""
echo -e "${YELLOW}🔍 Verificar deployment:${NC}"
echo "1. Ve a ${REPO_URL}/actions"
echo "2. Verifica que el workflow 'Deploy to Firebase' se esté ejecutando"
echo "3. Una vez completado, tus functions estarán en:"
echo "   https://us-central1-linku-app.cloudfunctions.net"
echo ""
echo -e "${PURPLE}📚 Documentación:${NC} Ver README_DEPLOY.md para más detalles"
echo ""
echo -e "${GREEN}🚀 ¡Tu Payment Gateway está siendo desplegado automáticamente!${NC}"

# Función para verificar status del deployment (opcional)
echo ""
echo -e "${BLUE}🔍 ¿Quieres esperar y verificar que el deployment sea exitoso? (y/n)${NC}"
read -r wait_for_deployment

if [[ $wait_for_deployment == "y" || $wait_for_deployment == "Y" ]]; then
    echo -e "${YELLOW}⏳ Esperando que GitHub Actions complete el deployment...${NC}"
    echo "   (Esto puede tomar 3-5 minutos)"
    
    # Abrir GitHub Actions en el navegador
    gh run list --repo "${REPO_OWNER}/${REPO_NAME}" --limit 1 &> /dev/null && {
        echo -e "${BLUE}🌐 Abriendo GitHub Actions en el navegador...${NC}"
        gh run view --repo "${REPO_OWNER}/${REPO_NAME}" --web || true
    }
    
    echo ""
    echo -e "${PURPLE}💡 TIP:${NC} Mientras esperas, puedes:"
    echo "  • Ver el progreso en: ${REPO_URL}/actions"
    echo "  • Preparar tu frontend para usar las functions"
    echo "  • Revisar la documentación en README_DEPLOY.md"
    echo ""
fi