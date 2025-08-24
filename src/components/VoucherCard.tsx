import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, Download, Ticket, Clock, Wifi, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface VoucherData {
  code: string;
  username: string;
  password: string;
  validity: string;
  generatedAt: string;
  expiresAt: string;
  packageType: string;
  transactionId: string;
  status: 'active' | 'expired' | 'used';
}

interface VoucherCardProps {
  voucher: VoucherData;
  showActions?: boolean;
}

const VoucherCard = ({ voucher, showActions = true }: VoucherCardProps) => {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const downloadVoucher = () => {
    const voucherText = `
=================================
4K SMART SOLUTIONS - Internet Voucher
=================================

Voucher Code: ${voucher.code}
Username: ${voucher.username}
Password: ${voucher.password}

Package: ${voucher.packageType}
Valid Until: ${new Date(voucher.expiresAt).toLocaleString()}
Generated: ${new Date(voucher.generatedAt).toLocaleString()}
Transaction ID: ${voucher.transactionId}

=================================
Thank you for choosing 4K Smart Solutions!
=================================
    `;

    const blob = new Blob([voucherText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voucher-${voucher.code}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Downloaded!",
      description: "Voucher details saved to your device",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'expired': return 'bg-red-100 text-red-800 border-red-200';
      case 'used': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-blue-50 to-green-50 border-2 border-blue-200 shadow-xl">
      <CardHeader className="text-center pb-4">
        <div className="flex items-center justify-center mb-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center mr-3">
            <Ticket className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-xl text-gray-800">Internet Voucher</CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Generated automatically after payment
            </CardDescription>
          </div>
        </div>
        <Badge className={`mx-auto ${getStatusColor(voucher.status)}`}>
          <CheckCircle className="h-3 w-3 mr-1" />
          {voucher.status.toUpperCase()}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Voucher Code */}
        <div className="bg-white/80 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Voucher Code</span>
            {showActions && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(voucher.code, "Voucher code")}
                className="h-6 w-6 p-0 hover:bg-blue-100"
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="text-lg font-mono font-bold text-blue-700 bg-blue-50 px-3 py-2 rounded border">
            {voucher.code}
          </div>
        </div>

        <Separator />

        {/* Login Credentials */}
        <div className="space-y-3">
          <h4 className="font-medium text-gray-800 flex items-center">
            <Wifi className="h-4 w-4 mr-2" />
            Wi-Fi Login Details
          </h4>
          
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-white/80 p-3 rounded border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Username</span>
                {showActions && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(voucher.username, "Username")}
                    className="h-5 w-5 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="font-mono text-sm text-gray-800">{voucher.username}</div>
            </div>

            <div className="bg-white/80 p-3 rounded border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Password</span>
                {showActions && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(voucher.password, "Password")}
                    className="h-5 w-5 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="font-mono text-sm text-gray-800">{voucher.password}</div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Package Details */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 p-3 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">{voucher.packageType}</p>
              <p className="text-xs text-gray-600 flex items-center mt-1">
                <Clock className="h-3 w-3 mr-1" />
                Valid until: {new Date(voucher.expiresAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Transaction Info */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Transaction ID: {voucher.transactionId}
          </p>
          <p className="text-xs text-gray-500">
            Generated: {new Date(voucher.generatedAt).toLocaleString()}
          </p>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={downloadVoucher}
              variant="outline"
              className="flex-1 border-blue-200 hover:bg-blue-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button
              onClick={() => copyToClipboard(
                `Code: ${voucher.code}\nUsername: ${voucher.username}\nPassword: ${voucher.password}`,
                "All voucher details"
              )}
              className="flex-1 bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy All
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VoucherCard;