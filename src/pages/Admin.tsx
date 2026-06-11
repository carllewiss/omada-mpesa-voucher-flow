import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { sendVoucherSms, SMS_TEMPLATE } from "@/lib/sim2Sms";
import { Capacitor } from "@capacitor/core";

type Txn = {
  id: string;
  phone_number: string;
  amount: number;
  package_type: string;
  status: string;
  mpesa_receipt: string | null;
  voucher_code: string | null;
  created_at: string;
  updated_at: string;
};

const PKG_HOURS: Record<string, number> = { "2hour": 2, "24hour": 24 };

export default function Admin() {
  const [rows, setRows] = useState<Txn[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("smsSent") || "[]")); } catch { return new Set(); }
  });
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const persistSent = (s: Set<string>) => {
    setSentIds(new Set(s));
    localStorage.setItem("smsSent", JSON.stringify([...s]));
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setRows((data as Txn[]) || []);
    setLoading(false);
  };

  const trySendSms = async (t: Txn) => {
    if (!t.voucher_code || !t.phone_number) return;
    if (sentIds.has(t.id)) return;
    const hours = PKG_HOURS[t.package_type] ?? 2;
    const msg = SMS_TEMPLATE(t.voucher_code, hours);
    const ok = await sendVoucherSms(t.phone_number, msg);
    if (ok) {
      const next = new Set(sentIds); next.add(t.id); persistSent(next);
      toast.success(`SMS sent to ${t.phone_number}`);
    } else if (Capacitor.isNativePlatform()) {
      toast.error(`SMS failed for ${t.phone_number}`);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, (payload) => {
        const n = payload.new as Txn;
        setRows((prev) => {
          const i = prev.findIndex((r) => r.id === n.id);
          if (i === -1) return [n, ...prev].slice(0, 200);
          const cp = [...prev]; cp[i] = { ...cp[i], ...n }; return cp;
        });
        if ((n.status === "success" || n.status === "paid") && n.voucher_code) {
          trySendSms(n);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) =>
      r.phone_number?.toLowerCase().includes(q) ||
      r.voucher_code?.toLowerCase().includes(q) ||
      r.mpesa_receipt?.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.status === "success" || r.status === "paid");
    return {
      paidCount: paid.length,
      sum: paid.reduce((a, b) => a + Number(b.amount || 0), 0),
      pending: rows.filter((r) => r.status === "pending").length,
    };
  }, [rows]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">4K SMART — Admin</h1>
          <Badge variant={Capacitor.isNativePlatform() ? "default" : "secondary"}>
            {Capacitor.isNativePlatform() ? "Native (SIM 2 SMS active)" : "Web preview (SMS disabled)"}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Paid</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.paidCount}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Revenue (KSh)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.sum}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pending</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.pending}</CardContent></Card>
        </div>

        <div className="flex gap-2">
          <Input placeholder="Search phone, voucher or receipt…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Button variant="outline" onClick={load}>Refresh</Button>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Pkg</TableHead>
                  <TableHead>KSh</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SMS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No transactions</TableCell></TableRow>
                ) : filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(t.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</TableCell>
                    <TableCell className="font-mono text-xs">{t.phone_number}</TableCell>
                    <TableCell>{t.package_type}</TableCell>
                    <TableCell>{t.amount}</TableCell>
                    <TableCell className="font-mono text-xs">{t.mpesa_receipt || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{t.voucher_code || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "success" || t.status === "paid" ? "default" : t.status === "pending" ? "secondary" : "destructive"}>{t.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {sentIds.has(t.id) ? (
                        <Badge variant="default">Sent</Badge>
                      ) : t.voucher_code && (t.status === "success" || t.status === "paid") ? (
                        <Button size="sm" variant="outline" onClick={() => trySendSms(t)}>Send</Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          SMS sends automatically from SIM 2 (slot index 1) on this phone when a new paid transaction with a voucher arrives. Tap “Send” to resend manually.
        </p>
      </div>
    </div>
  );
}