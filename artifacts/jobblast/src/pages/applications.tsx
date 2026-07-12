import { useState } from "react";
import { useListApplications, useUpdateApplication, getListApplicationsQueryKey, useExportApplications, getExportApplicationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Search, Download, ChevronRight, Briefcase } from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string, color: string }> = {
  queued: { label: "Queued", color: "bg-gray-100 text-gray-700 border-gray-200" },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700 border-blue-200" },
  applied: { label: "Applied", color: "bg-purple-100 text-purple-700 border-purple-200" },
  responded: { label: "Responded", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  interview: { label: "Interview", color: "bg-orange-100 text-orange-700 border-orange-200" },
  offer: { label: "Offer", color: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200" }
};

export default function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data: pageData, isLoading } = useListApplications({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
    page
  }, {
    query: {
      queryKey: getListApplicationsQueryKey({ status: statusFilter === "all" ? undefined : statusFilter, limit: 50, page })
    }
  });

  const updateApp = useUpdateApplication();
  const exportApps = useExportApplications({ query: { enabled: false, queryKey: getExportApplicationsQueryKey() } });

  const handleStatusChange = (id: number, newStatus: any) => {
    updateApp.mutate({ id, data: { status: newStatus } }, {
      onSuccess: () => {
        toast.success("Status updated");
        queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
      }
    });
  };

  const handleExport = async () => {
    try {
      const result = await exportApps.refetch();
      const data = result.data;

      if (!Array.isArray(data) || data.length === 0) {
        toast.info("No applications to export");
        return;
      }

      const headers = ["Company", "Job Title", "Location", "Status", "Applied At", "Follow Up Date"];
      const rows = data.map((app) => [
        `"${app.job?.company || ''}"`,
        `"${app.job?.title || ''}"`,
        `"${app.job?.location || ''}"`,
        `"${app.status}"`,
        app.appliedAt ? `"${format(new Date(app.appliedAt), 'yyyy-MM-dd')}"` : '""',
        app.followUpDate ? `"${format(new Date(app.followUpDate), 'yyyy-MM-dd')}"` : '""',
      ].join(","));

      const csvContent = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `jobblast_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Export downloaded!");
    } catch {
      toast.error("Failed to export applications");
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
          <p className="text-muted-foreground">Track your pipeline and update statuses.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(statusConfig).map(([val, conf]) => (
                <SelectItem key={val} value={val}>{conf.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={handleExport} disabled={exportApps.isPending}>
            {exportApps.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col border shadow-sm overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[300px]">Company &amp; Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied Date</TableHead>
                <TableHead>Follow Up</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                  </TableCell>
                </TableRow>
              ) : pageData?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Briefcase className="w-8 h-8 mb-2 opacity-50" />
                      <p>No applications found.</p>
                      {statusFilter !== "all" && (
                        <Button variant="link" onClick={() => setStatusFilter("all")} className="mt-2">Clear filters</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageData?.items.map((app) => (
                  <TableRow key={app.id} className="group hover:bg-muted/20">
                    <TableCell>
                      <div className="font-semibold text-foreground">{app.job?.company || "Unknown Company"}</div>
                      <div className="text-sm text-muted-foreground truncate max-w-[280px]">{app.job?.title}</div>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={app.status} 
                        onValueChange={(val) => handleStatusChange(app.id, val)}
                        disabled={updateApp.isPending && updateApp.variables?.id === app.id}
                      >
                        <SelectTrigger className={`w-[130px] h-8 text-xs font-semibold uppercase tracking-wider ${statusConfig[app.status]?.color || ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statusConfig).map(([val, conf]) => (
                            <SelectItem key={val} value={val} className="text-xs font-medium uppercase tracking-wider">{conf.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm">
                      {app.appliedAt ? format(new Date(app.appliedAt), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      {app.followUpDate ? (
                        <div className={`text-sm font-medium ${new Date(app.followUpDate) <= new Date() ? 'text-orange-600' : 'text-muted-foreground'}`}>
                          {format(new Date(app.followUpDate), 'MMM d, yyyy')}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/applications/${app.id}`}>
                          Details <ChevronRight className="w-4 h-4 ml-1" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}