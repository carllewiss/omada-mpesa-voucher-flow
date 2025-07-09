
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, Clock, Shield, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import PaymentModal from "@/components/PaymentModal";
import AuthorizationStatus from "@/components/AuthorizationStatus";

const Index = () => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success" | "failed">("idle");
  const [authorizationData, setAuthorizationData] = useState<any>(null);

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

  const handlePaymentSuccess = (data: any) => {
    setPaymentStatus("success");
    setAuthorizationData(data);
    setIsPaymentModalOpen(false);
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
                Omada Portal
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
                  Pay KSh 50 via M-Pesa for 24-hour unlimited internet access
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Package Details */}
                <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-lg border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-800">24-Hour Package</span>
                    <span className="text-2xl font-bold text-green-600">KSh 50</span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4" />
                      <span>24 Hours</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Wifi className="h-4 w-4" />
                      <span>Unlimited</span>
                    </div>
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
                  {paymentStatus === "processing" ? "Processing..." : "Pay with M-Pesa"}
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
                    <p>Enter your M-Pesa registered phone number</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-blue-600">2</span>
                    </div>
                    <p>Complete payment of KSh 50 via M-Pesa</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-blue-600">3</span>
                    </div>
                    <p>Get instant internet access for 24 hours</p>
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
        amount={50}
        onSuccess={handlePaymentSuccess}
        onFailure={handlePaymentFailure}
        setPaymentStatus={setPaymentStatus}
      />
    </div>
  );
};

export default Index;
