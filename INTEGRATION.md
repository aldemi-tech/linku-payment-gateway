# Integración con la App React Native

Guía completa para integrar las Cloud Functions de la pasarela de pagos en la app de Linku.

## 📦 Instalación

### 1. Importar Firebase Functions en la App

En el proyecto de React Native, ya tienes Firebase configurado. Solo necesitas asegurarte de tener el SDK de Functions:

```bash
# Si usas Expo (ya debería estar)
npx expo install firebase

# O si no usas Expo
npm install firebase
```

### 2. Inicializar Functions en Firebase Config

En `/src/firebase/index.ts` (o donde tengas tu configuración):

```typescript
import { initializeApp } from 'firebase/app';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app);

// Para desarrollo local con emuladores
if (__DEV__) {
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

## 🎯 Uso en la App

### Opción 1: Tokenización Directa (Stripe)

Ideal para formularios de tarjeta dentro de la app.

#### Componente de Formulario de Tarjeta

```typescript
// src/components/AddCardForm.tsx
import React, { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@firebase/index';
import { useAuth } from '@contexts/AuthContext';

export const AddCardForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [cardData, setCardData] = useState({
    number: '',
    expMonth: '',
    expYear: '',
    cvv: '',
    holderName: '',
  });

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // Llamar a la Cloud Function
      const tokenizeCard = httpsCallable(functions, 'tokenizeCardDirect');
      
      const result = await tokenizeCard({
        user_id: user.user_id,
        provider: 'stripe',
        card_number: cardData.number.replace(/\s/g, ''),
        card_exp_month: parseInt(cardData.expMonth),
        card_exp_year: parseInt(cardData.expYear),
        card_cvv: cardData.cvv,
        card_holder_name: cardData.holderName,
        set_as_default: true,
      });

      if (result.data.success) {
        Alert.alert('Éxito', 'Tarjeta agregada correctamente');
        onSuccess();
      } else {
        Alert.alert('Error', result.data.error.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo agregar la tarjeta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <TextInput
        placeholder="Número de tarjeta"
        value={cardData.number}
        onChangeText={(text) => setCardData({ ...cardData, number: text })}
        keyboardType="numeric"
        maxLength={19}
      />
      <TextInput
        placeholder="MM"
        value={cardData.expMonth}
        onChangeText={(text) => setCardData({ ...cardData, expMonth: text })}
        keyboardType="numeric"
        maxLength={2}
      />
      <TextInput
        placeholder="YYYY"
        value={cardData.expYear}
        onChangeText={(text) => setCardData({ ...cardData, expYear: text })}
        keyboardType="numeric"
        maxLength={4}
      />
      <TextInput
        placeholder="CVV"
        value={cardData.cvv}
        onChangeText={(text) => setCardData({ ...cardData, cvv: text })}
        keyboardType="numeric"
        maxLength={4}
        secureTextEntry
      />
      <TextInput
        placeholder="Nombre del titular"
        value={cardData.holderName}
        onChangeText={(text) => setCardData({ ...cardData, holderName: text })}
        autoCapitalize="words"
      />
      <Button 
        title={loading ? "Procesando..." : "Agregar Tarjeta"} 
        onPress={handleSubmit}
        disabled={loading}
      />
    </View>
  );
};
```

### Opción 2: Tokenización con Redirección (Transbank)

Ideal para proveedores que requieren autenticación web.

#### Componente con WebView

```typescript
// src/components/TransbankTokenization.tsx
import React, { useState, useRef } from 'react';
import { View, Button, Modal, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@firebase/index';
import { useAuth } from '@contexts/AuthContext';

export const TransbankTokenization = ({ onSuccess }: { onSuccess: () => void }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [webViewVisible, setWebViewVisible] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('');
  const sessionIdRef = useRef<string>('');

  const startTokenization = async () => {
    try {
      setLoading(true);

      // Crear sesión de tokenización
      const createSession = httpsCallable(functions, 'createTokenizationSession');
      
      const result = await createSession({
        user_id: user.user_id,
        provider: 'transbank',
        return_url: 'myapp://payment/callback', // Deep link de tu app
        set_as_default: true,
      });

      if (result.data.success) {
        const { redirect_url, session_id } = result.data.data;
        sessionIdRef.current = session_id;
        setRedirectUrl(redirect_url);
        setWebViewVisible(true);
      } else {
        Alert.alert('Error', result.data.error.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo iniciar el proceso');
    } finally {
      setLoading(false);
    }
  };

  const handleWebViewNavigationStateChange = async (navState: any) => {
    // Detectar cuando vuelve a tu app
    if (navState.url.startsWith('myapp://payment/callback')) {
      setWebViewVisible(false);

      try {
        setLoading(true);

        // Completar tokenización
        const completeTokenization = httpsCallable(functions, 'completeTokenization');
        
        const result = await completeTokenization({
          session_id: sessionIdRef.current,
          provider: 'transbank',
          callback_data: {
            // Extraer parámetros de la URL si es necesario
            // Por ejemplo: TBK_TOKEN, etc.
          },
        });

        if (result.data.success) {
          Alert.alert('Éxito', 'Tarjeta agregada correctamente');
          onSuccess();
        } else {
          Alert.alert('Error', result.data.error.message);
        }
      } catch (error: any) {
        Alert.alert('Error', error.message || 'No se pudo completar el proceso');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <View>
      <Button 
        title={loading ? "Procesando..." : "Agregar Tarjeta Transbank"} 
        onPress={startTokenization}
        disabled={loading}
      />

      <Modal
        visible={webViewVisible}
        animationType="slide"
        onRequestClose={() => setWebViewVisible(false)}
      >
        <WebView
          source={{ uri: redirectUrl }}
          onNavigationStateChange={handleWebViewNavigationStateChange}
          startInLoadingState
        />
      </Modal>
    </View>
  );
};
```

### Procesar Pago con Tarjeta Guardada

```typescript
// src/screens/PaymentScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, Alert } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@firebase/index';
import { useAuth } from '@contexts/AuthContext';

export const PaymentScreen = ({ route }: any) => {
  const { serviceRequestId, professionalId, amount } = route.params;
  const { user } = useAuth();
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const getUserCards = httpsCallable(functions, 'getUserCards');
      const result = await getUserCards({ user_id: user.user_id });

      if (result.data.success) {
        setCards(result.data.data.cards);
        
        // Seleccionar tarjeta por defecto
        const defaultCard = result.data.data.cards.find((c: any) => c.is_default);
        if (defaultCard) {
          setSelectedCard(defaultCard);
        }
      }
    } catch (error) {
      console.error('Error loading cards:', error);
    }
  };

  const handlePayment = async () => {
    if (!selectedCard) {
      Alert.alert('Error', 'Por favor selecciona una tarjeta');
      return;
    }

    try {
      setProcessing(true);

      const processPayment = httpsCallable(functions, 'processPayment');
      
      const result = await processPayment({
        user_id: user.user_id,
        professional_id: professionalId,
        service_request_id: serviceRequestId,
        amount: amount,
        currency: 'CLP',
        provider: selectedCard.provider,
        token_id: selectedCard.token_id,
        description: `Pago por servicio #${serviceRequestId}`,
      });

      if (result.data.success) {
        Alert.alert(
          'Pago Exitoso',
          `Tu pago de ${formatCurrency(amount)} ha sido procesado`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', result.data.error.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo procesar el pago');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View>
      <Text>Selecciona tu método de pago</Text>
      
      <FlatList
        data={cards}
        keyExtractor={(item) => item.token_id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.cardItem,
              selectedCard?.token_id === item.token_id && styles.selectedCard
            ]}
            onPress={() => setSelectedCard(item)}
          >
            <Text>{item.card_brand.toUpperCase()}</Text>
            <Text>**** {item.card_last4}</Text>
            <Text>{item.card_exp_month}/{item.card_exp_year}</Text>
          </TouchableOpacity>
        )}
      />

      <Button
        title={processing ? "Procesando..." : `Pagar ${formatCurrency(amount)}`}
        onPress={handlePayment}
        disabled={processing || !selectedCard}
      />

      <Button
        title="Agregar Nueva Tarjeta"
        onPress={() => navigation.navigate('AddCard')}
      />
    </View>
  );
};
```

### Eliminar Tarjeta

```typescript
const handleDeleteCard = async (tokenId: string) => {
  Alert.alert(
    'Confirmar',
    '¿Estás seguro de eliminar esta tarjeta?',
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const deleteCard = httpsCallable(functions, 'deleteCard');
            const result = await deleteCard({ token_id: tokenId });

            if (result.data.success) {
              Alert.alert('Éxito', 'Tarjeta eliminada');
              loadCards(); // Recargar lista
            }
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]
  );
};
```

## 🔐 Configuración de Seguridad

### Reglas de Firestore

Ya incluidas en el README principal, pero asegúrate de tenerlas configuradas en Firebase Console.

### Deep Links para Callbacks (Transbank)

En `app.json`:

```json
{
  "expo": {
    "scheme": "myapp",
    "ios": {
      "bundleIdentifier": "com.yourcompany.linku"
    },
    "android": {
      "package": "com.yourcompany.linku",
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "myapp",
              "host": "payment"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

## 🎨 UI Components Sugeridos

Reutiliza componentes existentes de la app:

- `Button` component para acciones
- `CachedImage` para logos de tarjetas
- `StatusBadge` para estados de pago
- `Colors`, `Spacing`, `FontSizes` del theme

## 🔍 Monitoreo y Logs

```typescript
// Agregar logging en producción
import * as Sentry from '@sentry/react-native';

try {
  const result = await processPayment(data);
  // ...
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      payment_provider: 'stripe',
      amount: amount,
    },
  });
  Alert.alert('Error', 'Ocurrió un problema procesando el pago');
}
```

## 📊 Estados de Pago

```typescript
type PaymentStatus = 
  | 'pending'     // Creado pero no procesado
  | 'processing'  // Siendo procesado
  | 'completed'   // Exitoso
  | 'failed'      // Falló
  | 'cancelled'   // Cancelado por usuario
  | 'refunded';   // Reembolsado

// Colores sugeridos para cada estado
const statusColors = {
  pending: Colors.warning,
  processing: Colors.info,
  completed: Colors.success,
  failed: Colors.error,
  cancelled: Colors.textSecondary,
  refunded: Colors.primary,
};
```

## 🚀 Checklist de Implementación

- [ ] Configurar Firebase Functions en la app
- [ ] Agregar screen para agregar tarjetas
- [ ] Implementar formulario de Stripe
- [ ] Implementar WebView de Transbank
- [ ] Agregar screen de selección de método de pago
- [ ] Integrar en flujo de pago de servicios
- [ ] Agregar manejo de errores
- [ ] Configurar deep links
- [ ] Testear en desarrollo
- [ ] Configurar variables de producción
- [ ] Deploy de functions
- [ ] Testing en producción con tarjetas de prueba
- [ ] Monitoreo y logs configurados

---

¡La pasarela de pagos está lista para integrarse en la app! 🎉
