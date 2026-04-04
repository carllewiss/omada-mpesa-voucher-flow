import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Phone, Ticket } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import VoucherGenerationModal from "./VoucherGenerationModal";
import { VoucherData } from "./VoucherCard";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneNumber: string;
  amount: number;
  onSuccess: (data: any) => void;
  onFailure: () => void;
  setPaymentStatus: (status: "idle" | "processing" | "success" | "failed") => void;
}

const PaymentModal = ({
  isOpen,
  onClose,
  phoneNumber,
  amount,
  onSuccess,
  onFailure,
  setPaymentStatus,
}: PaymentModalProps) => {
  const [currentStep, setCurrentStep] = useState<"initiating" | "waiting" | "success" | "voucher" | "failed">("initiating");
  const [countdown, setCountdown] = useState(120);
  const [checkoutRequestId, setCheckoutRequestId] = useState("");
  const [showVoucherModal, setShowVoucherModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep("initiating");
      setCountdown(120);
      initiateMpesaPayment();
    }
  }, [isOpen]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (currentStep === "waiting" && countdown > 0) {
      interval = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    } else if (countdown === 0 && currentStep === "waiting") {
      setCurrentStep("failed");
      setPaymentStatus("failed");
      toast({ title: "Payment Timeout", description: "Payment request timed out. Please try again.", variant: "destructive" });
    }
    return () => clearInterval(interval);
  }, [currentStep, countdown]);

  const initiateMpesaPayment = async () => {
    try {
      setPaymentStatus("processing");

      const packageType = amount === 10 ? "2hour" : "24hour";

      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { phoneNumber, amount, packageType },
      });

      if (error) throw error;

      if (data?.success) {
        setCheckoutRequestId(data.checkoutRequestId);
        setCurrentStep("waiting");
        pollPaymentStatus(data.checkoutRequestId);
      } else {
        throw new Error(data?.error || "Failed to initiate payment");
      }
    } catch (error: any) {
      console.error("Payment initiation failed:", error);
      setCurrentStep("failed");
      toast({ title: "Payment Failed", description: error.message || "Failed to initiate M-Pesa payment.", variant: "destructive" });
    }
  };

  const pollPaymentStatus = (reqId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/mpesa-status?checkoutRequestId=${reqId}`,
          { headers: { "Content-Type": "application/json" } }
        );
        const statusData = await res.json();

        if (statusData.status === "success") {
          clearInterval(pollInterval);
          setCurrentStep("success");
          setTimeout(() => {
            setCurrentStep("voucher");
            setShowVoucherModal(true);
          }, 2000);
        } else if (statusData.status === "failed" || statusData.status === "cancelled") {
          clearInterval(pollInterval);
          setCurrentStep("failed");
          onFailure();
        }
      } catch (err) {
        console.error("Status check failed:", err);
      }
    }, 5000);

    setTimeout(() => clearInterval(pollInterval), 120000);
  };

  const handleVoucherGenerated = (voucher: VoucherData) => {
    setShowVoucherModal(false);
    onSuccess({
      checkoutRequestId,
      voucherData: voucher,
      authorizationData: {
        username: voucher.username,
        password: voucher.password,
        voucher_code: voucher.code,
        expires_at: voucher.expiresAt,
      },
      expiryTime: new Date(voucher.expiresAt),
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">M-Pesa Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {currentStep === "initiating" && (
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
              <div>
                <h3 className="font-semibold text-lg">Initiating Payment</h3>
                <p className="text-gray-600">Sending STK push to your phone...</p>
              </div>
            </div>
          )}

          {currentStep === "waiting" && (
            <div className="text-center space-y-4">
              <Phone className="h-12 w-12 mx-auto text-green-600 animate-pulse" />
              <div>
                <h3 className="font-semibold text-lg">Check Your Phone</h3>
                <p className="text-gray-600 mb-2">
                  Enter your M-Pesa PIN to complete the payment of <strong>KSh {amount}</strong>
                </p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-orange-800 text-sm">
                  ⏱️ Time remaining: <strong>{formatTime(countdown)}</strong>
                </p>
              </div>
            </div>
          )}

          {currentStep === "success" && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
              <div>
                <h3 className="font-semibold text-lg text-green-600">Payment Successful!</h3>
                <p className="text-gray-600">Preparing your voucher...</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-800 text-sm flex items-center justify-center">
                  <Ticket className="h-4 w-4 mr-2" />
                  Generating internet access voucher automatically
                </p>
              </div>
            </div>
          )}

          {currentStep === "voucher" && (
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 mx-auto text-blue-600 animate-spin" />
              <div>
                <h3 className="font-semibold text-lg text-blue-600">Generating Voucher</h3>
                <p className="text-gray-600">Creating your internet access voucher...</p>
              </div>
            </div>
          )}

          {currentStep === "failed" && (
            <div className="text-center space-y-4">
              <XCircle className="h-12 w-12 mx-auto text-red-600" />
              <div>
                <h3 className="font-semibold text-lg text-red-600">Payment Failed</h3>
                <p className="text-gray-600">Please try again or contact support.</p>
              </div>
              <Button onClick={onClose} variant="outline" className="w-full">
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>

      <VoucherGenerationModal
        isOpen={showVoucherModal}
        onClose={() => setShowVoucherModal(false)}
        transactionId={checkoutRequestId}
        phoneNumber={phoneNumber}
        amount={amount}
        onVoucherGenerated={handleVoucherGenerated}
      />
    </Dialog>
  );
};

export default PaymentModal;
