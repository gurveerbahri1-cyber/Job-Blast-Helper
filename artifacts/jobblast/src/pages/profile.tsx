import { useState, useEffect, useRef } from "react";
import { useGetProfile, useUpsertProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Loader2, Save, User, FileText, Settings, X, Plus } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetProfile({
    query: {
      queryKey: getGetProfileQueryKey()
    }
  });
  
  const upsertProfile = useUpsertProfile();

  const [masterResume, setMasterResume] = useState("");
  const [dailyGoal, setDailyGoal] = useState([50]);
  const [followUpDays, setFollowUpDays] = useState("7");
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetRoleInput, setTargetRoleInput] = useState("");
  const [excludedCompanies, setExcludedCompanies] = useState<string[]>([]);
  const [excludedCompanyInput, setExcludedCompanyInput] = useState("");
  
  const initialized = useRef(false);

  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true;
      setMasterResume(profile.masterResume || "");
      setDailyGoal([profile.dailyGoal || 50]);
      setFollowUpDays(profile.followUpDays?.toString() || "7");
      
      try {
        setTargetRoles(profile.targetRoles ? JSON.parse(profile.targetRoles) : []);
      } catch (e) { setTargetRoles([]); }
      
      try {
        setExcludedCompanies(profile.excludedCompanies ? JSON.parse(profile.excludedCompanies) : []);
      } catch (e) { setExcludedCompanies([]); }
    }
  }, [profile]);

  const handleSave = () => {
    upsertProfile.mutate({
      data: {
        masterResume,
        dailyGoal: dailyGoal[0],
        followUpDays: parseInt(followUpDays) || 7,
        targetRoles: JSON.stringify(targetRoles),
        excludedCompanies: JSON.stringify(excludedCompanies),
      }
    }, {
      onSuccess: (data) => {
        toast.success("Profile saved successfully");
        queryClient.setQueryData(getGetProfileQueryKey(), data);
      },
      onError: () => {
        toast.error("Failed to save profile");
      }
    });
  };

  const addTag = (val: string, setArr: React.Dispatch<React.SetStateAction<string[]>>, setInput: React.Dispatch<React.SetStateAction<string>>) => {
    const trimmed = val.trim();
    if (trimmed) {
      setArr(prev => {
        if (!prev.includes(trimmed)) return [...prev, trimmed];
        return prev;
      });
      setInput("");
    }
  };

  const removeTag = (val: string, setArr: React.Dispatch<React.SetStateAction<string[]>>) => {
    setArr(prev => prev.filter(t => t !== val));
  };

  if (isLoading && !initialized.current) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Setup &amp; Preferences</h1>
          <p className="text-muted-foreground">Configure your AI tailoring baseline and queue preferences.</p>
        </div>
        <Button onClick={handleSave} disabled={upsertProfile.isPending} size="lg" className="shadow-md">
          {upsertProfile.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
          Save Configuration
        </Button>
      </div>

      <div className="grid gap-8">
        <Card className="shadow-sm">
          <CardHeader className="bg-muted/30 border-b pb-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Master Resume
            </CardTitle>
            <CardDescription>
              Paste your entire full-length resume here. The AI will extract relevant bullets from this source when tailoring.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Textarea 
              value={masterResume}
              onChange={(e) => setMasterResume(e.target.value)}
              placeholder="EXPERIENCE&#10;Software Engineer at TechCorp...&#10;&#10;EDUCATION&#10;BS in Computer Science..."
              className="min-h-[400px] font-mono text-sm leading-relaxed p-4"
            />
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" /> System Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-bold">Daily Application Goal</Label>
                  <span className="text-xl font-black text-primary">{dailyGoal[0]}</span>
                </div>
                <Slider 
                  value={dailyGoal} 
                  onValueChange={setDailyGoal} 
                  max={100} 
                  min={5} 
                  step={5} 
                />
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Controls the dashboard progress bar</p>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label htmlFor="followup" className="text-base font-bold">Default Follow-up (Days)</Label>
                <div className="flex items-center gap-3">
                  <Input 
                    id="followup"
                    type="number" 
                    value={followUpDays} 
                    onChange={(e) => setFollowUpDays(e.target.value)} 
                    className="w-24 text-center font-bold text-lg"
                  />
                  <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Days after applying</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" /> Matching Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Target Roles</Label>
                <div className="flex gap-2">
                  <Input 
                    value={targetRoleInput} 
                    onChange={(e) => setTargetRoleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(targetRoleInput, setTargetRoles, setTargetRoleInput);
                      }
                    }}
                    placeholder="e.g. Frontend Engineer" 
                  />
                  <Button type="button" variant="secondary" onClick={() => addTag(targetRoleInput, setTargetRoles, setTargetRoleInput)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {targetRoles.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded text-sm font-medium">
                      {tag}
                      <button onClick={() => removeTag(tag, setTargetRoles)} className="hover:text-primary-foreground hover:bg-primary rounded-full p-0.5 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Excluded Companies</Label>
                <div className="flex gap-2">
                  <Input 
                    value={excludedCompanyInput} 
                    onChange={(e) => setExcludedCompanyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(excludedCompanyInput, setExcludedCompanies, setExcludedCompanyInput);
                      }
                    }}
                    placeholder="e.g. Acme Corp" 
                  />
                  <Button type="button" variant="secondary" onClick={() => addTag(excludedCompanyInput, setExcludedCompanies, setExcludedCompanyInput)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {excludedCompanies.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 bg-destructive/10 text-destructive border border-destructive/20 px-2 py-1 rounded text-sm font-medium">
                      {tag}
                      <button onClick={() => removeTag(tag, setExcludedCompanies)} className="hover:text-destructive-foreground hover:bg-destructive rounded-full p-0.5 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}