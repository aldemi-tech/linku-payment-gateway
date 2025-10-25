# Payment Gateway Cloud Functions

Este proyecto implementa un gateway de pagos completo usando Firebase Cloud Functions con soporte para múltiples proveedores de pago: **Stripe**, **Transbank** y **MercadoPago**.

## Características Principales

### ✅ Proveedores de Pago Implementados

- **Stripe**: Tokenización directa y por redirección, pagos, webhooks
- **Transbank OneClick**: Tokenización por redirección, pagos, webhooks
- **MercadoPago**: Tokenización directa y por redirección, pagos, webhooks

### ✅ Funcionalidades

- **Tokenización de Tarjetas**: Guarda tarjetas de forma segura en Firestore
- **Procesamiento de Pagos**: Procesa pagos usando tarjetas tokenizadas
- **Webhooks**: Maneja eventos de los proveedores de pago
- **Gestión de Tarjetas**: Listar, eliminar tarjetas guardadas
- **Reembolsos**: Procesa reembolsos totales y parciales

### ✅ Estructura de Datos

Las tarjetas se guardan en la colección `payment_cards` con esta estructura:

```typescript
interface PaymentCard {
  card_id: string;
  user_id: string;
  card_holder_name: string;
  card_last_four: string;
  card_brand: 'visa' | 'mastercard' | 'amex' | 'other';
  card_type: 'credit' | 'debit';
  expiration_month: number;
  expiration_year: number;
  alias?: string; // Nombre personalizado para identificar la tarjeta
  is_default: boolean;
  payment_token?: string; // Token del procesador de pagos
  created_at: Timestamp;
  updated_at: Timestamp;
}
```

Los pagos se guardan en la colección `payments`:

```typescript
interface Payment {
  payment_id: string;
  order_id: string;
  user_id: string;
  professional_id?: string;
  amount: number;
  total_amount?: number;
  commission_amount?: number;
  currency: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  transaction_id?: string;
  service_name?: string;
  service_title?: string;
  client_name?: string;
  client_email?: string;
  withdrawal_status?: 'pending' | 'processing' | 'completed';
  available_for_withdrawal?: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at?: Timestamp;
}
```

## Configuración

### Variables de Entorno

Configura las siguientes variables en Firebase Functions:

```bash
# Stripe
firebase functions:config:set stripe.secret_key="sk_test_..." stripe.public_key="pk_test_..." stripe.webhook_secret="whsec_..."

# Transbank
firebase functions:config:set transbank.commerce_code="597055555532" transbank.api_key="579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C" transbank.environment="integration"

# MercadoPago
firebase functions:config:set mercadopago.access_token="TEST-..." mercadopago.environment="sandbox"
```

### Dependencias

```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.9.0",
    "stripe": "^13.10.0",
    "transbank-sdk": "^3.0.0",
    "mercadopago": "^2.0.8",
    "axios": "^1.6.0"
  }
}
```

## Cloud Functions Disponibles

### Tokenización de Tarjetas

#### `tokenizeCardDirect`
Tokeniza una tarjeta directamente (Stripe, MercadoPago)

```javascript
const result = await functions.httpsCallable('tokenizeCardDirect')({
  user_id: "user123",
  provider: "stripe",
  card_number: "4242424242424242",
  card_exp_month: 12,
  card_exp_year: 2025,
  card_cvv: "123",
  card_holder_name: "John Doe",
  set_as_default: true
});
```

#### `createTokenizationSession`
Crea una sesión de tokenización por redirección (Transbank, MercadoPago)

```javascript
const result = await functions.httpsCallable('createTokenizationSession')({
  user_id: "user123",
  provider: "transbank",
  return_url: "https://mi-app.com/callback",
  set_as_default: true
});
// Redirige al usuario a result.data.redirect_url
```

#### `completeTokenization`
Completa la tokenización después del callback

```javascript
const result = await functions.httpsCallable('completeTokenization')({
  session_id: "tbk_session_123",
  provider: "transbank",
  callback_data: { /* datos del callback */ }
});
```

### Procesamiento de Pagos

#### `processPayment`
Procesa un pago usando una tarjeta tokenizada

```javascript
const result = await functions.httpsCallable('processPayment')({
  user_id: "user123",
  professional_id: "prof456",
  service_request_id: "service789",
  amount: 10000,
  currency: "CLP",
  provider: "stripe",
  token_id: "card_1234567890", // card_id o payment_token
  description: "Servicio profesional"
});
```

### Gestión de Tarjetas

#### `getUserCards`
Obtiene las tarjetas guardadas del usuario

```javascript
const result = await functions.httpsCallable('getUserCards')({
  user_id: "user123"
});
```

#### `deleteCard`
Elimina una tarjeta guardada

```javascript
const result = await functions.httpsCallable('deleteCard')({
  card_id: "card_1234567890"
});
```

### Reembolsos

#### `refundPayment`
Procesa un reembolso

```javascript
const result = await functions.httpsCallable('refundPayment')({
  payment_id: "payment_123",
  amount: 5000 // opcional, si no se especifica reembolsa el total
});
```

## Webhooks

### URLs de Webhooks

Configura estas URLs en cada proveedor:

- **Stripe**: `https://[region]-[project].cloudfunctions.net/stripeWebhook`
- **Transbank**: `https://[region]-[project].cloudfunctions.net/transbankWebhook`
- **MercadoPago**: `https://[region]-[project].cloudfunctions.net/mercadoPagoWebhook`

### Eventos Manejados

- **Stripe**: `payment_intent.succeeded`, `payment_intent.payment_failed`
- **Transbank**: Eventos de autorización y fallos
- **MercadoPago**: `payment` (approved, rejected, etc.)

## Flujos de Integración

### Flujo Directo (Stripe, MercadoPago)

1. **Cliente**: Ingresa datos de tarjeta en el frontend
2. **Frontend**: Llama a `tokenizeCardDirect`
3. **Backend**: Tokeniza la tarjeta y la guarda en Firestore
4. **Cliente**: Confirma el pago
5. **Frontend**: Llama a `processPayment` con el `card_id`
6. **Backend**: Procesa el pago usando el token guardado

### Flujo con Redirección (Transbank)

1. **Frontend**: Llama a `createTokenizationSession`
2. **Backend**: Crea sesión y retorna URL de redirección
3. **Frontend**: Redirige al usuario a la URL de Transbank
4. **Usuario**: Completa el proceso en Transbank
5. **Transbank**: Redirige de vuelta a `return_url` con datos
6. **Frontend**: Llama a `completeTokenization` con los datos del callback
7. **Backend**: Completa la tokenización y guarda la tarjeta
8. **Cliente**: Confirma el pago
9. **Frontend**: Llama a `processPayment` con el `card_id`

## Seguridad

### Autenticación
Todas las funciones requieren autenticación de Firebase Auth y validan que el `user_id` coincida con el usuario autenticado.

### Validaciones
- Campos requeridos validados
- Verificación de pertenencia de tarjetas al usuario
- Validación de estados de sesión de tokenización

### Datos Sensibles
- Los números de tarjeta completos nunca se guardan
- Solo se almacenan los últimos 4 dígitos
- Los tokens de los proveedores se guardan encriptados

## Desarrollo Local

### Instalación

```bash
npm install
```

### Compilación

```bash
npm run build
```

### Emuladores Locales

```bash
npm run serve
```

### Despliegue

```bash
npm run deploy
```

## Estructura del Proyecto

```
src/
├── index.ts              # Cloud Functions principales
├── types/
│   └── index.ts          # Definiciones de tipos TypeScript
├── providers/
│   ├── base.ts           # Interfaz base para proveedores
│   ├── factory.ts        # Factory para crear proveedores
│   ├── stripe.ts         # Implementación de Stripe
│   ├── transbank.ts      # Implementación de Transbank
│   └── mercadopago.ts    # Implementación de MercadoPago
└── utils/
    └── index.ts          # Utilidades compartidas
```

## Testing

### Tarjetas de Prueba

#### Stripe
- **Visa**: `4242424242424242`
- **Mastercard**: `5555555555554444`
- **American Express**: `378282246310005`

#### MercadoPago
- **Visa**: `4013540682746260`
- **Mastercard**: `5031755734530604`

#### Transbank
Usa el ambiente de integración con las credenciales proporcionadas.

## Soporte y Mantenimiento

### Logs y Monitoreo
- Todos los eventos importantes se registran en Cloud Functions Logs
- Los errores incluyen códigos específicos para facilitar el debugging

### Manejo de Errores
Todos los errores se devuelven con la estructura:

```typescript
{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "Descripción del error",
    details?: any
  }
}
```

### Códigos de Error Comunes
- `UNAUTHENTICATED`: Usuario no autenticado
- `UNAUTHORIZED`: Sin permisos para la acción
- `VALIDATION_ERROR`: Datos inválidos
- `TOKENIZATION_FAILED`: Error en tokenización
- `PAYMENT_FAILED`: Error en procesamiento de pago
- `NOT_FOUND`: Recurso no encontrado

## Licencia

ISC

---

Para soporte técnico o preguntas, contacta al equipo de desarrollo de Aldemi Tech.