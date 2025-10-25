# Testing Guide - Lazy Initialization

## Problema Resuelto

**Antes**: Los providers se inicializaban todos al startup, causando errores si faltaban dependencias o configuraciones, incluso para providers que no se usarían.

**Ahora**: Los providers se inicializan solo cuando se necesitan (lazy initialization), permitiendo que Transbank funcione automáticamente sin afectar otros providers.

## Cómo Probar

### 1. Verificar Providers Disponibles

```bash
curl http://localhost:5001/tu-proyecto/us-central1/getAvailableProviders
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "provider": "transbank",
        "method": "redirect",
        "enabled": true,
        "isTestMode": true
      }
    ],
    "total": 1,
    "timestamp": "2025-10-25T..."
  }
}
```

### 2. Probar Transbank (Debe Funcionar Automáticamente)

```bash
curl -X POST http://localhost:5001/tu-proyecto/us-central1/createTokenizationSession \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tu_firebase_token" \
  -H "User-Agent: Linku/1.0" \
  -d '{
    "provider": "transbank",
    "user_id": "test_user_123", 
    "return_url": "https://example.com/callback"
  }'
```

**Lo que debe pasar:**
1. Primera llamada inicializa Transbank con credenciales de prueba
2. Se crea la sesión de tokenización exitosamente  
3. Logs muestran: "Initializing transbank with default test credentials"

### 3. Probar Stripe (Debe Dar Error Útil)

```bash
curl -X POST http://localhost:5001/tu-proyecto/us-central1/tokenizeCardDirect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tu_firebase_token" \
  -H "User-Agent: Linku/1.0" \
  -d '{
    "provider": "stripe",
    "user_id": "test_user_123",
    "card_number": "4242424242424242",
    "card_exp_month": 12,
    "card_exp_year": 2025,
    "card_cvv": "123",
    "card_holder_name": "Test User"
  }'
```

**Respuesta esperada:**
```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_NOT_FOUND",
    "message": "Payment provider 'stripe' is not available: Provider 'stripe' requires configuration. Please provide API keys or credentials."
  }
}
```

## Flujo de Logs Esperado

### Al Iniciar el Emulador:
```
Storing provider configurations { count: 0 }
Provider configurations stored successfully
```

### Primera Llamada a Transbank:
```
Initializing transbank with default test credentials
No Transbank configuration provided, using default test credentials
Provider transbank initialized successfully
```

### Primera Llamada a Stripe:
```
Failed to initialize provider stripe: Stripe API key is required. Please provide your Stripe test API key from your Stripe dashboard.
```

## Beneficios del Nuevo Sistema

### ✅ Para Desarrollo
- **Startup más rápido**: No inicializa providers innecesariamente
- **Transbank inmediato**: Funciona sin configuración
- **Errores específicos**: Cada provider da su propio error útil
- **Menos memoria**: Solo inicializa lo que se usa

### ✅ Para Producción  
- **Mismo comportamiento**: Providers con config se comportan igual
- **Mejor debugging**: Errores más específicos
- **Menor impacto**: Errores de un provider no afectan otros
- **Lazy loading**: Mejor performance general

### ✅ Para CI/CD
- **Tests más estables**: No fallan por providers no configurados
- **Transbank automático**: Disponible para testing sin setup
- **Flexibilidad**: Puede testear providers individualmente

## Troubleshooting

### Error: "Payment provider 'transbank' is not available"

**Posibles causas:**
1. SDK de Transbank no instalado correctamente
2. Error en las credenciales de prueba  
3. Problema de red o dependencias

**Debug:**
```bash
# Verificar dependencias
npm list transbank-sdk

# Revisar logs del emulador
# Buscar: "Failed to initialize provider transbank"
```

### Error: "MISSING_CONFIG" para Stripe/MercadoPago

**Es esperado** - estos providers requieren configuración real.

**Para configurar:**
```bash
# Stripe
export STRIPE_SECRET_KEY="sk_test_..."

# MercadoPago  
export MERCADOPAGO_ACCESS_TOKEN="TEST-..."

# Reiniciar emulador
npm run serve
```

### Verificar Estado de Providers

```bash
# Ver qué providers están realmente inicializados
curl http://localhost:5001/tu-proyecto/us-central1/getAvailableProviders

# Forzar inicialización de un provider específico
curl -X POST http://localhost:5001/tu-proyecto/us-central1/createTokenizationSession \
  -H "Content-Type: application/json" \
  -d '{"provider": "transbank", "user_id": "test", "return_url": "https://example.com"}'
```