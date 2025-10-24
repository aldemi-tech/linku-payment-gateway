# Ejemplos de Uso desde Frontend

## Configuración Inicial

```javascript
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const auth = getAuth(app);

// Para desarrollo local
if (process.env.NODE_ENV === 'development') {
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

## 1. Tokenización Directa (Stripe/MercadoPago)

### React Component Example

```tsx
import React, { useState } from 'react';

const DirectTokenization = ({ userId, provider }: { userId: string, provider: 'stripe' | 'mercadopago' }) => {
  const [cardData, setCardData] = useState({
    cardNumber: '',
    expMonth: '',
    expYear: '',
    cvv: '',
    holderName: ''
  });
  const [loading, setLoading] = useState(false);

  const tokenizeCard = async () => {
    setLoading(true);
    try {
      const tokenizeCardDirect = httpsCallable(functions, 'tokenizeCardDirect');
      const result = await tokenizeCardDirect({
        user_id: userId,
        provider: provider,
        card_number: cardData.cardNumber.replace(/\s/g, ''),
        card_exp_month: parseInt(cardData.expMonth),
        card_exp_year: parseInt(cardData.expYear),
        card_cvv: cardData.cvv,
        card_holder_name: cardData.holderName,
        set_as_default: true
      });

      if (result.data.success) {
        console.log('Tarjeta tokenizada:', result.data.data);
        alert('Tarjeta guardada exitosamente');
      } else {
        console.error('Error:', result.data.error);
        alert(result.data.error.message);
      }
    } catch (error) {
      console.error('Error tokenizing card:', error);
      alert('Error al guardar la tarjeta');
    }
    setLoading(false);
  };

  return (
    <div className="card-form">
      <h3>Agregar Tarjeta - {provider}</h3>
      <form onSubmit={(e) => { e.preventDefault(); tokenizeCard(); }}>
        <input
          type="text"
          placeholder="Número de tarjeta"
          value={cardData.cardNumber}
          onChange={(e) => setCardData({ ...cardData, cardNumber: e.target.value })}
          maxLength={19}
        />
        <div className="exp-date">
          <input
            type="text"
            placeholder="MM"
            value={cardData.expMonth}
            onChange={(e) => setCardData({ ...cardData, expMonth: e.target.value })}
            maxLength={2}
          />
          <input
            type="text"
            placeholder="YYYY"
            value={cardData.expYear}
            onChange={(e) => setCardData({ ...cardData, expYear: e.target.value })}
            maxLength={4}
          />
        </div>
        <input
          type="text"
          placeholder="CVV"
          value={cardData.cvv}
          onChange={(e) => setCardData({ ...cardData, cvv: e.target.value })}
          maxLength={4}
        />
        <input
          type="text"
          placeholder="Nombre del titular"
          value={cardData.holderName}
          onChange={(e) => setCardData({ ...cardData, holderName: e.target.value })}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar Tarjeta'}
        </button>
      </form>
    </div>
  );
};
```

## 2. Tokenización por Redirección (Transbank)

```tsx
import React, { useState, useEffect } from 'react';

const RedirectTokenization = ({ userId }: { userId: string }) => {
  const [loading, setLoading] = useState(false);

  const startTokenization = async () => {
    setLoading(true);
    try {
      const createTokenizationSession = httpsCallable(functions, 'createTokenizationSession');
      const result = await createTokenizationSession({
        user_id: userId,
        provider: 'transbank',
        return_url: `${window.location.origin}/tokenization-callback`,
        set_as_default: true,
        metadata: {
          email: 'usuario@ejemplo.com'
        }
      });

      if (result.data.success) {
        // Redirigir al usuario a Transbank
        window.location.href = result.data.data.redirect_url;
      } else {
        console.error('Error:', result.data.error);
        alert(result.data.error.message);
      }
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Error al crear sesión de tokenización');
    }
    setLoading(false);
  };

  return (
    <div className="redirect-tokenization">
      <h3>Agregar Tarjeta - Transbank</h3>
      <p>Serás redirigido a Transbank para ingresar los datos de tu tarjeta de forma segura.</p>
      <button onClick={startTokenization} disabled={loading}>
        {loading ? 'Creando sesión...' : 'Agregar Tarjeta'}
      </button>
    </div>
  );
};

// Componente para manejar el callback de Transbank
const TokenizationCallback = () => {
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const completeTokenization = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');
      const success = urlParams.get('success');

      if (!sessionId || success !== 'true') {
        alert('Tokenización cancelada o fallida');
        return;
      }

      try {
        const completeTokenizationFunc = httpsCallable(functions, 'completeTokenization');
        const result = await completeTokenizationFunc({
          session_id: sessionId,
          provider: 'transbank',
          callback_data: Object.fromEntries(urlParams.entries())
        });

        if (result.data.success) {
          alert('Tarjeta guardada exitosamente');
          // Redirigir a página principal o mostrar tarjetas
          window.location.href = '/cards';
        } else {
          console.error('Error:', result.data.error);
          alert(result.data.error.message);
        }
      } catch (error) {
        console.error('Error completing tokenization:', error);
        alert('Error al completar la tokenización');
      }
      setProcessing(false);
    };

    completeTokenization();
  }, []);

  return (
    <div className="tokenization-callback">
      {processing ? (
        <div>Procesando tokenización...</div>
      ) : (
        <div>Tokenización completada</div>
      )}
    </div>
  );
};
```

## 3. Listar Tarjetas del Usuario

```tsx
import React, { useState, useEffect } from 'react';

interface PaymentCard {
  card_id: string;
  card_holder_name: string;
  card_last_four: string;
  card_brand: string;
  card_type: string;
  expiration_month: number;
  expiration_year: number;
  is_default: boolean;
  alias?: string;
}

const UserCards = ({ userId }: { userId: string }) => {
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCards = async () => {
    try {
      const getUserCards = httpsCallable(functions, 'getUserCards');
      const result = await getUserCards({ user_id: userId });

      if (result.data.success) {
        setCards(result.data.data.cards);
      } else {
        console.error('Error:', result.data.error);
      }
    } catch (error) {
      console.error('Error loading cards:', error);
    }
    setLoading(false);
  };

  const deleteCard = async (cardId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta tarjeta?')) return;

    try {
      const deleteCardFunc = httpsCallable(functions, 'deleteCard');
      const result = await deleteCardFunc({ card_id: cardId });

      if (result.data.success) {
        alert('Tarjeta eliminada');
        loadCards(); // Recargar lista
      } else {
        alert(result.data.error.message);
      }
    } catch (error) {
      console.error('Error deleting card:', error);
      alert('Error al eliminar la tarjeta');
    }
  };

  useEffect(() => {
    loadCards();
  }, [userId]);

  if (loading) return <div>Cargando tarjetas...</div>;

  return (
    <div className="user-cards">
      <h3>Mis Tarjetas</h3>
      {cards.length === 0 ? (
        <p>No tienes tarjetas guardadas</p>
      ) : (
        cards.map(card => (
          <div key={card.card_id} className="card-item">
            <div className="card-info">
              <div className="card-brand">{card.card_brand.toUpperCase()}</div>
              <div className="card-number">**** **** **** {card.card_last_four}</div>
              <div className="card-holder">{card.card_holder_name}</div>
              <div className="card-exp">{card.expiration_month}/{card.expiration_year}</div>
              {card.is_default && <span className="default-badge">Predeterminada</span>}
            </div>
            <button onClick={() => deleteCard(card.card_id)} className="delete-btn">
              Eliminar
            </button>
          </div>
        ))
      )}
    </div>
  );
};
```

## 4. Procesar Pago

```tsx
import React, { useState } from 'react';

const ProcessPayment = ({ 
  userId, 
  professionalId, 
  serviceId, 
  amount, 
  currency = 'CLP',
  provider = 'stripe' 
}: {
  userId: string;
  professionalId: string;
  serviceId: string;
  amount: number;
  currency?: string;
  provider?: string;
}) => {
  const [selectedCardId, setSelectedCardId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [cards, setCards] = useState<PaymentCard[]>([]);

  const processPayment = async () => {
    if (!selectedCardId) {
      alert('Selecciona una tarjeta');
      return;
    }

    setProcessing(true);
    try {
      const processPaymentFunc = httpsCallable(functions, 'processPayment');
      const result = await processPaymentFunc({
        user_id: userId,
        professional_id: professionalId,
        service_request_id: serviceId,
        amount: amount,
        currency: currency,
        provider: provider,
        token_id: selectedCardId, // Usar card_id o payment_token
        description: `Pago por servicio ${serviceId}`
      });

      if (result.data.success) {
        const payment = result.data.data;
        if (payment.status === 'completed') {
          alert('Pago procesado exitosamente');
          // Redirigir o mostrar confirmación
        } else if (payment.status === 'pending') {
          alert('Pago en proceso, recibirás una notificación');
        } else {
          alert('El pago falló, intenta nuevamente');
        }
      } else {
        console.error('Error:', result.data.error);
        alert(result.data.error.message);
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Error al procesar el pago');
    }
    setProcessing(false);
  };

  return (
    <div className="process-payment">
      <h3>Procesar Pago</h3>
      <div className="payment-details">
        <p>Monto: {currency} {amount.toLocaleString()}</p>
        <p>Proveedor: {provider}</p>
      </div>

      <div className="card-selection">
        <label>Selecciona una tarjeta:</label>
        <select 
          value={selectedCardId} 
          onChange={(e) => setSelectedCardId(e.target.value)}
        >
          <option value="">-- Seleccionar tarjeta --</option>
          {cards.map(card => (
            <option key={card.card_id} value={card.card_id}>
              {card.card_brand.toUpperCase()} **** {card.card_last_four} - {card.card_holder_name}
            </option>
          ))}
        </select>
      </div>

      <button 
        onClick={processPayment} 
        disabled={processing || !selectedCardId}
        className="pay-button"
      >
        {processing ? 'Procesando...' : `Pagar ${currency} ${amount.toLocaleString()}`}
      </button>
    </div>
  );
};
```

## 5. Manejo de Errores Global

```tsx
import React from 'react';

// Hook para manejo de errores de Cloud Functions
const usePaymentGateway = () => {
  const handleError = (error: any) => {
    console.error('Payment Gateway Error:', error);
    
    if (error?.data?.error) {
      const { code, message } = error.data.error;
      
      switch (code) {
        case 'UNAUTHENTICATED':
          alert('Debes iniciar sesión para continuar');
          // Redirigir a login
          break;
        case 'UNAUTHORIZED':
          alert('No tienes permisos para realizar esta acción');
          break;
        case 'VALIDATION_ERROR':
          alert(`Error de validación: ${message}`);
          break;
        case 'TOKENIZATION_FAILED':
          alert('Error al guardar la tarjeta. Verifica los datos e intenta nuevamente.');
          break;
        case 'PAYMENT_FAILED':
          alert('El pago no pudo ser procesado. Intenta con otra tarjeta.');
          break;
        case 'NOT_FOUND':
          alert('El recurso solicitado no fue encontrado');
          break;
        default:
          alert(`Error: ${message}`);
      }
    } else {
      alert('Error de conexión. Intenta nuevamente.');
    }
  };

  return { handleError };
};
```

## 6. CSS de Ejemplo

```css
/* Estilos básicos para los componentes */
.card-form {
  max-width: 400px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.card-form input {
  width: 100%;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.exp-date {
  display: flex;
  gap: 10px;
}

.exp-date input {
  flex: 1;
}

.card-form button {
  width: 100%;
  padding: 12px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.card-form button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.card-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 10px;
}

.card-info {
  flex: 1;
}

.card-brand {
  font-weight: bold;
  text-transform: uppercase;
}

.card-number {
  font-family: monospace;
  font-size: 16px;
  margin: 5px 0;
}

.default-badge {
  background-color: #28a745;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.delete-btn {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.pay-button {
  background-color: #28a745;
  color: white;
  border: none;
  padding: 15px 30px;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  width: 100%;
}

.pay-button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}
```

## Router Configuration (React Router)

```tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/cards" element={<UserCards userId={currentUserId} />} />
        <Route path="/add-card/direct" element={<DirectTokenization userId={currentUserId} provider="stripe" />} />
        <Route path="/add-card/redirect" element={<RedirectTokenization userId={currentUserId} />} />
        <Route path="/tokenization-callback" element={<TokenizationCallback />} />
        <Route path="/pay" element={<ProcessPayment {...paymentProps} />} />
      </Routes>
    </Router>
  );
};
```