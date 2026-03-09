"use client";

import { useState, useCallback } from "react";
import {
  PlusIcon,
  Trash2Icon,
  GripVerticalIcon,
  ArrowRightIcon,
  BarChart3Icon,
  GitBranchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  FunnelChart,
  SankeyFlow,
  type FunnelStep,
  type SankeyNode,
  type SankeyLink,
} from "@/components/heatmap/funnel-chart";
import { useWorkspace } from "@/hooks/use-workspace";
// import { trpc } from "@/lib/trpc/client";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const DEFAULT_FUNNEL_STEPS: FunnelStep[] = [
  { label: "/", count: 5200 },
  { label: "/pricing", count: 3100 },
  { label: "/signup", count: 1450 },
  { label: "/onboarding", count: 890 },
  { label: "/dashboard", count: 620 },
];

const MOCK_SANKEY_NODES: SankeyNode[] = [
  { id: "home", label: "Homepage", count: 5200 },
  { id: "pricing", label: "Pricing", count: 3100 },
  { id: "features", label: "Features", count: 2800 },
  { id: "blog", label: "Blog", count: 1900 },
  { id: "signup", label: "Sign Up", count: 1450 },
  { id: "demo", label: "Book Demo", count: 680 },
  { id: "onboarding", label: "Onboarding", count: 890 },
  { id: "exit", label: "Exit", count: 2100 },
];

const MOCK_SANKEY_LINKS: SankeyLink[] = [
  { source: "home", target: "pricing", value: 2200 },
  { source: "home", target: "features", value: 1800 },
  { source: "home", target: "blog", value: 900 },
  { source: "home", target: "exit", value: 300 },
  { source: "pricing", target: "signup", value: 1200 },
  { source: "pricing", target: "demo", value: 500 },
  { source: "pricing", target: "exit", value: 1400 },
  { source: "features", target: "pricing", value: 900 },
  { source: "features", target: "signup", value: 250 },
  { source: "features", target: "exit", value: 400 },
  { source: "blog", target: "features", value: 1000 },
  { source: "blog", target: "exit", value: 900 },
  { source: "signup", target: "onboarding", value: 890 },
  { source: "signup", target: "exit", value: 560 },
  { source: "demo", target: "signup", value: 180 },
];

// ---------------------------------------------------------------------------
// Saved funnels mock
// ---------------------------------------------------------------------------

interface SavedFunnel {
  id: string;
  name: string;
  steps: FunnelStep[];
}

const MOCK_SAVED_FUNNELS: SavedFunnel[] = [
  {
    id: "1",
    name: "Main Conversion Funnel",
    steps: DEFAULT_FUNNEL_STEPS,
  },
  {
    id: "2",
    name: "Blog to Signup",
    steps: [
      { label: "/blog", count: 1900 },
      { label: "/blog/getting-started", count: 780 },
      { label: "/pricing", count: 340 },
      { label: "/signup", count: 120 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function FunnelPage() {
  const { workspace } = useWorkspace();

  const [activeTab, setActiveTab] = useState("funnel");
  const [savedFunnels] = useState<SavedFunnel[]>(MOCK_SAVED_FUNNELS);
  const [selectedFunnel, setSelectedFunnel] = useState<SavedFunnel>(
    MOCK_SAVED_FUNNELS[0],
  );

  // Funnel builder state
  const [isBuilding, setIsBuilding] = useState(false);
  const [builderSteps, setBuilderSteps] = useState<string[]>([""]);
  const [builderName, setBuilderName] = useState("");

  // TODO: Replace with tRPC queries
  // const funnelsQuery = trpc.heatmap.listFunnels.useQuery(
  //   { workspaceId: workspace?.id ?? "" },
  //   { enabled: !!workspace?.id },
  // );

  const handleAddStep = useCallback(() => {
    setBuilderSteps((prev) => [...prev, ""]);
  }, []);

  const handleRemoveStep = useCallback((index: number) => {
    setBuilderSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleStepChange = useCallback((index: number, value: string) => {
    setBuilderSteps((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleSaveFunnel = useCallback(() => {
    // TODO: Save via tRPC mutation
    const steps = builderSteps.filter(Boolean);
    if (steps.length < 2 || !builderName.trim()) return;

    // Mock: create preview
    const mockCounts = steps.map((_, i) =>
      Math.round(5000 * Math.pow(0.6, i)),
    );
    const newFunnel: SavedFunnel = {
      id: `new-${Date.now()}`,
      name: builderName.trim(),
      steps: steps.map((label, i) => ({ label, count: mockCounts[i] })),
    };

    setSelectedFunnel(newFunnel);
    setIsBuilding(false);
    setBuilderSteps([""]);
    setBuilderName("");
  }, [builderSteps, builderName]);

  const handleCancelBuild = useCallback(() => {
    setIsBuilding(false);
    setBuilderSteps([""]);
    setBuilderName("");
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Funnel & Flow Analysis
          </h1>
          <p className="text-sm text-muted-foreground">
            Define conversion funnels and visualize user navigation paths.
          </p>
        </div>
        <Button onClick={() => setIsBuilding(true)} disabled={isBuilding}>
          <PlusIcon className="size-4" />
          New Funnel
        </Button>
      </div>

      <Separator />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="funnel">
            <BarChart3Icon className="size-4" />
            Conversion Funnel
          </TabsTrigger>
          <TabsTrigger value="flow">
            <GitBranchIcon className="size-4" />
            User Flow
          </TabsTrigger>
        </TabsList>

        {/* Funnel Tab */}
        <TabsContent value="funnel">
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            {/* Saved funnels sidebar */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Saved Funnels
              </h3>
              {savedFunnels.map((funnel) => (
                <button
                  key={funnel.id}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                    selectedFunnel.id === funnel.id
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                  onClick={() => setSelectedFunnel(funnel)}
                >
                  <p className="text-sm font-medium">{funnel.name}</p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {funnel.steps.map((step, i) => (
                      <span key={step.label} className="flex items-center gap-1">
                        {i > 0 && (
                          <ArrowRightIcon className="size-2.5 text-muted-foreground/50" />
                        )}
                        <span className="max-w-[60px] truncate">
                          {step.label}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-1.5">
                    <Badge variant="secondary" className="tabular-nums text-xs">
                      {((funnel.steps[funnel.steps.length - 1].count /
                        funnel.steps[0].count) *
                        100).toFixed(1)}
                      % conversion
                    </Badge>
                  </div>
                </button>
              ))}
            </div>

            {/* Funnel visualization */}
            <div className="space-y-6">
              {/* Builder */}
              {isBuilding && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Define New Funnel
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Funnel Name</label>
                      <Input
                        placeholder="e.g., Main Conversion Funnel"
                        value={builderName}
                        onChange={(e) => setBuilderName(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Steps (in order)
                      </label>
                      {builderSteps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <GripVerticalIcon className="size-4 text-muted-foreground/50" />
                          <Badge
                            variant="outline"
                            className="shrink-0 text-xs"
                          >
                            {i + 1}
                          </Badge>
                          <Input
                            placeholder="/page-path"
                            value={step}
                            onChange={(e) =>
                              handleStepChange(i, e.target.value)
                            }
                            className="flex-1"
                          />
                          {builderSteps.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRemoveStep(i)}
                            >
                              <Trash2Icon className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddStep}
                        className="mt-1"
                      >
                        <PlusIcon className="size-3.5" />
                        Add Step
                      </Button>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelBuild}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveFunnel}
                        disabled={
                          builderSteps.filter(Boolean).length < 2 ||
                          !builderName.trim()
                        }
                      >
                        Create Funnel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Selected funnel chart */}
              <FunnelChart
                steps={selectedFunnel.steps}
                title={selectedFunnel.name}
              />

              {/* Step details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Step Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Step</th>
                          <th className="pb-2 pr-4 font-medium">Page</th>
                          <th className="pb-2 pr-4 text-right font-medium">
                            Visitors
                          </th>
                          <th className="pb-2 pr-4 text-right font-medium">
                            Drop-off
                          </th>
                          <th className="pb-2 text-right font-medium">
                            Conversion
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedFunnel.steps.map((step, i) => {
                          const prevCount =
                            i > 0 ? selectedFunnel.steps[i - 1].count : step.count;
                          const dropOff = prevCount - step.count;
                          const convRate =
                            prevCount > 0
                              ? (step.count / prevCount) * 100
                              : 100;

                          return (
                            <tr
                              key={step.label}
                              className="border-b last:border-b-0"
                            >
                              <td className="py-2.5 pr-4">
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {i + 1}
                                </Badge>
                              </td>
                              <td className="py-2.5 pr-4 font-medium">
                                {step.label}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">
                                {step.count.toLocaleString()}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">
                                {i === 0 ? (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                ) : (
                                  <span className="text-destructive">
                                    -{dropOff.toLocaleString()}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 text-right tabular-nums">
                                {i === 0 ? (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                ) : (
                                  <Badge
                                    variant={
                                      convRate >= 50
                                        ? "default"
                                        : convRate >= 25
                                          ? "secondary"
                                          : "destructive"
                                    }
                                    className="text-xs"
                                  >
                                    {convRate.toFixed(1)}%
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Flow Tab */}
        <TabsContent value="flow">
          <div className="space-y-6">
            <SankeyFlow
              nodes={MOCK_SANKEY_NODES}
              links={MOCK_SANKEY_LINKS}
              title="User Navigation Flow"
            />

            {/* Top paths table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Navigation Paths</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Path</th>
                        <th className="pb-2 pr-4 text-right font-medium">
                          Sessions
                        </th>
                        <th className="pb-2 text-right font-medium">
                          % of Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          path: "/ → /pricing → /signup",
                          sessions: 1200,
                          pct: 23.1,
                        },
                        {
                          path: "/ → /features → /pricing → /signup",
                          sessions: 890,
                          pct: 17.1,
                        },
                        {
                          path: "/ → /blog → /features → /pricing",
                          sessions: 560,
                          pct: 10.8,
                        },
                        {
                          path: "/ → /pricing → /demo",
                          sessions: 500,
                          pct: 9.6,
                        },
                        {
                          path: "/ → /features → Exit",
                          sessions: 400,
                          pct: 7.7,
                        },
                      ].map((row) => (
                        <tr
                          key={row.path}
                          className="border-b last:border-b-0"
                        >
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-1 text-sm">
                              {row.path.split(" → ").map((segment, i, arr) => (
                                <span
                                  key={i}
                                  className="flex items-center gap-1"
                                >
                                  {i > 0 && (
                                    <ArrowRightIcon className="size-3 text-muted-foreground/50" />
                                  )}
                                  <Badge
                                    variant={
                                      segment === "Exit"
                                        ? "destructive"
                                        : "secondary"
                                    }
                                    className="text-xs"
                                  >
                                    {segment}
                                  </Badge>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">
                            {row.sessions.toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {row.pct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
