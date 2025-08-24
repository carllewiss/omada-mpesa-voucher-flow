
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Wifi, RefreshCw, Ticket } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import VoucherCard, { VoucherData } from "./VoucherCard";

interface AuthorizationStatusProps {
  data: {
    transactionId: string;
    authorizationData: any;
    expiryTime: Date;
    voucherData?: VoucherData;
  };
}

const AuthorizationStatus = ({ data }: AuthorizationStatusProps) => {
  const [timeRemaining, setTimeRemaining] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const expiry = new Date(data.expiryTime);
      const diff = expiry.getTime() - now.getTime();

      if (diff <= 0) {
        setIsExpired(true);
        setTimeRemaining("Expired");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [data.expiryTime]);

  useEffect(() => {
    // Check internet connectivity
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/connectivity-check', { 
          method: 'GET',
          cache: 'no-cache' 
        });
        setIsConnected(response.ok);
      } catch (error) {
        setIsConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const handleRefreshConnection = async () => {
    try {
      // Attempt to refresh the authorization
      const response = await fetch('/api/omada/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: data.transactionId,
        }),
      });

      if (response.ok) {
        toast({
          title: "Connection Refreshed",
          description: "Your internet connection has been refreshed.",
        });
        setIsConnected(true);
      } else {
        throw new Error('Refresh failed');
      }
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Unable to refresh connection. Please contact support.",
        variant: "destructive",
      });
    }
  };

  const handleNewPayment = () => {
    window.location.reload();
  };

  // If we have voucher data, show the voucher card display
  if (data.voucherData) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center">
            <Ticket className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-green-700 mb-2">Voucher Generated!</h2>
          <p className="text-gray-600">
            Your payment was successful and your voucher has been automatically generated.
          </p>
        </div>
        
        <VoucherCard voucher={data.voucherData} showActions={true} />
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">Quick Setup Guide:</h3>
          <ol className="text-sm text-blue-700 space-y-1">
            <li>1. Connect to the Wi-Fi network</li>
            <li>2. Open any website in your browser</li>
            <li>3. Use the login credentials above</li>
            <li>4. Start browsing immediately!</li>
          </ol>
        </div>
        
        <div className="text-center">
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="border-blue-200 hover:bg-blue-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            New Session
          </Button>
        </div>
      </div>
    );
  }

  // Legacy display for non-voucher data
  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Status Card */}
      <Card className="bg-white/90 backdrop-blur-sm border-green-200 shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl text-green-600">
            {isExpired ? "Session Expired" : "Connected!"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isExpired ? (
            <>
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-800">Time Remaining</span>
                  <span className="text-xl font-bold text-green-600">{timeRemaining}</span>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <Clock className="h-4 w-4" />
                    <span>24-Hour Package</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Wifi className="h-4 w-4" />
                    <span className={isConnected ? "text-green-600" : "text-red-600"}>
                      {isConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Transaction ID:</span>
                  <span className="font-mono text-xs">{data.transactionId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="text-green-600 font-semibold">Active</span>
                </div>
              </div>

              {!isConnected && (
                <Button
                  onClick={handleRefreshConnection}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Connection
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="bg-gradient-to-r from-orange-50 to-red-50 p-4 rounded-lg border border-orange-200">
                <p className="text-orange-800 text-center">
                  Your 24-hour internet package has expired.
                </p>
              </div>
              
              <Button
                onClick={handleNewPayment}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
              >
                Purchase New Package
              </Button>
            </>
          )}
        </CardContent>
        </Card>

        {/* Usage Tips */}
        {!isExpired && (
          <Card className="bg-white/90 backdrop-blur-sm border-blue-200">
            <CardHeader>
              <CardTitle className="text-center text-lg text-gray-800">Usage Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Keep this page open to monitor your remaining time</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Your session will automatically expire after 24 hours</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p>If you lose connection, use the refresh button above</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
};

export default AuthorizationStatus;
