# 📱 Integración Payment Gateway con React Native Firebase

## 🎯 Objetivo
Integrar las Cloud Functions del payment gateway en tu aplicación React Native usando Firebase, soportando tanto **tokenización directa** como **flujos de redirección** para múltiples proveedores de pago.

## 🏗️ Arquitectura del Sistema

### **Tipos de Integración por Proveedor**
- ✅ **Stripe**: Tokenización directa (sin redirección) - **Siempre requiere CVC en pagos**
- ✅ **MercadoPago**: Tokenización directa (sin redirección) - **CVC configurable por tarjeta**
- ✅ **Transbank**: Flujo de redirección (WebView requerido) - **Sin CVC necesario**

> **⚠️ Importante**: MercadoPago permite configurar si una tarjeta guardada requiere CVC. El campo `requires_cvc` en los datos de la tarjeta indica si se debe solicitar CVC al usar esa tarjeta.

### **Cloud Functions Disponibles**
```
https://us-central1-linku-app.cloudfunctions.net/
├── tokenizeCardDirect      (Stripe - Tokenización directa)
├── createTokenizationSession (Transbank/MercadoPago - Redirección)
├── completeTokenization    (Completar flujo de redirección)
├── processPayment         (Procesar pagos)
├── refundPayment          (Reembolsos)
└── webhook               (Webhooks unificados)
```

## 🔧 Setup Inicial

### **1. Dependencias Necesarias**
```bash
npm install @react-native-firebase/app @react-native-firebase/functions @react-native-firebase/firestore
npm install react-native-webview  # Para flujos de redirección
```

### **2. Configuración Firebase**
```javascript
// firebase.js
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

// Para desarrollo (emulator)
if (__DEV__) {
  functions().useFunctionsEmulator('http://localhost:5001');
}

export { functions, firestore, auth };
```

### **3. ⚠️ IMPORTANTE: Configuración de Autenticación para Cloud Functions**

**Problem**: Las Cloud Functions no detectan automáticamente la sesión de Firebase Auth desde React Native.

**Solución**: Debes asegurarte de que el usuario esté autenticado antes de llamar las functions:

```javascript
// services/AuthService.js
import auth from '@react-native-firebase/auth';

class AuthService {
  
  // Verificar si el usuario está autenticado
  static async ensureAuthenticated() {
    const currentUser = auth().currentUser;
    
    if (!currentUser) {
      throw new Error('Usuario no autenticado. Inicia sesión primero.');
    }
    
    // Verificar que el token no haya expirado
    try {
      await currentUser.getIdToken(true); // Force refresh del token
      return currentUser;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new Error('Sesión expirada. Inicia sesión nuevamente.');
    }
  }
  
  // Obtener el ID token actual
  static async getCurrentIdToken() {
    const user = await this.ensureAuthenticated();
    return await user.getIdToken();
  }
}

export default AuthService;
```

## 💳 Implementación de Flujos de Pago

### **Flujo 1: Tokenización Directa (Stripe)**

```javascript
// services/PaymentService.js
import { functions, auth } from '../firebase';
import AuthService from './AuthService';

class PaymentService {
  
  // Tokenizar tarjeta directamente (Stripe/MercadoPago)
  async tokenizeCardDirect(cardData, provider = 'stripe') {
    try {
      // ⚠️ CRÍTICO: Verificar autenticación antes de llamar la function
      await AuthService.ensureAuthenticated();
      
      const tokenizeCard = functions().httpsCallable('tokenizeCardDirect');
      
      const result = await tokenizeCard({
        user_id: auth().currentUser?.uid,
        provider: provider, // 'stripe' o 'mercadopago'
        card_number: cardData.number,
        card_exp_month: cardData.expMonth,
        card_exp_year: cardData.expYear,
        card_cvc: cardData.cvc,
        card_holder_name: cardData.holderName,
        save_card: cardData.saveCard || false,
        alias: cardData.alias,
        metadata: {
          device_info: 'React Native App',
          user_agent: 'PaymentApp/1.0',
          provider: provider
        }
      });

      if (result.data.success) {
        return {
          success: true,
          token: result.data.data.card_token,
          cardInfo: result.data.data.card_info
        };
      } else {
        throw new Error(result.data.error.message);
      }
    } catch (error) {
      console.error('Tokenization error:', error);
      throw error;
    }
  }

  // Procesar pago con token (nueva tarjeta o guardada)
  async processPayment(paymentData) {
    try {
      // ⚠️ CRÍTICO: Verificar autenticación antes de llamar la function
      await AuthService.ensureAuthenticated();
      
      const processPayment = functions().httpsCallable('processPayment');
      
      // Configurar método de pago según el tipo
      let paymentMethod;
      
      if (paymentData.type === 'saved_card') {
        // Pago con tarjeta guardada + CVC
        paymentMethod = {
          type: 'saved_card',
          card_token: paymentData.cardToken,
          cvc: paymentData.cvc // CVC requerido para tarjetas guardadas
        };
      } else {
        // Pago con tarjeta nueva tokenizada
        paymentMethod = {
          type: 'card_token',
          card_token: paymentData.cardToken
        };
      }
      
      const result = await processPayment({
        payment_id: `pay_${Date.now()}`,
        user_id: auth().currentUser?.uid,
        professional_id: paymentData.professionalId,
        service_request_id: paymentData.serviceRequestId,
        provider: paymentData.provider,
        amount: paymentData.amount,
        currency: paymentData.currency || 'CLP',
        payment_method: paymentMethod,
        metadata: {
          ...paymentData.metadata,
          payment_type: paymentData.type || 'new_card'
        }
      });

      return result.data;
    } catch (error) {
      console.error('Payment processing error:', error);
      throw error;
    }
  }
}

export default new PaymentService();
```

### **Flujo 2: Redirección (Solo Transbank)**

```javascript
// components/RedirectPayment.js
import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { functions } from '../firebase';

const RedirectPayment = ({ paymentData, onSuccess, onError }) => {
  const [webViewVisible, setWebViewVisible] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('');

  // Iniciar sesión de tokenización
  const startTokenizationSession = async () => {
    try {
      const createSession = functions().httpsCallable('createTokenizationSession');
      
      const result = await createSession({
        user_id: auth().currentUser.uid,
        provider: 'transbank', // Solo Transbank usa redirección
        return_url: 'https://tu-app.com/payment-return', // URL de retorno
        metadata: {
          device_type: 'mobile',
          app_version: '1.0.0'
        }
      });

      if (result.data.success) {
        setRedirectUrl(result.data.data.redirect_url);
        setWebViewVisible(true);
        return result.data.data.session_id;
      } else {
        throw new Error(result.data.error.message);
      }
    } catch (error) {
      console.error('Session creation error:', error);
      onError(error);
    }
  };

  // Manejar navegación en WebView
  const handleWebViewNavigation = async (navState) => {
    const { url } = navState;
    
    // Detectar retorno exitoso
    if (url.includes('payment-return') || url.includes('success')) {
      setWebViewVisible(false);
      
      // Extraer datos de callback de la URL
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const sessionId = urlParams.get('session_id');
      const token = urlParams.get('token');
      
      if (sessionId) {
        await completeTokenization(sessionId, urlParams);
      }
    }
    
    // Detectar cancelación o error
    if (url.includes('cancel') || url.includes('error')) {
      setWebViewVisible(false);
      onError(new Error('Payment cancelled or failed'));
    }
  };

  // Completar tokenización después del retorno
  const completeTokenization = async (sessionId, callbackData) => {
    try {
      const complete = functions().httpsCallable('completeTokenization');
      
      const result = await complete({
        session_id: sessionId,
        callback_data: Object.fromEntries(callbackData),
        provider: paymentData.provider
      });

      if (result.data.success) {
        onSuccess(result.data.data);
      } else {
        throw new Error(result.data.error.message);
      }
    } catch (error) {
      console.error('Tokenization completion error:', error);
      onError(error);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {webViewVisible && (
        <WebView
          source={{ uri: redirectUrl }}
          onNavigationStateChange={handleWebViewNavigation}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
        />
      )}
    </View>
  );
};
```

### **Flujo 3: Pago con Tarjetas Guardadas (Reingreso de CVC)**

```javascript
// components/SavedCardPayment.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';

const SavedCardPayment = ({ savedCard, onPayment, loading }) => {
  const [cvc, setCvc] = useState('');

  // Verificar si la tarjeta requiere CVC según el proveedor
  const requiresCvc = () => {
    if (savedCard.provider === 'stripe') {
      return true; // Stripe siempre requiere CVC
    }
    if (savedCard.provider === 'mercadopago') {
      return savedCard.requires_cvc || false; // Campo específico de MercadoPago
    }
    return false; // Transbank no requiere CVC para tarjetas guardadas
  };

  const handlePayWithSavedCard = () => {
    // Validar CVC solo si es requerido
    if (requiresCvc() && !cvc) {
      Alert.alert('Error', 'Ingresa el código CVC de tu tarjeta');
      return;
    }

    // Procesar pago con tarjeta guardada
    onPayment({
      type: 'saved_card',
      card_token: savedCard.card_token,
      cvc: requiresCvc() ? cvc : null,
      provider: savedCard.provider,
      requires_cvc: requiresCvc()
    });
  };

  return (
    <View style={styles.savedCardContainer}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardBrand}>{savedCard.card_brand.toUpperCase()}</Text>
        <Text style={styles.cardNumber}>**** **** **** {savedCard.card_last_four}</Text>
        <Text style={styles.cardExpiry}>{savedCard.expiration_month}/{savedCard.expiration_year}</Text>
        <Text style={styles.cardHolder}>{savedCard.card_holder_name}</Text>
      </View>
      
      {/* Mostrar CVC solo si es requerido */}
      {requiresCvc() && (
        <View style={styles.cvcSection}>
          <Text style={styles.cvcLabel}>
            Por seguridad, ingresa tu código CVC:
          </Text>
          <TextInput
            style={styles.cvcInput}
            placeholder="CVC"
            value={cvc}
            onChangeText={setCvc}
            keyboardType="numeric"
            maxLength={4}
            secureTextEntry
          />
        </View>
      )}
      
      {/* Mensaje informativo si no requiere CVC */}
      {!requiresCvc() && (
        <Text style={styles.noCvcMessage}>
          Esta tarjeta no requiere código CVC para pagos.
        </Text>
      )}
      
      <TouchableOpacity
        style={styles.payButton}
        onPress={handlePayWithSavedCard}
        disabled={loading || (requiresCvc() && !cvc)}
      >
        <Text style={styles.payButtonText}>
          {loading ? 'Procesando...' : 'Pagar con esta tarjeta'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
```

### **Flujo 4: Gestión de Tarjetas (Firestore Directo)**

```javascript
// services/CardService.js
import { firestore, auth } from '../firebase';
import AuthService from './AuthService';

class CardService {
  
  // Obtener tarjetas del usuario
  async getUserCards() {
    try {
      // ⚠️ CRÍTICO: Verificar autenticación antes de acceder a Firestore
      const user = await AuthService.ensureAuthenticated();
      const userId = user.uid;
      const cardsSnapshot = await firestore()
        .collection('payment_cards')
        .where('user_id', '==', userId)
        .orderBy('is_default', 'desc')
        .orderBy('created_at', 'desc')
        .get();

      return cardsSnapshot.docs.map(doc => {
        const cardData = doc.data();
        return {
          id: doc.id,
          ...cardData,
          // Asegurar que el campo requires_cvc esté presente para MercadoPago
          requires_cvc: cardData.provider === 'mercadopago' ? 
            (cardData.requires_cvc || false) : 
            cardData.provider === 'stripe' // Stripe siempre requiere CVC
        };
      });
    } catch (error) {
      console.error('Error fetching cards:', error);
      throw error;
    }
  }

  // Eliminar tarjeta
  async deleteCard(cardId) {
    try {
      await firestore()
        .collection('payment_cards')
        .doc(cardId)
        .delete();
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting card:', error);
      throw error;
    }
  }

  // Establecer tarjeta por defecto
  async setDefaultCard(cardId) {
    try {
      const userId = auth().currentUser.uid;
      const batch = firestore().batch();

      // Remover default de todas las tarjetas
      const cardsSnapshot = await firestore()
        .collection('payment_cards')
        .where('user_id', '==', userId)
        .get();

      cardsSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { is_default: false });
      });

      // Establecer nueva tarjeta por defecto
      const cardRef = firestore().collection('payment_cards').doc(cardId);
      batch.update(cardRef, { is_default: true });

      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('Error setting default card:', error);
      throw error;
    }
  }
}

export default new CardService();
```

## 🎨 Componentes de UI

### **Selector de Proveedor de Pago**

```javascript
// components/PaymentProviderSelector.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const PaymentProviderSelector = ({ onProviderSelect }) => {
  const [selectedProvider, setSelectedProvider] = useState('');

  const providers = [
    {
      id: 'stripe',
      name: 'Tarjeta de Crédito/Débito',
      type: 'direct',
      icon: '💳'
    },
    {
      id: 'mercadopago',
      name: 'MercadoPago',
      type: 'direct',
      icon: '💰'
    },
    {
      id: 'transbank',
      name: 'Transbank WebPay',
      type: 'redirect', 
      icon: '🏦'
    }
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Selecciona método de pago</Text>
      {providers.map(provider => (
        <TouchableOpacity
          key={provider.id}
          style={[
            styles.providerButton,
            selectedProvider === provider.id && styles.selected
          ]}
          onPress={() => {
            setSelectedProvider(provider.id);
            onProviderSelect(provider);
          }}
        >
          <Text style={styles.icon}>{provider.icon}</Text>
          <Text style={styles.providerName}>{provider.name}</Text>
          <Text style={styles.providerType}>
            {provider.type === 'direct' ? 'Directo' : 'Redirección'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
```

### **Formulario de Tarjeta (Stripe)**

```javascript
// components/CardForm.js
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';

const CardForm = ({ onSubmit, loading }) => {
  const [cardData, setCardData] = useState({
    number: '',
    expMonth: '',
    expYear: '',
    cvc: '',
    holderName: '',
    saveCard: false
  });

  const formatCardNumber = (text) => {
    // Formato: 1234 5678 9012 3456
    return text.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (text) => {
    // Formato: MM/YY
    return text.replace(/\D/g, '').replace(/(.{2})/, '$1/');
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Número de tarjeta"
        value={cardData.number}
        onChangeText={(text) => setCardData({
          ...cardData, 
          number: formatCardNumber(text).replace(/\s/g, '')
        })}
        keyboardType="numeric"
        maxLength={19}
      />
      
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="MM/YY"
          value={formatExpiry(`${cardData.expMonth}${cardData.expYear}`)}
          onChangeText={(text) => {
            const [month, year] = text.replace(/\D/g, '').match(/.{1,2}/g) || [];
            setCardData({
              ...cardData,
              expMonth: month || '',
              expYear: year || ''
            });
          }}
          keyboardType="numeric"
          maxLength={5}
        />
        
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="CVC"
          value={cardData.cvc}
          onChangeText={(text) => setCardData({...cardData, cvc: text})}
          keyboardType="numeric"
          maxLength={4}
          secureTextEntry
        />
      </View>
      
      <TextInput
        style={styles.input}
        placeholder="Nombre del titular"
        value={cardData.holderName}
        onChangeText={(text) => setCardData({...cardData, holderName: text})}
      />
      
      <TouchableOpacity
        style={styles.submitButton}
        onPress={() => onSubmit(cardData)}
        disabled={loading}
      >
        <Text style={styles.submitText}>
          {loading ? 'Procesando...' : 'Procesar Pago'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
```

## � Estructura de Datos de Tarjetas Guardadas

### **Ejemplo de Tarjeta Guardada (Firestore)**
```javascript
// Documento en collection 'payment_cards'
{
  "card_id": "card_abc123",
  "user_id": "user_xyz789", 
  "provider": "mercadopago", // o "stripe", "transbank"
  "card_token": "tok_mp_1234567890",
  "card_holder_name": "Juan Pérez",
  "card_last_four": "4242",
  "card_brand": "visa", 
  "card_type": "credit",
  "expiration_month": "12",
  "expiration_year": "25",
  "alias": "Mi Visa Principal",
  "is_default": true,
  "requires_cvc": true, // ⚠️ IMPORTANTE: Campo específico para MercadoPago
  "created_at": "2025-10-24T10:00:00Z"
}
```

### **Lógica de CVC por Proveedor**
```javascript
// Reglas para solicitar CVC
const shouldRequestCvc = (savedCard) => {
  switch (savedCard.provider) {
    case 'stripe':
      return true; // Stripe SIEMPRE requiere CVC
    case 'mercadopago': 
      return savedCard.requires_cvc || false; // Campo configurable
    case 'transbank':
      return false; // Transbank no usa CVC para tarjetas guardadas
    default:
      return true; // Por seguridad, solicitar por defecto
  }
};
```

## �🔄 Flujo Completo de Integración

### **Ejemplo de Uso Principal**

```javascript
// screens/PaymentScreen.js
import React, { useState, useEffect } from 'react';
import { View, Alert, ScrollView } from 'react-native';
import PaymentService from '../services/PaymentService';
import CardService from '../services/CardService';

const PaymentScreen = ({ route }) => {
  const { paymentAmount, professionalId, serviceRequestId } = route.params;
  const [loading, setLoading] = useState(false);
  const [savedCards, setSavedCards] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);

  useEffect(() => {
    loadSavedCards();
  }, []);

  const loadSavedCards = async () => {
    try {
      const cards = await CardService.getUserCards();
      setSavedCards(cards);
    } catch (error) {
      console.error('Error loading saved cards:', error);
    }
  };

  // Flujo de pago con nueva tarjeta
  const handleNewCardPayment = async (provider, cardData) => {
    setLoading(true);
    
    try {
      let cardToken;
      
      if (provider.type === 'direct') {
        // Tokenización directa (Stripe/MercadoPago)
        const tokenResult = await PaymentService.tokenizeCardDirect(cardData, provider.id);
        cardToken = tokenResult.token;
      } else {
        // Flujo de redirección (Solo Transbank)
        return handleRedirectFlow(provider);
      }
      
      // Procesar pago con token
      const paymentResult = await PaymentService.processPayment({
        type: 'new_card',
        provider: provider.id,
        amount: paymentAmount,
        currency: 'CLP',
        professionalId,
        serviceRequestId,
        cardToken,
        metadata: {
          source: 'mobile_app',
          timestamp: new Date().toISOString()
        }
      });
      
      if (paymentResult.success) {
        Alert.alert('Éxito', 'Pago procesado correctamente');
        // Navegar a pantalla de éxito
      } else {
        throw new Error(paymentResult.error.message);
      }
      
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Flujo de pago con tarjeta guardada
  const handleSavedCardPayment = async (savedCard, cvc) => {
    setLoading(true);
    
    try {
      const paymentResult = await PaymentService.processPayment({
        type: 'saved_card',
        provider: savedCard.provider,
        amount: paymentAmount,
        currency: 'CLP',
        professionalId,
        serviceRequestId,
        cardToken: savedCard.card_token,
        cvc: cvc,
        metadata: {
          source: 'mobile_app',
          card_id: savedCard.id,
          timestamp: new Date().toISOString()
        }
      });
      
      if (paymentResult.success) {
        Alert.alert('Éxito', 'Pago procesado correctamente');
      } else {
        throw new Error(paymentResult.error.message);
      }
      
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRedirectFlow = (provider) => {
    // Implementar navegación a WebView component
    navigation.navigate('RedirectPayment', {
      provider: provider.id,
      paymentData: { amount: paymentAmount },
      onSuccess: (result) => {
        Alert.alert('Éxito', 'Pago procesado correctamente');
      },
      onError: (error) => {
        Alert.alert('Error', error.message);
      }
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <PaymentProviderSelector onProviderSelect={handlePayment} />
      {/* Resto de la UI */}
    </View>
  );
};
```

## 🚨 Troubleshooting: Error "Unauthenticated"

### **Problema Común**: `Error: Unauthenticated` al llamar Cloud Functions

Este es uno de los errores más comunes al integrar Firebase Functions con React Native. Aquí las soluciones:

#### **Solución 1: Verificación de Estado de Autenticación**
```javascript
// utils/FunctionCaller.js
import auth from '@react-native-firebase/auth';
import { functions } from '../firebase';

export const callSecureFunction = async (functionName, data) => {
  try {
    // 1. Verificar que el usuario esté logueado
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Usuario no autenticado');
    }
    
    // 2. Verificar que el token sea válido
    const token = await currentUser.getIdToken(true); // Force refresh
    console.log('Token obtenido:', token ? 'OK' : 'FAIL');
    
    // 3. Llamar la function
    const callable = functions().httpsCallable(functionName);
    const result = await callable(data);
    
    return result;
  } catch (error) {
    console.error(`Error calling ${functionName}:`, error);
    throw error;
  }
};
```

#### **Solución 2: Usar onAuthStateChanged para Asegurar Estado**
```javascript
// hooks/useAuthenticatedUser.js
import { useState, useEffect } from 'react';
import auth from '@react-native-firebase/auth';

export const useAuthenticatedUser = () => {
  const [user, setUser] = useState(null);
  const [isReady, setIsReady] = useState(false);
  
  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((authUser) => {
      setUser(authUser);
      setIsReady(true);
    });
    
    return unsubscribe;
  }, []);
  
  return { user, isReady, isAuthenticated: !!user };
};

// Uso en componente
const PaymentScreen = () => {
  const { user, isReady, isAuthenticated } = useAuthenticatedUser();
  
  const handlePayment = async () => {
    if (!isAuthenticated) {
      Alert.alert('Error', 'Debes iniciar sesión para realizar pagos');
      return;
    }
    
    // Proceder con el pago...
  };
  
  if (!isReady) {
    return <LoadingScreen />;
  }
  
  if (!isAuthenticated) {
    return <LoginScreen />;
  }
  
  return <PaymentForm />;
};
```

#### **Solución 3: Debugging de Token**
```javascript
// utils/debugAuth.js
import auth from '@react-native-firebase/auth';

export const debugAuthState = async () => {
  const user = auth().currentUser;
  
  console.log('=== DEBUG AUTH STATE ===');
  console.log('User exists:', !!user);
  
  if (user) {
    console.log('User ID:', user.uid);
    console.log('Email:', user.email);
    console.log('Email verified:', user.emailVerified);
    
    try {
      const token = await user.getIdToken();
      console.log('Token length:', token.length);
      console.log('Token starts with:', token.substring(0, 20));
      
      const tokenResult = await user.getIdTokenResult();
      console.log('Token claims:', tokenResult.claims);
      console.log('Token expiration:', new Date(tokenResult.expirationTime));
    } catch (error) {
      console.error('Error getting token:', error);
    }
  }
  console.log('========================');
};

// Llamar antes de hacer pagos para debug
await debugAuthState();
```

#### **Solución 4: Reiniciar Sesión si es Necesario**
```javascript
// services/AuthFixService.js
import auth from '@react-native-firebase/auth';

export const refreshUserSession = async () => {
  try {
    const user = auth().currentUser;
    if (!user) {
      throw new Error('No user logged in');
    }
    
    // Force refresh del token
    await user.getIdToken(true);
    
    // Reload user data
    await user.reload();
    
    console.log('Session refreshed successfully');
    return true;
  } catch (error) {
    console.error('Error refreshing session:', error);
    
    // Si falla, cerrar sesión y pedir login nuevamente
    await auth().signOut();
    throw new Error('Sesión expirada. Inicia sesión nuevamente.');
  }
};
```

#### **Solución 5: Wrapper de PaymentService con Retry**
```javascript
// services/SecurePaymentService.js
import PaymentService from './PaymentService';
import { refreshUserSession } from './AuthFixService';

export const securePayment = async (paymentFunction, ...args) => {
  try {
    // Primer intento
    return await paymentFunction(...args);
  } catch (error) {
    if (error.message.includes('Unauthenticated')) {
      console.log('Auth error detected, attempting to refresh session...');
      
      try {
        // Refrescar sesión y reintentar
        await refreshUserSession();
        return await paymentFunction(...args);
      } catch (retryError) {
        console.error('Retry failed:', retryError);
        throw new Error('Error de autenticación. Inicia sesión nuevamente.');
      }
    }
    
    throw error; // Re-throw si no es error de auth
  }
};

// Uso
const result = await securePayment(
  PaymentService.processPayment.bind(PaymentService),
  paymentData
);
```

## ⚠️ Consideraciones Importantes sobre CVC

### **Manejo de CVC por Proveedor**

#### **Stripe** 
- ✅ **SIEMPRE requiere CVC** para pagos con tarjetas guardadas
- ✅ Mayor seguridad, cumple estándares PCI DSS
- ❌ UX menos fluida por reingreso constante

#### **MercadoPago**
- ⚙️ **CVC configurable** mediante campo `requires_cvc`
- ✅ Flexibilidad según configuración de cuenta
- ⚠️ Verificar configuración en dashboard de MercadoPago

#### **Transbank**
- ❌ **No requiere CVC** para tarjetas guardadas  
- ✅ UX más fluida para usuarios recurrentes
- ⚠️ Menor nivel de validación adicional

### **Implementación Recomendada**
```javascript
// Componente inteligente que maneja CVC condicional
const SmartPaymentButton = ({ savedCard, amount }) => {
  const [showCvcInput, setShowCvcInput] = useState(false);
  
  useEffect(() => {
    // Determinar si mostrar CVC basado en proveedor y configuración
    const needsCvc = (
      savedCard.provider === 'stripe' || 
      (savedCard.provider === 'mercadopago' && savedCard.requires_cvc)
    );
    setShowCvcInput(needsCvc);
  }, [savedCard]);

  return (
    <View>
      {showCvcInput ? (
        <SavedCardPayment savedCard={savedCard} onPayment={handlePayment} />
      ) : (
        <QuickPayButton savedCard={savedCard} onPayment={handleQuickPayment} />
      )}
    </View>
  );
};
```

## 🔐 Seguridad y Mejores Prácticas

### **1. Validaciones Client-Side**
```javascript
const validateCardData = (cardData) => {
  const errors = [];
  
  if (!/^\d{13,19}$/.test(cardData.number.replace(/\s/g, ''))) {
    errors.push('Número de tarjeta inválido');
  }
  
  if (!/^\d{2}$/.test(cardData.expMonth) || cardData.expMonth < 1 || cardData.expMonth > 12) {
    errors.push('Mes de expiración inválido');
  }
  
  if (!/^\d{2,4}$/.test(cardData.expYear)) {
    errors.push('Año de expiración inválido');
  }
  
  return errors;
};
```

### **2. Manejo de Errores**
```javascript
const handlePaymentError = (error) => {
  const errorMessages = {
    'CARD_DECLINED': 'Tarjeta rechazada. Intenta con otra tarjeta.',
    'INSUFFICIENT_FUNDS': 'Fondos insuficientes.',
    'EXPIRED_CARD': 'La tarjeta ha expirado.',
    'NETWORK_ERROR': 'Error de conexión. Verifica tu internet.',
    'INVALID_CARD': 'Los datos de la tarjeta son inválidos.'
  };
  
  const message = errorMessages[error.code] || 'Error desconocido. Intenta nuevamente.';
  Alert.alert('Error de Pago', message);
};
```

## 📊 Monitoreo y Analytics

### **Tracking de Eventos**
```javascript
// utils/analytics.js
import analytics from '@react-native-firebase/analytics';

export const trackPaymentEvent = async (event, params) => {
  try {
    await analytics().logEvent(`payment_${event}`, {
      provider: params.provider,
      amount: params.amount,
      currency: params.currency,
      timestamp: new Date().getTime()
    });
  } catch (error) {
    console.error('Analytics error:', error);
  }
};

// Uso
trackPaymentEvent('initiated', { provider: 'stripe', amount: 50000, currency: 'CLP' });
trackPaymentEvent('completed', { provider: 'stripe', amount: 50000, currency: 'CLP' });
trackPaymentEvent('failed', { provider: 'stripe', error: 'card_declined' });
```

## 🧪 Testing

### **Mock de Cloud Functions para Testing**
```javascript
// __tests__/PaymentService.test.js
import PaymentService from '../services/PaymentService';

// Mock Firebase Functions
jest.mock('@react-native-firebase/functions', () => ({
  __esModule: true,
  default: () => ({
    httpsCallable: (functionName) => {
      return jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: { card_token: 'mock_token_123' }
        }
      });
    }
  })
}));

describe('PaymentService', () => {
  it('should tokenize card successfully', async () => {
    const result = await PaymentService.tokenizeCardDirect({
      number: '4242424242424242',
      expMonth: '12',
      expYear: '25',
      cvc: '123',
      holderName: 'Test User'
    });
    
    expect(result.success).toBe(true);
    expect(result.token).toBe('mock_token_123');
  });
});
```

## 🔧 Soluciones Avanzadas de Autenticación

### **Patrón de Retry con Exponential Backoff**
```javascript
// utils/RetryHelper.js
export const withRetry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'UNAUTHENTICATED' && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Auth retry ${attempt}/${maxRetries} in ${delay}ms`);
        
        // Intentar refresh del token
        try {
          const user = auth().currentUser;
          if (user) {
            await user.getIdToken(true);
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
};
```

### **Interceptor para Functions**
```javascript
// utils/FunctionsInterceptor.js
import { functions } from '../firebase';
import AuthService from '../services/AuthService';

class FunctionsInterceptor {
  static async callWithAuth(functionName, data) {
    try {
      // Verificar auth antes de llamar
      await AuthService.ensureAuthenticated();
      
      const callable = functions().httpsCallable(functionName);
      return await callable(data);
    } catch (error) {
      if (error.code === 'unauthenticated') {
        // Intentar una vez más con token refresh
        console.log('Retrying with fresh token...');
        await AuthService.refreshToken();
        const callable = functions().httpsCallable(functionName);
        return await callable(data);
      }
      throw error;
    }
  }
}

export default FunctionsInterceptor;
```

### **Debug Helper para Autenticación**
```javascript
// utils/AuthDebugger.js
import auth from '@react-native-firebase/auth';

export const debugAuth = async () => {
  const user = auth().currentUser;
  
  const debugInfo = {
    isLoggedIn: !!user,
    userId: user?.uid || null,
    email: user?.email || null,
    emailVerified: user?.emailVerified || false,
    tokenValid: null,
    lastSignIn: user?.metadata?.lastSignInTime || null,
    creationTime: user?.metadata?.creationTime || null
  };
  
  if (user) {
    try {
      const token = await user.getIdToken();
      debugInfo.tokenValid = !!token;
      debugInfo.tokenLength = token?.length || 0;
    } catch (error) {
      debugInfo.tokenValid = false;
      debugInfo.tokenError = error.message;
    }
  }
  
  console.log('🔍 Auth Debug Info:', debugInfo);
  return debugInfo;
};
```

---

## 📋 Checklist de Implementación

### **Configuración Inicial**
- [ ] Configurar Firebase Functions en React Native
- [ ] Implementar AuthService para manejo de autenticación
- [ ] Configurar interceptores para Functions calls

### **Servicios de Pago**
- [ ] Implementar PaymentService para llamadas a Cloud Functions
- [ ] Implementar manejo de retry con exponential backoff
- [ ] Configurar debug helpers para troubleshooting

### **Componentes UI**
- [ ] Crear componentes de UI (CardForm, PaymentProviderSelector)
- [ ] Implementar componente para tarjetas guardadas con CVC
- [ ] Añadir validaciones client-side

### **Flujos de Pago**
- [ ] Implementar flujo de tokenización directa (Stripe/MercadoPago)
- [ ] Implementar flujo de redirección (Solo Transbank)
- [ ] Configurar manejo de pagos con tarjetas guardadas
- [ ] Configurar manejo directo de Firestore para tarjetas

### **Testing y Monitoreo**
- [ ] Implementar manejo de errores robusto
- [ ] Configurar analytics y tracking
- [ ] Escribir tests unitarios
- [ ] Probar en dispositivos reales

### **Producción**
- [ ] Configurar webhooks en proveedores de pago
- [ ] Verificar autenticación en entorno de producción
- [ ] Implementar logging y monitoreo de errores

Este prompt te da una base completa para integrar el payment gateway en tu app React Native. ¿Hay algún aspecto específico que quieras que profundice más?