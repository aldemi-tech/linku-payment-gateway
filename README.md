# 🚀 Linku Payment Gateway

**Firebase Cloud Functions para integración completa de pagos**

> Integración real con Stripe, Transbank y MercadoPago usando SDKs oficiales

---

## ⚡ **Setup Rápido**

```bash
# 1. Clonar repositorio  
git clone https://github.com/aldemi-tech/linku-payment-gateway.git
cd linku-payment-gateway

# 2. Setup automático (crea repo, secrets, deploy)
./setup.sh
```

**¡Eso es todo!** El script hace:
- ✅ Instala dependencias
- ✅ Genera Firebase CI token seguramente  
- ✅ Configura GitHub Secrets
- ✅ Despliega automáticamente a Firebase

---

## 🎯 Características

### Proveedores Soportados
- ✅ **Stripe** - Tokenización directa
- ✅ **Transbank OneClick** - Tokenización con redirección web
- 🔄 **MercadoPago** - Próximamente

### Métodos de Tokenización
1. **Tokenización Directa** (Stripe)
   - Formulario en la app
   - Sin redirección
   - Inmediato

2. **Tokenización con Redirección** (Transbank)
   - Genera link de pago
   - Abre WebView
   - Callback de confirmación

## 📁 Estructura del Proyecto

```
payment-gateway-functions/
├── src/
│   ├── index.ts                 # Cloud Functions principales
│   ├── types/
│   │   └── index.ts            # TypeScript types e interfaces
│   ├── utils/
│   │   └── index.ts            # Utilidades compartidas
│   └── providers/
│       ├── base.ts             # Interface base
│       ├── factory.ts          # Factory de proveedores
│       ├── stripe.ts           # Implementación Stripe
│       └── transbank.ts        # Implementación Transbank
├── lib/                         # Código compilado (generado)
├── node_modules/
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── firebase.json
└── README.md
```

## 🚀 Instalación

### 1. Clonar e Instalar Dependencias

```bash
cd payment-gateway-functions
npm install
```

### 2. Configurar Firebase

```bash
# Login a Firebase
firebase login

# Inicializar proyecto (si no está inicializado)
firebase init functions

# Seleccionar proyecto existente o crear uno nuevo
```

### 3. Configurar Variables de Entorno

#### Opción A: Firebase Functions Config (Recomendado para producción)

```bash
# Stripe
firebase functions:config:set stripe.public_key="pk_live_..."
firebase functions:config:set stripe.secret_key="sk_live_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."

# Transbank
firebase functions:config:set transbank.merchant_id="123456789"
firebase functions:config:set transbank.secret_key="your_secret_key"
firebase functions:config:set transbank.api_url="https://webpay3g.transbank.cl"
```

#### Opción B: Variables de Entorno Locales (Para desarrollo)

Crear archivo `.env` en la raíz:

```env
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

TRANSBANK_MERCHANT_ID=123456789
TRANSBANK_SECRET_KEY=your_secret_key
TRANSBANK_API_URL=https://webpay3gint.transbank.cl
```

## 🔧 Desarrollo

### Compilar TypeScript

```bash
npm run build
```

### Ejecutar Emuladores Locales

```bash
npm run serve
```

Esto iniciará los emuladores de Firebase Functions en `http://localhost:5001`.

### Linting

```bash
# Ver errores
npm run lint

# Corregir automáticamente
npm run lint:fix
```

## 📤 Deployment

### Deploy todas las funciones

```bash
npm run deploy
```

### Deploy función específica

```bash
firebase deploy --only functions:tokenizeCardDirect
firebase deploy --only functions:processPayment
```

## 📚 API Reference

### 1. Tokenización Directa (Stripe)

**Function:** `tokenizeCardDirect`

**Request:**
```typescript
{
  user_id: string;
  provider: "stripe";
  card_number: string;
  card_exp_month: number;
  card_exp_year: number;
  card_cvv: string;
  card_holder_name: string;
  set_as_default?: boolean;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    token_id: string;
    card_last4: string;
    card_brand: string;
    card_exp_month: number;
    card_exp_year: number;
    is_default: boolean;
  }
}
```

**Ejemplo desde la App:**
```typescript
const functions = getFunctions();
const tokenizeCard = httpsCallable(functions, 'tokenizeCardDirect');

const result = await tokenizeCard({
  user_id: currentUser.uid,
  provider: 'stripe',
  card_number: '4242424242424242',
  card_exp_month: 12,
  card_exp_year: 2025,
  card_cvv: '123',
  card_holder_name: 'Juan Pérez',
  set_as_default: true,
});

console.log(result.data); // { success: true, data: { token_id: '...' } }
```

### 2. Crear Sesión de Tokenización (Transbank)

**Function:** `createTokenizationSession`

**Request:**
```typescript
{
  user_id: string;
  provider: "transbank";
  return_url: string;
  set_as_default?: boolean;
  metadata?: Record<string, any>;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    session_id: string;
    redirect_url: string;  // URL para abrir en WebView
    expires_at: Timestamp;
  }
}
```

**Ejemplo desde la App:**
```typescript
const createSession = httpsCallable(functions, 'createTokenizationSession');

const result = await createSession({
  user_id: currentUser.uid,
  provider: 'transbank',
  return_url: 'myapp://payment/callback',
});

// Abrir WebView con redirect_url
const { redirect_url, session_id } = result.data.data;
Linking.openURL(redirect_url);
```

### 3. Completar Tokenización (Callback)

**Function:** `completeTokenization`

**Request:**
```typescript
{
  session_id: string;
  provider: "transbank";
  callback_data: any; // Datos del callback de Transbank
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    token_id: string;
    card_last4: string;
    card_brand: string;
    card_exp_month: number;
    card_exp_year: number;
    is_default: boolean;
  }
}
```

### 4. Procesar Pago

**Function:** `processPayment`

**Request:**
```typescript
{
  user_id: string;
  professional_id: string;
  service_request_id: string;
  amount: number;
  currency: string;
  provider: "stripe" | "transbank";
  token_id: string; // Token de tarjeta guardado
  description: string;
  metadata?: Record<string, any>;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    payment_id: string;
    status: "completed";
    amount: number;
    currency: string;
    provider_payment_id: string;
  }
}
```

**Ejemplo:**
```typescript
const processPayment = httpsCallable(functions, 'processPayment');

const result = await processPayment({
  user_id: currentUser.uid,
  professional_id: 'prof_123',
  service_request_id: 'req_456',
  amount: 50000, // CLP
  currency: 'CLP',
  provider: 'stripe',
  token_id: 'stripe_token_xyz',
  description: 'Pago por servicio de plomería',
});
```

### 5. Obtener Tarjetas del Usuario

**Function:** `getUserCards`

**Request:**
```typescript
{
  user_id: string;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    cards: Array<{
      token_id: string;
      card_last4: string;
      card_brand: string;
      card_exp_month: number;
      card_exp_year: number;
      card_holder_name?: string;
      is_default: boolean;
      provider: string;
      created_at: Timestamp;
    }>
  }
}
```

### 6. Eliminar Tarjeta

**Function:** `deleteCard`

**Request:**
```typescript
{
  token_id: string;
}
```

### 7. Reembolsar Pago

**Function:** `refundPayment`

**Request:**
```typescript
{
  payment_id: string;
  amount?: number; // Opcional, si no se especifica reembolsa el total
}
```

## 🔐 Seguridad

### Reglas de Firestore

Agregar estas reglas en Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Card Tokens - Solo el dueño puede leer/escribir
    match /card_tokens/{tokenId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.user_id;
    }
    
    // Payments - Usuario o profesional pueden leer
    match /payments/{paymentId} {
      allow read: if request.auth != null 
        && (request.auth.uid == resource.data.user_id 
            || request.auth.uid == resource.data.professional_id);
      allow create: if request.auth != null 
        && request.auth.uid == request.resource.data.user_id;
    }
    
    // Tokenization Sessions - Solo el dueño
    match /tokenization_sessions/{sessionId} {
      allow read: if request.auth != null 
        && request.auth.uid == resource.data.user_id;
    }
  }
}
```

### Validaciones

- ✅ Autenticación requerida para todas las funciones
- ✅ Validación de user_id vs auth.uid
- ✅ Validación de algoritmo Luhn para números de tarjeta
- ✅ Validación de fechas de expiración
- ✅ Sanitización de logs (no se registran datos sensibles)
- ✅ Verificación de signatures en webhooks

## 🌐 Webhooks

### Stripe Webhook

**URL:** `https://[region]-[project-id].cloudfunctions.net/stripeWebhook`

Configurar en Stripe Dashboard:
- `charge.succeeded`
- `charge.failed`
- `charge.refunded`

### Transbank Webhook

**URL:** `https://[region]-[project-id].cloudfunctions.net/transbankWebhook`

Configurar con Transbank (generalmente basado en IP whitelist).

## 🧪 Testing

### Test con Tarjetas de Prueba

**Stripe:**
```
Número: 4242 4242 4242 4242
CVV: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
```

**Transbank:**
```
Usar ambiente de integración (webpay3gint.transbank.cl)
Tarjetas de prueba proporcionadas por Transbank
```

## 📊 Colecciones de Firestore

### `card_tokens`
```typescript
{
  token_id: string;
  user_id: string;
  provider: "stripe" | "transbank";
  card_last4: string;
  card_brand: string;
  card_exp_month: number;
  card_exp_year: number;
  card_holder_name?: string;
  is_default: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  metadata: object;
}
```

### `payments`
```typescript
{
  payment_id: string;
  user_id: string;
  professional_id: string;
  service_request_id: string;
  amount: number;
  currency: string;
  provider: "stripe" | "transbank";
  provider_payment_id?: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "refunded";
  token_id?: string;
  payment_method_details?: object;
  error_message?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at?: Timestamp;
  metadata?: object;
}
```

### `tokenization_sessions`
```typescript
{
  session_id: string;
  user_id: string;
  provider: "stripe" | "transbank";
  status: "pending" | "completed" | "failed" | "expired";
  redirect_url?: string;
  return_url: string;
  token_id?: string;
  error_message?: string;
  created_at: Timestamp;
  expires_at: Timestamp;
  completed_at?: Timestamp;
  metadata?: object;
}
```

## 🐛 Troubleshooting

### Error: "UNAUTHENTICATED"
- Verifica que el usuario esté autenticado con Firebase Auth
- Verifica que el `idToken` esté siendo enviado correctamente

### Error: "PROVIDER_NOT_FOUND"
- Verifica la configuración de variables de entorno
- Revisa los logs: `npm run logs`

### Error: "INVALID_CARD"
- Verifica que el número de tarjeta sea válido (algoritmo Luhn)
- Para Stripe, usa tarjetas de prueba válidas

## 📝 Licencia

ISC

## 👥 Autor

**Aldemi Tech**

---

## 🔄 Próximas Mejoras

- [ ] Soporte para MercadoPago
- [ ] Pagos recurrentes
- [ ] Soporte para múltiples monedas
- [ ] Dashboard de administración
- [ ] Retry automático de pagos fallidos
- [ ] Notificaciones push en cambios de estado
