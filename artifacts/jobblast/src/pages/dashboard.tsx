import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useGetDashboardStats, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { Loader2, Flame, Target, ListTodo, History } from "lucide-react";
import { format } from "date-fns";

// Recharts for the Funnel & Bar
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

export default function DashboardPage() {
  const { data: stats, isLoading } = useGetDashboardStats({
    query: {
      queryKey: getGetDashboardStatsQueryKey(),
      refetchInterval: 10000,
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No dashboard data available.</p>
      </div>
    );
  }

  const goalProgress = Math.min((stats.todayCount / stats.dailyGoal) * 100, 100);
  const isGoalMet = stats.todayCount >= stats.dailyGoal;

  const funnelData = [
    { name: "Applied", value: stats.funnel.applied },
    { name: "Responded", value: stats.funnel.responded },
    { name: "Interview", value: stats.funnel.interview },
    { name: "Offer", value: stats.funnel.offer },
  ];

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground">Stay focused. Hit your numbers.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-card border rounded p-3 shadow-sm">
          <div className="flex items-center justify-center w-10 h-10 rounded bg-orange-100 text-orange-600">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Current Streak</div>
            <div className="text-xl font-bold">{stats.streak} days</div>
          </div>
        </div>
      </div>

      {/* Primary Goal Tracker */}
      <Card className="border-primary/20 shadow-md">
        <CardContent className="p-6">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-1">Today's Goal</div>
              <div className="text-4xl font-black">
                {stats.todayCount} <span className="text-xl text-muted-foreground font-medium">/ {stats.dailyGoal} apps</span>
              </div>
            </div>
            {isGoalMet && (
              <div className="px-3 py-1 bg-green-100 text-green-700 text-sm font-bold uppercase rounded tracking-wider">
                Goal Met
              </div>
            )}
          </div>
          <Progress value={goalProgress} className="h-4" indicatorClassName={isGoalMet ? "bg-green-500" : "bg-primary"} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Applied</CardTitle>
            <History className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalApplications}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Queue Size</CardTitle>
            <ListTodo className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.queueSize || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Ready for review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Follow-ups Due</CardTitle>
            <Target className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.followUpsDue || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Need your attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Interview Rate</CardTitle>
            <Flame className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.funnel.applied > 0 
                ? Math.round((stats.funnel.interview / stats.funnel.applied) * 100) 
                : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 flex-1 min-h-0">
        <Card className="flex flex-col min-h-0">
          <CardHeader>
            <CardTitle>Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 pb-4 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => format(new Date(val), 'MMM d')}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  contentStyle={{ borderRadius: '0.25rem', border: '1px solid hsl(var(--border))' }}
                />
                <Bar 
                  dataKey="count" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-0">
          <CardHeader>
            <CardTitle>Pipeline Conversion</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 pb-4 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={funnelData} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 13, fontWeight: 500 }}
                  width={80}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '0.25rem', border: '1px solid hsl(var(--border))' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="hsl(var(--chart-2))" 
                  fill="hsl(var(--chart-2))" 
                  fillOpacity={0.3} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}