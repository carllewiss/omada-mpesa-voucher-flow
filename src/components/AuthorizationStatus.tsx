
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Wifi, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AuthorizationStatusProps {
  data: {
    transactionId: string;
    authorizationData?: any;
    expiryTime: Date;
    packageType?: string;
    durationHours?: number;
    voucherData?: {
      package?: string;
      duration?: string;
      durationHours?: number;
    };
  };
}

const AuthorizationStatus = ({ data }: AuthorizationStatusProps) => {
  const [timeRemaining, setTimeRemaining] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const packageType = data.packageType || data.voucherData?.package || data.authorizationData?.package_type || "internet";
  const durationHours = data.durationHours || data.voucherData?.durationHours || Number.parseInt(data.voucherData?.duration || "", 10) || data.authorizationData?.duration_hours;
  const packageLabel = durationHours ? `${durationHours}-Hour Package` : packageType.replace(/hour$/i, "-Hour Package");

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
                      <span>{packageLabel}</span>
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
                  Your {packageLabel.toLowerCase()} has expired.
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
                  <p>Your session will automatically expire when the countdown reaches zero</p>
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
