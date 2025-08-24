import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Settings, CheckCircle, Ticket, Zap } from "lucide-react";
import VoucherCard, { VoucherData } from "./VoucherCard";

interface VoucherGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string;
  phoneNumber: string;
  amount: number;
  onVoucherGenerated: (voucher: VoucherData) => void;
}

const VoucherGenerationModal = ({
  isOpen,
  onClose,
  transactionId,
  phoneNumber,
  amount,
  onVoucherGenerated,
}: VoucherGenerationModalProps) => {
  const [currentStep, setCurrentStep] = useState<"connecting" | "generating" | "complete">("connecting");
  const [progress, setProgress] = useState(0);
  const [generatedVoucher, setGeneratedVoucher] = useState<VoucherData | null>(null);

  useEffect(() => {
    if (isOpen) {
      startVoucherGeneration();
    }
  }, [isOpen]);

  const startVoucherGeneration = async () => {
    // Step 1: Connecting to Omada Controller
    setCurrentStep("connecting");
    setProgress(20);
    
    await simulateDelay(1500);
    setProgress(50);
    
    // Step 2: Generating voucher
    setCurrentStep("generating");
    setProgress(70);
    
    await simulateDelay(2000);
    setProgress(90);
    
    // Step 3: Complete - Generate mock voucher
    const voucher: VoucherData = {
      code: generateVoucherCode(),
      username: `user_${Date.now()}`,
      password: generatePassword(),
      validity: "24 hours",
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      packageType: "24-Hour Unlimited",
      transactionId,
      status: 'active'
    };
    
    setGeneratedVoucher(voucher);
    setCurrentStep("complete");
    setProgress(100);
    
    // Notify parent component
    onVoucherGenerated(voucher);
  };

  const simulateDelay = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  const generateVoucherCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      if (i > 0 && i % 4 === 0) result += '-';
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const getStepIcon = () => {
    switch (currentStep) {
      case "connecting":
        return <Settings className="h-8 w-8 text-blue-600 animate-spin" />;
      case "generating":
        return <Zap className="h-8 w-8 text-yellow-600 animate-pulse" />;
      case "complete":
        return <CheckCircle className="h-8 w-8 text-green-600" />;
      default:
        return <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case "connecting":
        return "Connecting to Omada Controller";
      case "generating":
        return "Generating Your Voucher";
      case "complete":
        return "Voucher Generated Successfully!";
      default:
        return "Processing...";
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case "connecting":
        return "Establishing secure connection with the network controller...";
      case "generating":
        return "Creating your personalized internet access voucher...";
      case "complete":
        return "Your voucher is ready! Use these credentials to connect to Wi-Fi.";
      default:
        return "Please wait while we process your request...";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center">
            <Ticket className="h-5 w-5 mr-2 text-blue-600" />
            Automatic Voucher Generation
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {currentStep !== "complete" ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                {getStepIcon()}
              </div>
              
              <div>
                <h3 className="font-semibold text-lg text-gray-800">
                  {getStepTitle()}
                </h3>
                <p className="text-gray-600 text-sm mt-2">
                  {getStepDescription()}
                </p>
              </div>

              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-xs text-gray-500">
                  {progress}% complete
                </p>
              </div>

              {/* Payment Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Payment Confirmed:</strong> KSh {amount}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Transaction: {transactionId}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-2" />
                <h3 className="font-semibold text-lg text-green-600">
                  Voucher Generated Successfully!
                </h3>
                <p className="text-gray-600 text-sm">
                  Your internet access voucher has been created and is ready to use.
                </p>
              </div>

              {generatedVoucher && (
                <VoucherCard voucher={generatedVoucher} showActions={true} />
              )}

              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h4 className="font-medium text-green-800 mb-2">How to Connect:</h4>
                <ol className="text-sm text-green-700 space-y-1">
                  <li>1. Connect to the Wi-Fi network</li>
                  <li>2. Open your browser (any website)</li>
                  <li>3. Enter the username and password above</li>
                  <li>4. Enjoy 24 hours of unlimited internet!</li>
                </ol>
              </div>

              <Button
                onClick={onClose}
                className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
              >
                Get Connected
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoucherGenerationModal;