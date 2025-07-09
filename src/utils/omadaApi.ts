
// Omada Controller API utility functions
// Note: These should be implemented as secure backend endpoints

export interface OmadaAuthRequest {
  phoneNumber: string;
  duration: number; // in seconds
  packageType: string;
  bandwidth?: {
    upload: number; // in Kbps
    download: number; // in Kbps
  };
}

export interface OmadaAuthResponse {
  success: boolean;
  voucherId: string;
  clientId: string;
  username: string;
  password: string;
  expiryTime: string;
  sessionId?: string;
}

export interface OmadaVoucher {
  id: string;
  username: string;
  password: string;
  duration: number;
  status: 'active' | 'expired' | 'used';
  createdAt: string;
  expiryTime: string;
  clientMac?: string;
  clientIp?: string;
}

// Configuration - In production, these should be environment variables
const OMADA_CONFIG = {
  controllerUrl: process.env.OMADA_CONTROLLER_URL || 'https://192.168.1.1:8443',
  username: process.env.OMADA_USERNAME || 'admin',
  password: process.env.OMADA_PASSWORD || 'admin',
  siteId: process.env.OMADA_SITE_ID || 'Default',
  omadacId: process.env.OMADA_OMADAC_ID || '',
};

// Login to Omada controller and get session token
export const loginToOmada = async (): Promise<string> => {
  const loginUrl = `${OMADA_CONFIG.controllerUrl}/${OMADA_CONFIG.omadacId}/api/v2/login`;
  
  const loginData = {
    username: OMADA_CONFIG.username,
    password: OMADA_CONFIG.password,
  };

  try {
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loginData),
    });

    if (!response.ok) {
      throw new Error('Failed to login to Omada controller');
    }

    const data = await response.json();
    
    if (data.errorCode === 0) {
      return data.result.token;
    } else {
      throw new Error(`Login failed: ${data.msg}`);
    }
  } catch (error) {
    console.error('Error logging into Omada controller:', error);
    throw error;
  }
};

// Create a voucher on Omada controller
export const createVoucher = async (authRequest: OmadaAuthRequest): Promise<OmadaVoucher> => {
  const token = await loginToOmada();
  
  const voucherUrl = `${OMADA_CONFIG.controllerUrl}/${OMADA_CONFIG.omadacId}/api/v2/sites/${OMADA_CONFIG.siteId}/vouchers`;
  
  // Generate unique username based on phone number and timestamp
  const username = `user_${authRequest.phoneNumber.slice(-8)}_${Date.now().toString().slice(-6)}`;
  const password = generateRandomPassword();
  
  const voucherData = {
    type: 'single', // single use voucher
    quantity: 1,
    prefix: username,
    passwordType: 'fixed',
    password: password,
    duration: authRequest.duration,
    durationUnit: 'second',
    upLimit: authRequest.bandwidth?.upload || 0, // 0 means unlimited
    downLimit: authRequest.bandwidth?.download || 0, // 0 means unlimited
    dataLimit: 0, // 0 means unlimited data
    dataLimitUnit: 'MB',
    note: `24-hour package for ${authRequest.phoneNumber}`,
  };

  try {
    const response = await fetch(voucherUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Csrf-Token': token,
      },
      body: JSON.stringify(voucherData),
    });

    if (!response.ok) {
      throw new Error('Failed to create voucher');
    }

    const data = await response.json();
    
    if (data.errorCode === 0) {
      const voucher: OmadaVoucher = {
        id: data.result[0].id,
        username: data.result[0].username,
        password: data.result[0].password,
        duration: authRequest.duration,
        status: 'active',
        createdAt: new Date().toISOString(),
        expiryTime: new Date(Date.now() + authRequest.duration * 1000).toISOString(),
      };
      
      return voucher;
    } else {
      throw new Error(`Voucher creation failed: ${data.msg}`);
    }
  } catch (error) {
    console.error('Error creating voucher:', error);
    throw error;
  }
};

// Authorize user with created voucher
export const authorizeUser = async (authRequest: OmadaAuthRequest): Promise<OmadaAuthResponse> => {
  try {
    // First create the voucher
    const voucher = await createVoucher(authRequest);
    
    // Then authorize the user (auto-login with voucher)
    const authResponse: OmadaAuthResponse = {
      success: true,
      voucherId: voucher.id,
      clientId: `client_${authRequest.phoneNumber.slice(-8)}`,
      username: voucher.username,
      password: voucher.password,
      expiryTime: voucher.expiryTime,
    };

    // Optionally, you can also trigger auto-authentication here
    // This depends on your Omada controller setup and network configuration
    
    return authResponse;
  } catch (error) {
    console.error('Error authorizing user:', error);
    throw error;
  }
};

// Check voucher status
export const checkVoucherStatus = async (voucherId: string): Promise<OmadaVoucher | null> => {
  const token = await loginToOmada();
  
  const statusUrl = `${OMADA_CONFIG.controllerUrl}/${OMADA_CONFIG.omadacId}/api/v2/sites/${OMADA_CONFIG.siteId}/vouchers/${voucherId}`;

  try {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Csrf-Token': token,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to check voucher status');
    }

    const data = await response.json();
    
    if (data.errorCode === 0 && data.result) {
      const voucher: OmadaVoucher = {
        id: data.result.id,
        username: data.result.username,
        password: data.result.password,
        duration: data.result.duration,
        status: data.result.status,
        createdAt: data.result.createdTime,
        expiryTime: data.result.expireTime,
        clientMac: data.result.clientMac,
        clientIp: data.result.clientIp,
      };
      
      return voucher;
    }
    
    return null;
  } catch (error) {
    console.error('Error checking voucher status:', error);
    return null;
  }
};

// Revoke/delete voucher
export const revokeVoucher = async (voucherId: string): Promise<boolean> => {
  const token = await loginToOmada();
  
  const revokeUrl = `${OMADA_CONFIG.controllerUrl}/${OMADA_CONFIG.omadacId}/api/v2/sites/${OMADA_CONFIG.siteId}/vouchers/${voucherId}`;

  try {
    const response = await fetch(revokeUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Csrf-Token': token,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to revoke voucher');
    }

    const data = await response.json();
    return data.errorCode === 0;
  } catch (error) {
    console.error('Error revoking voucher:', error);
    return false;
  }
};

// Get active clients (users currently connected)
export const getActiveClients = async (): Promise<any[]> => {
  const token = await loginToOmada();
  
  const clientsUrl = `${OMADA_CONFIG.controllerUrl}/${OMADA_CONFIG.omadacId}/api/v2/sites/${OMADA_CONFIG.siteId}/clients`;

  try {
    const response = await fetch(clientsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Csrf-Token': token,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get active clients');
    }

    const data = await response.json();
    
    if (data.errorCode === 0) {
      return data.result || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error getting active clients:', error);
    return [];
  }
};

// Generate random password for vouchers
const generateRandomPassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Logout from Omada controller
export const logoutFromOmada = async (token: string): Promise<void> => {
  const logoutUrl = `${OMADA_CONFIG.controllerUrl}/${OMADA_CONFIG.omadacId}/api/v2/logout`;
  
  try {
    await fetch(logoutUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Csrf-Token': token,
      },
    });
  } catch (error) {
    console.error('Error logging out from Omada controller:', error);
  }
};
