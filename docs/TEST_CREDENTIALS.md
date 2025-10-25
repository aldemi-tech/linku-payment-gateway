# Credenciales de Prueba y Configuración por Defecto

## Resumen

El gateway de pagos ahora soporta **credenciales de prueba automáticas** para facilitar el desarrollo y testing. Cuando no se proporcionan configuraciones específicas para un provider, el sistema intentará usar credenciales de prueba por defecto si están disponibles.

## Comportamiento por Provider

### 🟢 Transbank
- **Estado**: ✅ Soporta credenciales de prueba por defecto
- **Credenciales**: Usa las credenciales de prueba públicas documentadas por Transbank
- **Commerce Code**: `597055555532`
- **API Key**: `579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C`
- **Environment**: `integration`

### 🟡 Stripe  
- **Estado**: ⚠️ Requiere credenciales del usuario
- **Motivo**: Stripe requiere claves API válidas de tu cuenta, no hay credenciales públicas de prueba
- **Acción**: Debe proporcionar sus propias claves de prueba de Stripe

### 🟡 MercadoPago
- **Estado**: ⚠️ Requiere credenciales del usuario
- **Motivo**: MercadoPago requiere un access token válido de tu cuenta de desarrollador
- **Acción**: Debe crear una aplicación de prueba en MercadoPago y proporcionar el access token

## Inicialización Automática

### Antes (Comportamiento Anterior)
```javascript
// Solo se inicializaban providers con configuración completa
const configs = [];
if (stripeSecretKey) {
  configs.push({ provider: "stripe", ... });
}
// Si no había config, no se inicializaba el provider
```

### Ahora (Nuevo Comportamiento)
```javascript
// 1. Inicializa providers con configuración proporcionada
const configs = [...];

// 2. Intenta inicializar providers restantes con credenciales de prueba
PaymentProviderFactory.initialize(configs);
// El factory ahora intenta inicializar TODOS los providers disponibles
```

## Endpoint para Verificar Providers Disponibles

### GET `/getAvailableProviders`

Nuevo endpoint que retorna información sobre qué providers están disponibles:

```typescript
{
  "success": true,
  "data": {
    "providers": [
      {
        "provider": "transbank",
        "method": "redirect", 
        "enabled": true,
        "isTestMode": true
      },
      {
        "provider": "stripe",
        "method": "direct",
        "enabled": true, 
        "isTestMode": false
      }
    ],
    "total": 2,
    "timestamp": "2025-10-25T10:30:00.000Z"
  }
}
```

## Configuración Manual vs Automática

### Configuración Manual (Recomendada para Producción)

```bash
# Firebase config
firebase functions:config:set stripe.secret_key="sk_live_..."
firebase functions:config:set transbank.api_key="your_production_key"
firebase functions:config:set mercadopago.access_token="APP_USR-..."

# Variables de entorno
export STRIPE_SECRET_KEY="sk_test_..."
export TRANSBANK_API_KEY="your_test_key"
export MERCADOPAGO_ACCESS_TOKEN="TEST-..."
```

### Configuración Automática (Para Desarrollo)

Si no proporcionas configuración, el sistema:

1. ✅ **Transbank**: Se inicializa automáticamente con credenciales de prueba públicas
2. ⚠️ **Stripe**: Muestra mensaje informativo sobre cómo obtener claves de prueba
3. ⚠️ **MercadoPago**: Muestra mensaje informativo sobre cómo crear aplicación de prueba

## Logs de Inicialización

El sistema ahora proporciona logs más detallados:

```bash
# Configuración encontrada
Stripe provider configuration added
Transbank API key not found, will try to initialize with test credentials if available

# Inicialización automática  
Attempting to initialize transbank with default test credentials
Provider transbank initialized with test credentials
Provider stripe requires user credentials, skipping default initialization

# Resultado final
Payment gateway initialized with providers: {
  providers: ['transbank', 'mercadopago'],
  totalConfigs: 1,
  availableProviders: 2
}
```

## Ventajas

### Para Desarrolladores
- ✅ **Setup más rápido**: Transbank funciona inmediatamente sin configuración
- ✅ **Menos fricción**: Puedes empezar a desarrollar y probar de inmediato
- ✅ **Mejor debugging**: Endpoints para verificar qué providers están disponibles

### Para Testing
- ✅ **Entorno consistente**: Transbank siempre disponible para pruebas
- ✅ **CI/CD más simple**: No requiere credenciales para testing básico
- ✅ **Documentación clara**: Saber exactamente qué funciona y qué no

### Para Producción  
- ✅ **Seguridad mantenida**: Solo se usan credenciales de prueba públicas conocidas
- ✅ **Flexibilidad**: Providers con configuración manual siguen funcionando igual
- ✅ **Transparencia**: Logs claros sobre qué credenciales se están usando

## Migración

### ⚠️ Cambios Requeridos
- **Ninguno**: Es completamente backward-compatible
- Tu configuración existente seguirá funcionando igual

### ✅ Mejoras Automáticas
- Transbank estará disponible aunque no tengas configuración
- Mejor logging y debugging
- Nuevo endpoint para verificar providers disponibles

## Ejemplo de Uso

```bash
# 1. Verificar providers disponibles
curl https://your-project.cloudfunctions.net/getAvailableProviders

# 2. Usar Transbank sin configuración adicional
curl -X POST https://your-project.cloudfunctions.net/createTokenizationSession \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "transbank",
    "user_id": "test_user_123",
    "return_url": "https://yourapp.com/callback"
  }'

# 3. El sistema usará automáticamente las credenciales de prueba de Transbank
```

## Credenciales de Prueba por Provider

### Transbank OneClick (Automático)
```javascript
{
  commerceCode: "597055555532",
  apiKey: "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C",
  environment: "integration"
}
```

### Stripe (Manual - Requiere Registro)
1. Ir a https://dashboard.stripe.com/test/apikeys
2. Copiar las claves de prueba (empiezan con `sk_test_` y `pk_test_`)
3. Configurar en Firebase o variables de entorno

### MercadoPago (Manual - Requiere Aplicación)
1. Ir a https://www.mercadopago.com/developers/
2. Crear una aplicación de prueba
3. Obtener el access token de prueba (empieza con `TEST-`)
4. Configurar en Firebase o variables de entorno