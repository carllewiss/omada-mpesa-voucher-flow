
// M-Pesa API utility functions
// Note: In production, these should be implemented as secure backend endpoints

export interface MpesaPaymentRequest {
  phoneNumber: string;
  amount: number;
  accountReference?: string;
  transactionDesc?: string;
}

export interface MpesaPaymentResponse {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

export interface MpesaStatusResponse {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: string;
  resultDesc: string;
  callbackMetadata?: {
    amount: number;
    mpesaReceiptNumber: string;
    transactionDate: string;
    phoneNumber: string;
  };
}

// Configuration - Using Daraja API Sandbox credentials
const MPESA_CONFIG = {
  consumerKey: 'V6b55cpLtdRGb03iPNOqLyLu3TDUNAAWfLUIIvBGEYzqadsE',
  consumerSecret: 'ES8Iutab3w8vRwH6AwqrLa2wneERGyGlAlQf5hQMRE7SqjjwXERg2rB7IlQrWRjr',
  businessShortCode: '174379', // Default sandbox shortcode
  passkey: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919', // Default sandbox passkey
  callbackUrl: 'https://your-domain.com/api/mpesa/callback',
  environment: 'sandbox', // Using sandbox environment
};

// Generate OAuth token for M-Pesa API
export const generateMpesaToken = async (): Promise<string> => {
  const auth = btoa(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`);
  
  const baseUrl = MPESA_CONFIG.environment === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';
  
  try {
    const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to generate M-Pesa token');
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error generating M-Pesa token:', error);
    throw error;
  }
};

// Generate timestamp for M-Pesa API
export const generateTimestamp = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}${hour}${minute}${second}`;
};

// Generate password for M-Pesa STK Push
export const generatePassword = (timestamp: string): string => {
  const data = `${MPESA_CONFIG.businessShortCode}${MPESA_CONFIG.passkey}${timestamp}`;
  return btoa(data);
};

// Initiate STK Push payment
export const initiateStkPush = async (paymentData: MpesaPaymentRequest): Promise<MpesaPaymentResponse> => {
  const token = await generateMpesaToken();
  const timestamp = generateTimestamp();
  const password = generatePassword(timestamp);
  
  const baseUrl = MPESA_CONFIG.environment === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';

  const requestBody = {
    BusinessShortCode: MPESA_CONFIG.businessShortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: paymentData.amount,
    PartyA: paymentData.phoneNumber,
    PartyB: MPESA_CONFIG.businessShortCode,
    PhoneNumber: paymentData.phoneNumber,
    CallBackURL: MPESA_CONFIG.callbackUrl,
    AccountReference: paymentData.accountReference || 'OmadaPortal',
    TransactionDesc: paymentData.transactionDesc || 'Internet Access Payment',
  };

  try {
    const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error('Failed to initiate STK Push');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error initiating STK Push:', error);
    throw error;
  }
};

// Query STK Push payment status
export const queryPaymentStatus = async (checkoutRequestId: string): Promise<MpesaStatusResponse> => {
  const token = await generateMpesaToken();
  const timestamp = generateTimestamp();
  const password = generatePassword(timestamp);
  
  const baseUrl = MPESA_CONFIG.environment === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';

  const requestBody = {
    BusinessShortCode: MPESA_CONFIG.businessShortCode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  try {
    const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error('Failed to query payment status');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error querying payment status:', error);
    throw error;
  }
};

// Format phone number to M-Pesa format
export const formatPhoneNumber = (phone: string): string => {
  // Remove any non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Handle different input formats
  if (cleaned.startsWith('254')) {
    return cleaned;
  } else if (cleaned.startsWith('0')) {
    return '254' + cleaned.substring(1);
  } else if (cleaned.length === 9) {
    return '254' + cleaned;
  }
  
  return cleaned;
};
