# 🚀 Linku Payment Gateway - Deploy Simple

## 📋 **Configuración Básica**

Este proyecto despliega automáticamente a Firebase `linku-app` cuando haces push a la rama `main`.

**Proyecto Firebase:** `linku-app` (ID: 890859388137)
**Firebase Token:** Generado automáticamente por `./setup.sh`

---

## ⚙️ **GitHub Secrets Requeridos**

Ve a tu repositorio GitHub: **Settings** > **Secrets and variables** > **Actions**

### Secreto Firebase:
```
FIREBASE_TOKEN=[GENERADO_POR_SETUP_SCRIPT]
```

### Secretos de Payment Providers (para producción):
```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Transbank  
TRANSBANK_COMMERCE_CODE=[TU_CODIGO_COMERCIO]
TRANSBANK_API_KEY=[TU_API_KEY]

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=APP_USR_xxx
```

---

## 🚀 **Cómo Desplegar**

1. **Configurar secretos** en GitHub (ver arriba)

2. **Hacer push a main:**
   ```bash
   git add .
   git commit -m "feat: deploy payment gateway"
   git push origin main
   ```

3. **Verificar deployment:**
   - Ve a GitHub Actions en tu repo
   - Verifica que el workflow se ejecute correctamente
   - Functions estarán en: `https://us-central1-linku-app.cloudfunctions.net`

---

## 📱 **Funciones Disponibles**

Después del deploy, tendrás estas funciones:

- **Stripe:**
  - `stripeTokenizeCard` - Tokenizar tarjeta directa
  - `stripeProcessPayment` - Procesar pago
  - `stripeWebhook` - Webhook de Stripe

- **Transbank:**
  - `transbankTokenizeCard` - Tokenizar tarjeta directa
  - `transbankInitiatePayment` - Iniciar pago con redirección
  - `transbankConfirmPayment` - Confirmar pago
  - `transbankWebhook` - Webhook de Transbank

- **MercadoPago:**
  - `mercadopagoTokenizeCard` - Tokenizar tarjeta directa
  - `mercadopagoProcessPayment` - Procesar pago
  - `mercadopagoWebhook` - Webhook de MercadoPago

---

## 🗄️ **Firestore Collections**

Las siguientes collections se crearán automáticamente:

- `paymentCards` - Tarjetas tokenizadas
- `transactions` - Transacciones de pago  
- `paymentMethods` - Métodos de pago guardados
- `webhooks` - Logs de webhooks
- `logs` - Logs del sistema

---

## 🧪 **Testing Local**

```bash
# Instalar dependencias
npm install

# Compilar
npm run build

# Ejecutar tests
npm test

# Ejecutar emulador local
firebase emulators:start --only functions,firestore
```

---

## 🔧 **Configuración de Variables de Entorno**

Para desarrollo local, crea `.env.local`:

```bash
# .env.local (no commitear)
STRIPE_SECRET_KEY=sk_test_xxx
TRANSBANK_COMMERCE_CODE=597055555532
TRANSBANK_API_KEY=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
MERCADOPAGO_ACCESS_TOKEN=TEST-xxx
```

---

## 📞 **URLs Importantes**

- **Firebase Console:** https://console.firebase.google.com/project/linku-app
- **Functions:** https://console.firebase.google.com/project/linku-app/functions
- **Firestore:** https://console.firebase.google.com/project/linku-app/firestore
- **Authentication:** https://console.firebase.google.com/project/linku-app/authentication

---

## 🚀 **Setup Automático (Recomendado)**

### ¡Un solo comando hace todo! 

```bash
./setup.sh
```

**Lo que hace automáticamente:**
- ✅ Crea repositorio en `github.com/aldemi-tech/linku-payment-gateway`
- ✅ Configura GitHub Secrets (Firebase + Payment Providers)
- ✅ Hace push inicial y activa GitHub Actions
- ✅ Te pregunta si quieres usar claves de producción
- ✅ Abre GitHub Actions en el navegador para ver progreso

### Requisitos previos:
```bash
# GitHub CLI (si no está instalado, el script lo instala)
brew install gh

# Firebase CLI
npm install -g firebase-tools
```

---

## ⚙️ **Setup Manual (si prefieres hacerlo paso a paso)**

### GitHub Secrets Requeridos:

Ve a tu repositorio GitHub: **Settings** > **Secrets and variables** > **Actions**

```
FIREBASE_TOKEN=[GENERADO_AUTOMATICAMENTE_POR_SETUP]
```

### Deployment Manual:
```bash
git remote add origin git@github.com:aldemi-tech/linku-payment-gateway.git
git push -u origin main
```

---

## ✅ **Quick Setup**

1. ✅ Firebase configurado (`linku-app`)
2. ✅ Token generado  
3. ✅ Workflow creado
4. ✅ **Script automático disponible: `./setup.sh`**

**¡Ejecuta `./setup.sh` y listo! 🎉**