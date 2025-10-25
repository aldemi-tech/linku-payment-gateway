# Configuración de Variables de Entorno para Firebase Functions

## Configuración para Desarrollo/Testing

### Stripe (Modo Test)
```bash
firebase functions:config:set \
  stripe.secret_key="sk_test_51..." \
  stripe.public_key="pk_test_51..." \
  stripe.webhook_secret="whsec_..."
```

### Transbank (Integración)
```bash
firebase functions:config:set \
  transbank.commerce_code="597055555532" \
  transbank.api_key="579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C" \
  transbank.environment="integration"
```

### MercadoPago (Sandbox)
```bash
firebase functions:config:set \
  mercadopago.access_token="TEST-..." \
  mercadopago.environment="sandbox"
```

## Configuración para Producción

### Stripe (Modo Live)
```bash
firebase functions:config:set \
  stripe.secret_key="sk_live_..." \
  stripe.public_key="pk_live_..." \
  stripe.webhook_secret="whsec_..." \
  --project tu-proyecto-produccion
```

### Transbank (Producción)
```bash
firebase functions:config:set \
  transbank.commerce_code="TU_COMMERCE_CODE_REAL" \
  transbank.api_key="TU_API_KEY_REAL" \
  transbank.environment="production" \
  --project tu-proyecto-produccion
```

### MercadoPago (Producción)
```bash
firebase functions:config:set \
  mercadopago.access_token="APP_USR-..." \
  mercadopago.environment="production" \
  --project tu-proyecto-produccion
```

## Verificar Configuración

```bash
firebase functions:config:get
```

## Variables de Entorno Locales (para emuladores)

Crea un archivo `.env` en la raíz del proyecto:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PUBLIC_KEY=pk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...

# Transbank
TRANSBANK_COMMERCE_CODE=597055555532
TRANSBANK_API_KEY=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
TRANSBANK_ENVIRONMENT=integration

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=TEST-...
MERCADOPAGO_ENVIRONMENT=sandbox
```

## Configuración de Webhooks

### URLs para Desarrollo
```
https://us-central1-tu-proyecto-dev.cloudfunctions.net/stripeWebhook
https://us-central1-tu-proyecto-dev.cloudfunctions.net/transbankWebhook
https://us-central1-tu-proyecto-dev.cloudfunctions.net/mercadoPagoWebhook
```

### URLs para Producción
```
https://us-central1-tu-proyecto-prod.cloudfunctions.net/stripeWebhook
https://us-central1-tu-proyecto-prod.cloudfunctions.net/transbankWebhook
https://us-central1-tu-proyecto-prod.cloudfunctions.net/mercadoPagoWebhook
```

## Notas Importantes

1. **Nunca** commitees las claves reales en el código
2. Las credenciales de Transbank integración están incluidas para testing
3. Para MercadoPago, obtén tu `access_token` desde el panel de desarrolladores
4. Para Stripe, crea una cuenta y obtén las claves desde el dashboard
5. Configura los webhooks en cada proveedor apuntando a las URLs correctas