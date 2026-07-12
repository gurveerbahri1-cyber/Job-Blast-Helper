import { useState, useEffect, useRef } from "react";
import { useGetApplication, useUpdateApplication, getGetApplicationQueryKey } from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Save, ExternalLink, Calendar, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string, color: string }> = {
  queued: { label: "Queued", color: "bg-gray-100 text-gray-700" },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700" },
  applied: { label: "Applied", color: "bg-purple-100 text-purple-700" },
  responded: { label: "Responded", color: "bg-yellow-100 text-yellow-700" },
  interview: { label: "Interview", color: "bg-orange-100 text-orange-700" },
  offer: { label: "Offer", color: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700" }
};

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const appId = Number(id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: app, isLoading } = useGetApplication(appId, {
    query: {
      enabled: !!appId,
      queryKey: getGetApplicationQueryKey(appId)
    }
  });

  const updateApp = useUpdateApplication();

  const initializedForId = useRef<number | null>(null);
  const lastSaved = useRef<{ notes: string, followUpDate: string }>({ notes: "", followUpDate: "" });

  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  // Init
  useEffect(() => {
    if (app && initializedForId.current !== appId) {
      initializedForId.current = appId;
      setNotes(app.notes || "");
      const formattedDate = app.followUpDate ? format(new Date(app.followUpDate), 'yyyy-MM-dd') : "";
      setFollowUpDate(formattedDate);
      lastSaved.current = { notes: app.notes || "", followUpDate: formattedDate };
    }
  }, [app, appId]);

  const handleSave = () => {
    updateApp.mutate({
      id: appId,
      data: {
        notes,
        followUpDate: followUpDate || null
      }
    }, {
      onSuccess: (data) => {
        lastSaved.current = { notes: data.notes || "", followUpDate: data.followUpDate ? format(new Date(data.followUpDate), 'yyyy-MM-dd') : "" };
        toast.success("Changes saved");
        queryClient.setQueryData(getGetApplicationQueryKey(appId), (old: any) => 
          old ? { ...old, notes: data.notes, followUpDate: data.followUpDate } : old
        );
      }
    });
  };

  const handleStatusChange = (newStatus: any) => {
    updateApp.mutate({
      id: appId,
      data: { status: newStatus }
    }, {
      onSuccess: (data) => {
        toast.success(`Status updated to ${statusConfig[newStatus]?.label}`);
        queryClient.setQueryData(getGetApplicationQueryKey(appId), (old: any) => 
          old ? { ...old, status: data.status } : old
        );
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex flex-col h-full items-center justify-center space-y-4">
        <p className="text-muted-foreground">Application not found.</p>
        <Button variant="outline" onClick={() => setLocation("/applications")}>Back to Applications</Button>
      </div>
    );
  }

  const isDirty = notes !== lastSaved.current.notes || followUpDate !== lastSaved.current.followUpDate;

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/applications")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight line-clamp-1">{app.job?.company}</h1>
            <p className="text-muted-foreground text-lg font-medium">{app.job?.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={app.status} onValueChange={handleStatusChange}>
            <SelectTrigger className={`w-[160px] h-10 font-bold uppercase tracking-wider border-2 ${statusConfig[app.status]?.color || ''}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusConfig).map(([val, conf]) => (
                <SelectItem key={val} value={val} className="font-bold uppercase tracking-wider">{conf.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader className="bg-muted/30 border-b pb-4">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Notes &amp; Follow-up</span>
              {isDirty ? (
                <Button size="sm" onClick={handleSave} disabled={updateApp.isPending}>
                  {updateApp.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              ) : (
                <div className="flex items-center gap-1 text-sm text-green-600 font-medium px-2">
                  <CheckCircle2 className="w-4 h-4" /> Saved
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="followup" className="text-muted-foreground uppercase tracking-wider text-xs font-bold">Follow-up Date</Label>
              <Input 
                id="followup" 
                type="date" 
                value={followUpDate} 
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full sm:w-[200px]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-muted-foreground uppercase tracking-wider text-xs font-bold">Interview Notes / Comments</Label>
              <Textarea 
                id="notes" 
                placeholder="Met with hiring manager on Tuesday. They mentioned looking for React + Go experience..." 
                className="min-h-[250px] resize-y font-mono text-sm leading-relaxed p-4"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1">Applied On</div>
                <div className="font-medium">{app.appliedAt ? format(new Date(app.appliedAt), 'MMMM d, yyyy') : 'Not marked applied'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1">Last Updated</div>
                <div className="font-medium text-muted-foreground">{format(new Date(app.updatedAt), 'MMMM d, yyyy HH:mm')}</div>
              </div>
              {app.job?.url && (
                <div className="pt-2 border-t">
                  <a href={app.job.url} target="_blank" rel="noreferrer" className="flex items-center text-sm font-medium text-primary hover:underline">
                    View Original Posting <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <CardTitle className="text-base">Document Versions</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Resume Bullets Used</div>
                {app.resumeVersion ? (
                  <div className="bg-muted/50 p-3 rounded font-mono text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {app.resumeVersion}
                  </div>
                ) : (
                  <div className="text-muted-foreground italic">No specific bullets saved.</div>
                )}
              </div>
              
              <div>
                <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Cover Letter Used</div>
                {app.coverLetterVersion ? (
                  <div className="bg-muted/50 p-3 rounded font-serif text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {app.coverLetterVersion}
                  </div>
                ) : (
                  <div className="text-muted-foreground italic">No cover letter saved.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}