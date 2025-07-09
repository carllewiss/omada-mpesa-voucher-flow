
import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Clock, Wifi } from "lucide-react";

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const [voucherData, setVoucherData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const transactionId = searchParams.get('transaction_id');
    const sessionId = searchParams.get('session_id');
    
    if (transactionId || sessionId) {
      fetchVoucherData(transactionId || sessionId);
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  const fetchVoucherData = async (id: string) => {
    try {
      // Fetch voucher details from your backend
      const response = await fetch(`/api/voucher/details/${id}`);
      if (response.ok) {
        const data = await response.json();
        setVoucherData(data);
      }
    } catch (error) {
      console.error('Error fetching voucher data:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadVoucher = () => {
    if (!voucherData) return;
    
    const voucherText = `
OMADA PORTAL - INTERNET ACCESS VOUCHER
=====================================
Username: ${voucherData.username}
Password: ${voucherData.password}
Duration: 24 Hours
Valid Until: ${new Date(voucherData.expiryTime).toLocaleString()}
Transaction: ${voucherData.transactionId}
=====================================
Keep this voucher safe for your records.
    `;
    
    const blob = new Blob([voucherText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omada-voucher-${voucherData.username}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your voucher details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-blue-100">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Wifi className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                Omada Portal
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card className="bg-white/90 backdrop-blur-sm border-green-200 shadow-xl">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl text-green-600">Payment Successful!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {voucherData ? (
                <>
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
                    <h3 className="font-semibold text-gray-800 mb-3">Your Internet Access Details</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Username:</span>
                        <span className="font-mono font-bold">{voucherData.username}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Password:</span>
                        <span className="font-mono font-bold">{voucherData.password}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Duration:</span>
                        <span className="font-semibold">24 Hours</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Expires:</span>
                        <span className="text-sm">
                          {new Date(voucherData.expiryTime).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Button
                      onClick={downloadVoucher}
                      variant="outline"
                      className="w-full"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Voucher
                    </Button>

                    <Link to="/">
                      <Button className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700">
                        Back to Portal
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center space-y-4">
                    <p className="text-gray-600">
                      Your payment has been processed successfully. You should now have internet access.
                    </p>
                    <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
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

                  <Link to="/">
                    <Button className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700">
                      Back to Portal
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default PaymentSuccess;
