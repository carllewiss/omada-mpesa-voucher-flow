# 4K SMART SOLUTIONS - Customization Guide

## Overview
This application is a payment portal that allows users to pay for internet access via M-Pesa and automatically generates voucher codes for 24-hour internet access on Omada Controller software.

## Application Structure

### Core Components
- **Payment Flow**: M-Pesa integration for collecting payments
- **Voucher Generation**: Automatic voucher creation for Omada Controller
- **User Interface**: Responsive React frontend with payment forms
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
- **File**: `src/pages/Index.tsx` (lines 95-104)
- **Current**: KES 50 for 24 hours
- **Customize**: 
```tsx
<CardDescription className="text-2xl font-bold text-green-600">
  KES YOUR_PRICE
</CardDescription>
<p className="text-gray-600">
  Valid for YOUR_DURATION
</p>
```

### 3. Omada Controller Integration

#### API Configuration
- **File**: `src/utils/omadaApi.ts`
- **Settings**:
  - Controller URL/IP address
  - Authentication credentials
  - Voucher generation parameters
  - Duration settings (currently 24 hours)

#### Voucher Customization
```typescript
// Modify voucher generation parameters
const voucherConfig = {
  duration: 24, // hours
  bandwidth: "unlimited", // or specify limits
  guestPolicy: "your-policy-name"
};
```

### 4. UI/UX Customization

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
- **Location**: `src/pages/Index.tsx` (line 48)
```tsx
<YourLogo className="h-8 w-8 text-blue-600" />
```

### 5. Content Customization

#### Welcome Message
- **File**: `src/pages/Index.tsx` (lines 85-94)
- **Customize**: Welcome text and package description

#### How It Works Section
- **File**: `src/pages/Index.tsx` (lines 125-160)
- **Modify**: Steps description to match your process

#### Success/Error Messages
- **Locations**: Throughout payment flow components
- **Customize**: User feedback messages

### 6. Backend Integration (Recommended)

For production deployment, integrate with Supabase for:

#### Secure API Management
- Store M-Pesa and Omada credentials securely
- Handle payment processing server-side
- Generate vouchers through edge functions

#### Database Features
- Payment history tracking
- User management
- Voucher usage analytics
- Transaction logging

#### Setup Steps
1. Click the green Supabase button in Lovable
2. Create edge functions for:
   - M-Pesa payment processing
   - Omada Controller API calls
   - Voucher generation and validation

### 7. Phone Number Validation

#### Customize Validation Rules
- **File**: `src/pages/Index.tsx` (line 18)
- **Current**: Basic Kenyan number format
- **Modify**: For your country/format
```typescript
const phoneRegex = /^YOUR_PHONE_PATTERN$/;
if (!phoneRegex.test(phoneNumber)) {
  // Your validation message
}
```

### 8. Deployment Configuration

#### Environment Variables (via Supabase)
```
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
OMADA_CONTROLLER_URL=your_controller_ip
OMADA_USERNAME=your_username
OMADA_PASSWORD=your_password
```

#### Custom Domain
- Configure in Lovable Project Settings
- Update CORS settings for your domain

### 9. Advanced Customizations

#### Multiple Package Options
Add different duration/price packages:
```tsx
const packages = [
  { name: "1 Hour", price: 20, duration: 1 },
  { name: "24 Hours", price: 50, duration: 24 },
  { name: "7 Days", price: 300, duration: 168 }
];
```

#### Multi-language Support
- Add language toggle
- Create translation files
- Update all text content

#### Analytics Integration
- Add Google Analytics
- Track payment conversions
- Monitor voucher usage

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

### Payment Testing
- Use M-Pesa sandbox credentials
- Test voucher generation with Omada test environment
- Verify all error handling scenarios

## Support & Maintenance

### Regular Updates
- Monitor M-Pesa API changes
- Update Omada Controller compatibility
- Security patches and dependency updates

### Monitoring
- Set up payment failure alerts
- Monitor voucher generation success rates
- Track user experience metrics

## Getting Help

1. **Supabase Integration**: [Supabase Docs](https://docs.lovable.dev/integrations/supabase/)
2. **M-Pesa API**: Official Safaricom documentation
3. **Omada Controller**: TP-Link Omada API documentation
4. **Lovable Support**: Contact through your Lovable dashboard

---

*This guide covers the main customization options. For specific technical questions or advanced modifications, consult the relevant API documentation or contact your development team.*