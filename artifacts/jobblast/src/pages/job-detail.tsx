import { useState, useRef } from "react";
import { useGetJob, useTailorDocuments, useCreateApplication, getGetJobQueryKey, getGetQueueQueryKey } from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, Wand2, ExternalLink, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export default function JobsDetailPage() {
  const { id } = useParams();
  const jobId = Number(id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [tone, setTone] = useState<"professional" | "conversational" | "enthusiastic">("professional");
  const [tailorResult, setTailorResult] = useState<{ resumeBullets: string[], coverLetter: string } | null>(null);

  const { data: job, isLoading } = useGetJob(jobId, {
    query: {
      enabled: !!jobId,
      queryKey: getGetJobQueryKey(jobId)
    }
  });

  const tailorDocs = useTailorDocuments();
  const createApplication = useCreateApplication();

  const handleTailor = () => {
    tailorDocs.mutate({ data: { jobId, tone } }, {
      onSuccess: (res) => {
        setTailorResult(res);
        toast.success("Tailored documents generated!");
      },
      onError: (err: any) => {
        if (err?.status === 503 || err?.error?.includes("ANTHROPIC_API_KEY")) {
          toast.error("AI tailoring is not configured yet. Add your ANTHROPIC_API_KEY in settings.");
        } else {
          toast.error("Failed to generate documents.");
        }
      }
    });
  };

  const handleApproveAndOpen = () => {
    if (!job) return;

    createApplication.mutate({
      data: {
        jobListingId: job.id,
        status: "approved",
        resumeVersion: tailorResult?.resumeBullets.join("\n") || "",
        coverLetterVersion: tailorResult?.coverLetter || ""
      }
    }, {
      onSuccess: () => {
        // Remove from queue cache if it was there
        queryClient.invalidateQueries({ queryKey: getGetQueueQueryKey() });
        
        // Open URL in new tab
        window.open(job.url, "_blank");
        
        toast.success("Application created! Redirecting to job page...");
        setLocation("/queue");
      },
      onError: () => {
        toast.error("Failed to create application record.");
      }
    });
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${type} to clipboard`);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col h-full items-center justify-center space-y-4">
        <p className="text-muted-foreground">Job not found.</p>
        <Button variant="outline" onClick={() => setLocation("/queue")}>Back to Queue</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/queue")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight line-clamp-1">{job.title}</h1>
            <p className="text-muted-foreground text-sm font-medium">{job.company} • {job.location || "Remote"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleApproveAndOpen} disabled={createApplication.isPending} size="lg" className="shadow-md">
            {createApplication.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
            Approve &amp; Open URL
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Panel: Job Description */}
        <Card className="flex-1 flex flex-col min-h-0 bg-muted/10">
          <CardHeader className="py-3 px-4 bg-muted/30 border-b">
            <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center justify-between">
              Job Description
              <a href={job.url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 normal-case text-xs tracking-normal">
                Original Post <ExternalLink className="w-3 h-3" />
              </a>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full p-6">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-p:leading-relaxed">
                <ReactMarkdown>{job.description || "No description available."}</ReactMarkdown>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Panel: AI Tailoring */}
        <Card className="flex-[1.2] flex flex-col min-h-0 border-primary/20 shadow-sm relative overflow-hidden">
          {/* Subtle gradient background */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
          
          <CardHeader className="py-3 px-4 border-b bg-background/50 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-primary" /> AI Tailoring
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={tone} onValueChange={(v: any) => setTone(v)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs font-medium">
                    <SelectValue placeholder="Tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="conversational">Conversational</SelectItem>
                    <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" onClick={handleTailor} disabled={tailorDocs.isPending}>
                  {tailorDocs.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Generate"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden bg-background/50 backdrop-blur-sm">
            <ScrollArea className="h-full p-6">
              {!tailorResult && !tailorDocs.isPending && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-muted-foreground mt-20">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Wand2 className="w-8 h-8 text-primary/50" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Ready to tailor</p>
                    <p className="text-sm max-w-xs mt-1">Generate customized resume bullets and a cover letter based on this specific job description.</p>
                  </div>
                </div>
              )}

              {tailorDocs.isPending && (
                <div className="h-full flex flex-col items-center justify-center space-y-4 mt-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-medium animate-pulse text-muted-foreground">Analyzing requirements and crafting response...</p>
                </div>
              )}

              {tailorResult && (
                <div className="space-y-8 pb-8">
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-lg border-b-2 border-primary/30 pb-1">Tailored Resume Bullets</h3>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(tailorResult.resumeBullets.join("\n"), "bullets")}>
                        <Copy className="w-4 h-4 mr-1" /> Copy All
                      </Button>
                    </div>
                    <ul className="space-y-3">
                      {tailorResult.resumeBullets.map((bullet, idx) => (
                        <li key={idx} className="bg-card border p-3 rounded text-sm leading-relaxed shadow-sm relative group pl-8">
                          <div className="absolute left-3 top-3.5 w-1.5 h-1.5 rounded-full bg-primary" />
                          {bullet}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(bullet, "bullet")}
                          >
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-lg border-b-2 border-primary/30 pb-1">Cover Letter</h3>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(tailorResult.coverLetter, "cover letter")}>
                        <Copy className="w-4 h-4 mr-1" /> Copy
                      </Button>
                    </div>
                    <div className="bg-card border p-5 rounded text-sm leading-relaxed whitespace-pre-wrap font-serif shadow-sm">
                      {tailorResult.coverLetter}
                    </div>
                  </section>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}