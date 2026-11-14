import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect, Link } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AlertCircle, KeyRound, ExternalLink } from 'lucide-react';

// Pages
import NotFound from '@/pages/not-found';
import LandingPage from './pages/landing';
import DashboardPage from './pages/dashboard';
import QueuePage from './pages/queue';
import JobsDetailPage from './pages/job-detail';
import ApplicationsPage from './pages/applications';
import ApplicationDetailPage from './pages/application-detail';
import ProfilePage from './pages/profile';

// Layout
import { Shell } from './components/layout/shell';

// Clerk Configuration Check
const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const hasValidClerkKey = Boolean(
  rawClerkKey && (rawClerkKey.startsWith("pk_test_") || rawClerkKey.startsWith("pk_live_"))
);

const clerkPubKey = hasValidClerkKey
  ? publishableKeyFromHost(window.location.hostname, rawClerkKey)
  : null;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(15, 85%, 55%)",
    colorForeground: "hsl(20, 15%, 12%)",
    colorMutedForeground: "hsl(20, 5%, 45%)",
    colorDanger: "hsl(0, 84%, 50%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(40, 10%, 85%)",
    colorInputForeground: "hsl(20, 15%, 12%)",
    colorNeutral: "hsl(40, 10%, 88%)",
    fontFamily: "'Bricolage Grotesque', sans-serif",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded border border-border w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-semibold tracking-tight",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-green-600",
    alertText: "text-foreground",
  },
};

function ClerkSetupNotice() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="max-w-md w-full bg-card border rounded-lg p-6 shadow-lg space-y-5">
        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500">
          <KeyRound className="w-6 h-6 shrink-0" />
          <h2 className="text-xl font-bold tracking-tight text-foreground">Clerk Setup Required</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Authentication is powered by Clerk. To sign in or access protected routes locally, you need a Clerk publishable key.
        </p>
        <div className="bg-muted/70 rounded p-4 text-xs font-mono space-y-2 border">
          <p className="text-muted-foreground"># Add to artifacts/jobblast/.env.local:</p>
          <p className="text-primary font-semibold select-all">VITE_CLERK_PUBLISHABLE_KEY=pk_test_...</p>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Quick Setup:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Go to <a href="https://dashboard.clerk.com" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">Clerk Dashboard <ExternalLink className="w-3 h-3" /></a></li>
            <li>Create or select an application</li>
            <li>Copy your <strong>Publishable Key</strong> (starts with <code className="bg-muted px-1 rounded">pk_test_</code>)</li>
            <li>Restart Vite dev server</li>
          </ol>
        </div>
        <div className="pt-2 flex justify-between items-center border-t">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back to Landing Page
          </Link>
          <a
            href="https://dashboard.clerk.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 transition-colors inline-flex items-center gap-1"
          >
            Open Clerk <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function LocalDevBanner() {
  if (hasValidClerkKey) return null;
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs px-4 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          <strong>Local Dev Mode:</strong> Clerk Publishable Key is not configured. Set <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> in <code className="font-mono">.env.local</code> to enable full authentication.
        </span>
      </div>
      <Link href="/sign-in" className="underline whitespace-nowrap hover:text-amber-950 dark:hover:text-amber-100 font-medium">
        Setup Instructions &rarr;
      </Link>
    </div>
  );
}

function SignInPage() {
  if (!hasValidClerkKey) return <ClerkSetupNotice />;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  if (!hasValidClerkKey) return <ClerkSetupNotice />;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  if (!hasValidClerkKey) {
    return <LandingPage />;
  }
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: any }) {
  if (!hasValidClerkKey) {
    return <ClerkSetupNotice />;
  }
  return (
    <>
      <Show when="signed-in">
        <Shell>
          <Component />
        </Shell>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  return (
    <>
      <LocalDevBanner />
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        
        <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
        <Route path="/queue"><ProtectedRoute component={QueuePage} /></Route>
        <Route path="/jobs/:id"><ProtectedRoute component={JobsDetailPage} /></Route>
        <Route path="/applications"><ProtectedRoute component={ApplicationsPage} /></Route>
        <Route path="/applications/:id"><ProtectedRoute component={ApplicationDetailPage} /></Route>
        <Route path="/profile"><ProtectedRoute component={ProfilePage} /></Route>
        
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </>
  );
}

function Router() {
  const [, setLocation] = useLocation();

  if (hasValidClerkKey && clerkPubKey) {
    return (
      <ClerkProvider
        publishableKey={clerkPubKey}
        proxyUrl={clerkProxyUrl}
        appearance={clerkAppearance}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        routerPush={(to) => setLocation(stripBase(to))}
        routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      >
        <QueryClientProvider client={queryClient}>
          <ClerkQueryClientCacheInvalidator />
          <TooltipProvider delayDuration={0}>
            <AppRoutes />
          </TooltipProvider>
        </QueryClientProvider>
      </ClerkProvider>
    );
  }

  // Graceful fallback when Clerk is not configured locally
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <AppRoutes />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <Router />
    </WouterRouter>
  );
}

export default App;
