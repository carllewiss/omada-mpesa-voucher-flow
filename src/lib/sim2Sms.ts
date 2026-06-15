import { registerPlugin, Capacitor } from "@capacitor/core";

export interface Sim2SmsPlugin {
  sendSms(options: { phoneNumber: string; message: string; simSlot?: number }): Promise<{ success: boolean }>;
}

const native = registerPlugin<Sim2SmsPlugin>("Sim2Sms");

export async function sendVoucherSms(phoneNumber: string, message: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.warn("[Sim2Sms] Web build — SMS not sent:", phoneNumber, message);
    return false;
  }
  try {
    const r = await native.sendSms({ phoneNumber, message, simSlot: 1 });
    return !!r.success;
  } catch (e) {
    console.error("[Sim2Sms] send failed", e);
    return false;
  }
}

export const SMS_TEMPLATE = (code: string, hours: number) =>
  `4K SMART WiFi: Your voucher is ${code}. Valid for ${hours} hrs. Thank you!`;