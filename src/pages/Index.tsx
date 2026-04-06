
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, Clock, Shield, CreditCard, Ticket, Check, RefreshCw, Phone, MessageCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import PaymentModal from "@/components/PaymentModal";
import AuthorizationStatus from "@/components/AuthorizationStatus";
import { supabase } from "@/integrations/supabase/client";

interface Package {
  id: string;
  name: string;
  duration: string;
  durationHours: number;
  price: number;
}

const packages: Package[] = [
  { id: "2hour", name: "2-Hour Package", duration: "2 Hours", durationHours: 2, price: 10 },
  { id: "24hour", name: "24-Hour Package", duration: "24 Hours", durationHours: 24, price: 30 },
];

interface OmadaParams {
  clientMac?: string;
  clientIp?: string;
  apMac?: string;
  ssid?: string;
}

const Index = () => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<Package>(packages[0]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success" | "failed">("idle");
  const [authorizationData, setAuthorizationData] = useState<any>(null);
  const [omadaParams, setOmadaParams] = useState<OmadaParams>({});

  // Capture Omada captive portal URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOmadaParams({
      clientMac: params.get("clientMac") || params.get("mac") || undefined,
      clientIp: params.get("clientIp") || params.get("ip") || undefined,
      apMac: params.get("apMac") || undefined,
      ssid: params.get("ssid") || undefined,
    });
  }, []);

  const [isRedeemingVoucher, setIsRedeemingVoucher] = useState(false);

  const handleVoucherSubmit = async () => {
    if (!voucherCode.trim()) {
      toast({
        title: "Invalid Voucher Code",
        description: "Please enter a valid voucher code",
        variant: "destructive",
      });
      return;
    }

    setIsRedeemingVoucher(true);
    try {
      const { data, error } = await supabase.functions.invoke('redeem-voucher', {
        body: {
          code: voucherCode.trim(),
          clientMac: omadaParams.clientMac || null,
          clientIp: omadaParams.clientIp || null,
          apMac: omadaParams.apMac || null,
          ssid: omadaParams.ssid || null,
        },
      });

      if (error || !data?.success) {
        toast({
          title: "Invalid Voucher",
          description: data?.error || "Voucher code is invalid or already used.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Voucher Redeemed!",
        description: `Your ${data.voucher.duration_hours}-hour access is being activated.`,
      });

      setPaymentStatus("success");
      setAuthorizationData({
        transactionId: `VOUCHER-${data.voucher.code}`,
        voucherData: {
          code: data.voucher.code,
          duration: `${data.voucher.duration_hours} Hours`,
          package: data.voucher.package_type,
        },
        expiryTime: new Date(Date.now() + data.voucher.duration_hours * 60 * 60 * 1000),
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to redeem voucher. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRedeemingVoucher(false);
    }
  };

  const handlePayment = () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number",
        variant: "destructive",
      });
      return;
    }
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async (data: any) => {
    setPaymentStatus("success");
    setAuthorizationData(data);
    setIsPaymentModalOpen(false);

    // Insert into client_authorizations with payment=paid, authorization=no
    try {
      await supabase.from('client_authorizations').insert({
        mac_address: omadaParams.clientMac || null,
        client_ip: omadaParams.clientIp || null,
        ap_mac: omadaParams.apMac || null,
        ssid: omadaParams.ssid || null,
        phone_number: phoneNumber,
        amount: selectedPackage.price,
        package_type: selectedPackage.id,
        duration_hours: selectedPackage.durationHours,
        payment_status: 'paid',
        authorization_status: 'no',
        checkout_request_id: data.checkoutRequestId || null,
        mpesa_receipt: data.voucherData?.code || null,
      });
    } catch (err) {
      console.error('Failed to save authorization record:', err);
    }
  };

  const handlePaymentFailure = () => {
    setPaymentStatus("failed");
    setIsPaymentModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-blue-100 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Wifi className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                4K SMART SOLUTIONS
              </h1>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                <Shield className="h-4 w-4" />
                <span>Secure Connection</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {paymentStatus === "success" && authorizationData ? (
          <AuthorizationStatus data={authorizationData} />
        ) : (
          <div className="max-w-md mx-auto">
            {/* Welcome Card */}
            <Card className="mb-8 bg-white/90 backdrop-blur-sm border-blue-200 shadow-xl">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center">
                  <Wifi className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl text-gray-800">Get Internet Access</CardTitle>
                <CardDescription className="text-gray-600">
                  Choose a package and pay via M-Pesa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Package Selection */}
                <div className="space-y-3">
                  <Label className="text-gray-700 font-semibold">Select Package</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {packages.map((pkg) => (
                      <button
                        key={pkg.id}
                        onClick={() => setSelectedPackage(pkg)}
                        className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                          selectedPackage.id === pkg.id
                            ? "border-green-500 bg-green-50 shadow-md"
                            : "border-gray-200 bg-white hover:border-blue-300"
                        }`}
                      >
                        {selectedPackage.id === pkg.id && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div className="text-2xl font-bold text-green-600">KSh {pkg.price}</div>
                        <div className="font-medium text-gray-800 text-sm mt-1">{pkg.name}</div>
                        <div className="flex items-center space-x-1 text-xs text-gray-500 mt-1">
                          <Clock className="h-3 w-3" />
                          <span>{pkg.duration}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voucher Code Input */}
                <div className="space-y-2">
                  <Label htmlFor="voucher" className="text-gray-700">
                    Voucher Code (Optional)
                  </Label>
                  <div className="flex space-x-2">
                    <Input
                      id="voucher"
                      type="text"
                      placeholder="Enter voucher code"
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value)}
                      className="border-blue-200 focus:border-blue-400"
                    />
                    <Button
                      onClick={handleVoucherSubmit}
                      variant="outline"
                      className="px-4 border-blue-200 hover:bg-blue-50"
                      disabled={!voucherCode.trim() || isRedeemingVoucher}
                    >
                      {isRedeemingVoucher ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ticket className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Have a voucher code? Enter it above to get instant access
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">Or pay with M-Pesa</span>
                  </div>
                </div>

                {/* Phone Number Input */}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-gray-700">
                    M-Pesa Phone Number
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="254700000000"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="border-blue-200 focus:border-blue-400"
                  />
                  <p className="text-xs text-gray-500">
                    Enter your M-Pesa registered phone number
                  </p>
                </div>

                {/* Payment Button */}
                <Button
                  onClick={handlePayment}
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-3 h-auto"
                  disabled={paymentStatus === "processing"}
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  {paymentStatus === "processing"
                    ? "Processing..."
                    : `Pay KSh ${selectedPackage.price} - ${selectedPackage.name}`}
                </Button>

                {paymentStatus === "failed" && (
                  <div className="text-center text-red-600 text-sm">
                    Payment failed. Please try again.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How it works */}
            <Card className="bg-white/90 backdrop-blur-sm border-blue-200">
              <CardHeader>
                <CardTitle className="text-center text-lg text-gray-800">How it works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-blue-600">1</span>
                    </div>
                    <p>Choose your preferred internet package</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-blue-600">2</span>
                    </div>
                    <p>Enter your M-Pesa number and complete payment</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-blue-600">3</span>
                    </div>
                    <p>Get instant internet access with your voucher</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        phoneNumber={phoneNumber}
        amount={selectedPackage.price}
        onSuccess={handlePaymentSuccess}
        onFailure={handlePaymentFailure}
        setPaymentStatus={setPaymentStatus}
      />
    </div>
  );
};

export default Index;
