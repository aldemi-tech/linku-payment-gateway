# 🔄 API Changes - Webhook Consolidation & Function Removal

## ⚡ Changes Made

### ❌ **Removed Functions**

#### 1. `getUserCards` - **REMOVED**
**Reason**: Cards are now read directly from Firestore in the app

#### 2. `deleteCard` - **REMOVED**
**Reason**: Card deletion is now handled directly from Firestore in the app

**Old Usage**:
```javascript
// This function no longer exists
const result = await firebase.functions().httpsCallable('getUserCards')({
  user_id: currentUser.uid
});
```

**New Approach**: 
```javascript
// Read cards directly from Firestore
const cardsQuery = firestore()
  .collection('payment_cards')
  .where('user_id', '==', currentUser.uid)
  .orderBy('is_default', 'desc')
  .orderBy('created_at', 'desc');
  
const cardsSnapshot = await cardsQuery.get();
const cards = cardsSnapshot.docs.map(doc => doc.data());

// Delete cards directly from Firestore
await firestore()
  .collection('payment_cards')
  .doc(cardId)
  .delete();
```

### 🔀 **Consolidated Functions**

#### 2. Webhooks - **CONSOLIDATED**

**Old Functions** (removed):
- `stripeWebhook`
- `transbankWebhook` 
- `mercadoPagoWebhook`

**New Single Function**: `webhook`

### 📍 **New Webhook Endpoints**

**Single webhook function with path-based routing:**

```
https://us-central1-linku-app.cloudfunctions.net/webhook/stripe
https://us-central1-linku-app.cloudfunctions.net/webhook/transbank  
https://us-central1-linku-app.cloudfunctions.net/webhook/mercadopago
```

### 🛠 **How to Configure Webhooks**

#### **Stripe Webhook Configuration**
```
Endpoint URL: https://us-central1-linku-app.cloudfunctions.net/webhook/stripe
Events to listen: payment_intent.succeeded, payment_intent.payment_failed
```

#### **Transbank Webhook Configuration**
```
Endpoint URL: https://us-central1-linku-app.cloudfunctions.net/webhook/transbank
Method: POST
```

#### **MercadoPago Webhook Configuration**
```
Endpoint URL: https://us-central1-linku-app.cloudfunctions.net/webhook/mercadopago
Events: payment, merchant_order
```

## ✅ **Benefits of Changes**

### 1. **Reduced Function Count**: 4 functions → 1 function
- Lower maintenance overhead
- Simpler deployment
- Reduced cold start impact

### 2. **Better Organization**: Single webhook endpoint with routing
- Cleaner URL structure
- Consistent webhook handling
- Easier to manage and monitor

### 3. **Performance Improvement**: Direct Firestore reads
- No function call overhead for card retrieval
- Real-time data access
- Better offline support

## 📊 **Updated Function List**

### **Active Functions** ✅
- `tokenizeCardDirect` - Direct card tokenization
- `createTokenizationSession` - Redirect tokenization  
- `completeTokenization` - Complete tokenization flow
- `processPayment` - Process payments
- `refundPayment` - Process refunds
- `webhook` - **NEW** Unified webhook handler

### **Removed Functions** ❌
- ~~`getUserCards`~~ - Use direct Firestore queries
- ~~`deleteCard`~~ - Use direct Firestore deletion
- ~~`stripeWebhook`~~ - Replaced by `/webhook/stripe`
- ~~`transbankWebhook`~~ - Replaced by `/webhook/transbank`  
- ~~`mercadoPagoWebhook`~~ - Replaced by `/webhook/mercadopago`

## 🔧 **Migration Guide**

### For Frontend Apps:
1. **Remove `getUserCards` calls** - Replace with direct Firestore queries
2. **Remove `deleteCard` calls** - Replace with direct Firestore deletion
3. **No changes needed** for other function calls - they remain the same

### For Payment Provider Configuration:
1. **Update webhook URLs** in provider dashboards
2. **Use new path-based endpoints** as shown above
3. **Test webhook delivery** to ensure proper routing

## 🎯 **Testing the New Webhook**

Test with curl:
```bash
# Test Stripe webhook
curl -X POST https://us-central1-linku-app.cloudfunctions.net/webhook/stripe \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Test Transbank webhook  
curl -X POST https://us-central1-linku-app.cloudfunctions.net/webhook/transbank \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Test MercadoPago webhook
curl -X POST https://us-central1-linku-app.cloudfunctions.net/webhook/mercadopago \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Expected Response:**
```json
{
  "received": true,
  "provider": "stripe",
  "timestamp": "2025-10-24T16:45:00.000Z"
}
```

## 📈 **Performance Impact**

- **Function count reduced**: 10 → 6 functions (-40%)
- **Webhook latency improved**: Single function warm start
- **Memory usage optimized**: Shared webhook logic
- **Deployment size reduced**: Less code duplication

The payment gateway is now more efficient and easier to maintain! 🚀