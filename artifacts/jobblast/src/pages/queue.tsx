import { useState, useCallback, useRef, useEffect } from "react";
import { useGetQueue, useSkipJob, getGetQueueQueryKey, useRefreshJobs } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Briefcase, MapPin, Building, ChevronRight, RefreshCw, X, ListTodo } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function QueuePage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: queue = [], isLoading } = useGetQueue({ limit: 50 }, {
    query: {
      queryKey: getGetQueueQueryKey({ limit: 50 })
    }
  });

  const skipJob = useSkipJob();
  const refreshJobs = useRefreshJobs();
  
  const handleSkip = useCallback((jobId: number) => {
    skipJob.mutate({ jobId }, {
      onSuccess: () => {
        // Optimistic update
        queryClient.setQueryData(getGetQueueQueryKey({ limit: 50 }), (old: any) => {
          if (!old) return old;
          return old.filter((item: any) => item.job.id !== jobId);
        });
        toast.success("Job skipped.");
        // Keep selection index the same unless we're at the end
      }
    });
  }, [skipJob, queryClient]);

  const handleApprove = useCallback((jobId: number) => {
    setLocation(`/jobs/${jobId}`);
  }, [setLocation]);

  const handleRefresh = useCallback(() => {
    refreshJobs.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(`Refreshed ${res.sources} sources. Fetched ${res.fetched} new jobs.`);
        queryClient.invalidateQueries({ queryKey: getGetQueueQueryKey({ limit: 50 }) });
      },
      onError: () => {
        toast.error("Failed to refresh jobs.");
      }
    });
  }, [refreshJobs, queryClient]);

  // Keyboard navigation
  useEffect(() => {
    if (!queue.length) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, queue.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        if (queue[selectedIndex]) {
          handleSkip(queue[selectedIndex].job.id);
        }
      } else if (e.key === "a" || e.key === "A" || e.key === "Enter") {
        e.preventDefault();
        if (queue[selectedIndex]) {
          handleApprove(queue[selectedIndex].job.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [queue, selectedIndex, handleSkip, handleApprove]);

  // Scroll to selected item
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-6">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
          <ListTodo className="w-10 h-10 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">Queue Empty</h2>
          <p className="text-muted-foreground mb-6">
            You've cleared your queue for now. Refresh jobs to pull from connected sources and run the matching engine.
          </p>
          <Button size="lg" onClick={handleRefresh} disabled={refreshJobs.isPending}>
            {refreshJobs.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <RefreshCw className="w-5 h-5 mr-2" />}
            Refresh Jobs
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[100dvh]">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs font-mono">A</kbd> Approve &amp; Open
            <span className="mx-2 opacity-30">|</span>
            <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs font-mono">S</kbd> Skip
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshJobs.isPending}>
          {refreshJobs.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-24">
        {queue.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const scoreColor = 
            item.relevanceScore > 0.8 ? "text-green-600 bg-green-100 border-green-200" :
            item.relevanceScore > 0.5 ? "text-yellow-600 bg-yellow-100 border-yellow-200" :
            "text-red-600 bg-red-100 border-red-200";

          return (
            <Card 
              key={item.job.id} 
              ref={isSelected ? selectedRef : null}
              className={`transition-all cursor-pointer border-2 ${
                isSelected ? "border-primary shadow-md ring-2 ring-primary/20" : "border-border hover:border-primary/50"
              }`}
              onClick={() => {
                setSelectedIndex(idx);
                // Double click behavior can be emulated, but let's just make clicking select,
                // and a specific button approve. Or click = open. Let's make click select, dblclick open.
              }}
              onDoubleClick={() => handleApprove(item.job.id)}
            >
              <CardContent className="p-0 flex flex-col md:flex-row">
                <div className="flex-1 p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-foreground tracking-tight mb-1">{item.job.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground font-medium">
                        <span className="flex items-center gap-1 text-foreground"><Building className="w-4 h-4" /> {item.job.company}</span>
                        {item.job.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {item.job.location}</span>}
                        {item.job.salaryMin && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-4 h-4" /> 
                            ${(item.job.salaryMin/1000).toFixed(0)}k - ${(item.job.salaryMax!/1000).toFixed(0)}k
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`px-2 py-1 font-mono text-sm ${scoreColor}`}>
                      {(item.relevanceScore * 100).toFixed(0)}% Match
                    </Badge>
                  </div>
                  
                  {item.reasons && item.reasons.length > 0 && (
                    <div className="bg-muted/50 p-3 rounded text-sm space-y-1">
                      <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
                        <Zap className="w-3 h-3" /> Match Reasons
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-foreground/80">
                        {item.reasons.slice(0, 3).map((reason, rIdx) => (
                          <li key={rIdx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                <div className={`flex flex-row md:flex-col border-t md:border-t-0 md:border-l border-border bg-muted/20 w-full md:w-32 shrink-0 ${isSelected ? 'bg-primary/5' : ''}`}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleApprove(item.job.id); }}
                    className="flex-1 flex flex-col items-center justify-center p-4 hover:bg-primary hover:text-primary-foreground transition-colors group"
                  >
                    <ChevronRight className="w-8 h-8 text-primary group-hover:text-primary-foreground mb-1" />
                    <span className="text-xs font-bold uppercase tracking-widest">Approve</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSkip(item.job.id); }}
                    className="flex-1 flex flex-col items-center justify-center p-4 hover:bg-destructive hover:text-destructive-foreground transition-colors group border-l md:border-l-0 md:border-t border-border"
                  >
                    <X className="w-6 h-6 text-muted-foreground group-hover:text-destructive-foreground mb-1" />
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-hover:text-destructive-foreground">Skip</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}