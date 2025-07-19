# 4K SMART SOLUTIONS - Customization Guide

## Overview
This application is a payment portal that allows users to either pay for internet access via M-Pesa or redeem existing voucher codes for 24-hour internet access on Omada Controller software.

## Application Structure

### Core Components
- **Payment Flow**: M-Pesa integration for collecting payments
- **Voucher System**: Both voucher code redemption and automatic generation
- **User Interface**: Responsive React frontend with payment forms and voucher input
- **Authorization**: Real-time status display for internet access

## Customization Options

### 1. Branding Customization

#### Company Name & Logo
- **File**: `src/pages/Index.tsx` (line 50)
- **Current**: "4K SMART SOLUTIONS"
- **Change**: Update the header title
```tsx
<h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
  YOUR COMPANY NAME
</h1>
```

#### Page Title & Meta Data
- **File**: `index.html` (lines 7-12)
- **Update**: Title, description, and author meta tags
```html
<title>Your Company - Internet Access via M-Pesa</title>
<meta name="author" content="Your Company Name" />
```

### 2. Payment Configuration

#### M-Pesa Settings
- **File**: `src/utils/mpesaApi.ts`
- **Configure**: 
  - Business short code
  - Consumer key/secret
  - Passkey
  - Callback URLs

#### Package Pricing
- **File**: `src/pages/Index.tsx` (lines 83-84)
- **Current**: KES 30 for 24 hours
- **Customize**: 
```tsx
<span className="text-2xl font-bold text-green-600">KSh YOUR_PRICE</span>
<CardDescription className="text-gray-600">
  Pay KSh YOUR_PRICE via M-Pesa for YOUR_DURATION unlimited internet access
</CardDescription>
```

### 3. Voucher Code System

#### Voucher Redemption
- **File**: `src/pages/Index.tsx` (lines 18-30)
- **Feature**: Users can enter existing voucher codes for instant access
- **Customize validation logic**:
```typescript
const handleVoucherSubmit = () => {
  // Add your voucher validation logic here
  // Connect to your backend/database to verify voucher
  if (isValidVoucher(voucherCode)) {
    // Grant access
  }
};
```

#### Voucher Input UI
- **Location**: `src/pages/Index.tsx` (lines 99-120)
- **Customize**: Placeholder text, validation messages, button styling

### 4. Omada Controller Integration

#### API Configuration
- **File**: `src/utils/omadaApi.ts`
- **Settings**:
  - Controller URL/IP address
  - Authentication credentials
  - Voucher generation parameters
  - Duration settings (currently 24 hours)

#### Voucher Generation
```typescript
// Modify voucher generation parameters
const voucherConfig = {
  duration: 24, // hours
  bandwidth: "unlimited", // or specify limits
  guestPolicy: "your-policy-name"
};
```

### 5. UI/UX Customization

#### Color Scheme
- **File**: `src/index.css`
- **Modify**: CSS custom properties for colors
```css
:root {
  --primary: YOUR_PRIMARY_COLOR_HSL;
  --secondary: YOUR_SECONDARY_COLOR_HSL;
  --accent: YOUR_ACCENT_COLOR_HSL;
}
```

#### Design System
- **File**: `tailwind.config.ts`
- **Customize**: Color tokens, animations, spacing

#### Logo/Icons
- Replace the Wifi icon with your company logo
- **Location**: `src/pages/Index.tsx` (line 48, 72)
```tsx
<YourLogo className="h-8 w-8 text-blue-600" />
```

#### Voucher Code Section Styling
- **Customize**: Input field appearance, button styling, divider text
- **Location**: `src/pages/Index.tsx` (lines 99-127)
```tsx
// Customize the "Or pay with M-Pesa" divider text
<span className="bg-white px-2 text-gray-500">YOUR_DIVIDER_TEXT</span>
```

### 6. Content Customization

#### Welcome Message
- **File**: `src/pages/Index.tsx` (lines 74-77)
- **Customize**: Welcome text and package description

#### Voucher Code Messages
- **File**: `src/pages/Index.tsx` (lines 115-117)
- **Customize**: Helper text and validation messages
```tsx
<p className="text-xs text-gray-500">
  YOUR_CUSTOM_VOUCHER_INSTRUCTION_TEXT
</p>
```

#### How It Works Section
- **File**: `src/pages/Index.tsx` (lines 155-180)
- **Modify**: Steps description to match your process (now includes voucher option)

#### Success/Error Messages
- **Locations**: Throughout payment flow components and voucher validation
- **Customize**: User feedback messages for both payment and voucher scenarios

### 7. Backend Integration (Recommended)

For production deployment, integrate with Supabase for:

#### Secure API Management
- Store M-Pesa and Omada credentials securely
- Handle payment processing server-side
- Generate and validate vouchers through edge functions

#### Database Features
- Payment history tracking
- User management
- Voucher code management and validation
- Voucher usage analytics
- Transaction logging

#### Voucher System Database Schema
```sql
-- Example voucher table structure
CREATE TABLE vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);
```

#### Setup Steps
1. Click the green Supabase button in Lovable
2. Create edge functions for:
   - M-Pesa payment processing
   - Omada Controller API calls
   - Voucher generation and validation
   - Voucher code verification

### 8. Phone Number Validation

#### Customize Validation Rules
- **File**: `src/pages/Index.tsx` (line 32)
- **Current**: Basic length validation (minimum 10 characters)
- **Modify**: For your country/format
```typescript
const phoneRegex = /^YOUR_PHONE_PATTERN$/;
if (!phoneRegex.test(phoneNumber)) {
  // Your validation message
}
```

### 9. Deployment Configuration

#### Environment Variables (via Supabase)
```
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
OMADA_CONTROLLER_URL=your_controller_ip
OMADA_USERNAME=your_username
OMADA_PASSWORD=your_password
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

#### Custom Domain
- Configure in Lovable Project Settings
- Update CORS settings for your domain

### 10. Advanced Customizations

#### Dual Access Methods
The application now supports both payment and voucher code access:
```tsx
// Customize the access options layout
const AccessOptions = () => (
  <div>
    <VoucherCodeInput />
    <PaymentDivider />
    <PaymentForm />
  </div>
);
```

#### Multiple Package Options
Add different duration/price packages:
```tsx
const packages = [
  { name: "1 Hour", price: 10, duration: 1 },
  { name: "24 Hours", price: 30, duration: 24 },
  { name: "7 Days", price: 200, duration: 168 }
];
```

#### Voucher Code Generation Patterns
```typescript
// Customize voucher code format
const generateVoucherCode = () => {
  const prefix = "4KSS"; // Your prefix
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
};
```

#### Multi-language Support
- Add language toggle
- Create translation files
- Update all text content including voucher-related text

#### Analytics Integration
- Add Google Analytics
- Track payment conversions
- Monitor voucher usage and redemption rates
- Track conversion between voucher and payment methods

## Security Considerations

1. **Never expose API keys** in frontend code
2. **Use Supabase edge functions** for sensitive operations
3. **Implement rate limiting** for payment attempts
4. **Validate all inputs** server-side
5. **Use HTTPS** for all API communications

## Testing

### Local Development
```bash
npm install
npm run dev
```

### Payment & Voucher Testing
- Use M-Pesa sandbox credentials for payment testing
- Test voucher generation with Omada test environment
- Test voucher code validation and redemption flow
- Verify all error handling scenarios for both payment and voucher paths
- Test the UI flow between voucher entry and payment options

## Support & Maintenance

### Regular Updates
- Monitor M-Pesa API changes
- Update Omada Controller compatibility
- Security patches and dependency updates

### Monitoring
- Set up payment failure alerts
- Monitor voucher generation and validation success rates
- Track voucher code redemption patterns
- Monitor user preference between payment vs voucher access
- Track user experience metrics for both access methods

## Getting Help

1. **Supabase Integration**: [Supabase Docs](https://docs.lovable.dev/integrations/supabase/)
2. **M-Pesa API**: Official Safaricom documentation
3. **Omada Controller**: TP-Link Omada API documentation
4. **Lovable Support**: Contact through your Lovable dashboard

---

*This guide covers the main customization options. For specific technical questions or advanced modifications, consult the relevant API documentation or contact your development team.*