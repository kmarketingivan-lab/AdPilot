"use client";

import { useState, useCallback } from "react";
import {
  Search,
  Facebook,
  Instagram,
  Linkedin,
  Download,
  Library,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import {
  GoogleSearchPreview,
  GOOGLE_CHAR_LIMITS,
} from "@/components/ads/preview-google-search";
import {
  MetaFeedPreview,
  META_CHAR_LIMITS,
} from "@/components/ads/preview-meta-feed";
import {
  LinkedInPreview,
  LINKEDIN_CHAR_LIMITS,
} from "@/components/ads/preview-linkedin";

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

interface GoogleFields {
  headline: string;
  displayUrl: string;
  description: string;
}

interface MetaFields {
  pageName: string;
  primaryText: string;
  headline: string;
  description: string;
  ctaText: string;
  imageUrl: string;
}

interface LinkedInFields {
  companyName: string;
  introText: string;
  headline: string;
  imageUrl: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_GOOGLE: GoogleFields = {
  headline: "",
  displayUrl: "",
  description: "",
};

const DEFAULT_META: MetaFields = {
  pageName: "",
  primaryText: "",
  headline: "",
  description: "",
  ctaText: "Learn More",
  imageUrl: "",
};

const DEFAULT_LINKEDIN: LinkedInFields = {
  companyName: "",
  introText: "",
  headline: "",
  imageUrl: "",
};

// ---------------------------------------------------------------------------
// Field input helper
// ---------------------------------------------------------------------------

function FieldInput({
  label,
  value,
  onChange,
  maxLength,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
}) {
  const ratio = maxLength ? value.length / maxLength : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {maxLength && (
          <span
            className={cn(
              "text-[11px] tabular-nums",
              ratio > 1
                ? "font-semibold text-red-500"
                : ratio > 0.9
                  ? "text-amber-500"
                  : "text-muted-foreground"
            )}
          >
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="border-zinc-700 bg-zinc-800/50"
          rows={3}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="border-zinc-700 bg-zinc-800/50"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form panels
// ---------------------------------------------------------------------------

function GoogleForm({
  fields,
  onChange,
}: {
  fields: GoogleFields;
  onChange: (f: GoogleFields) => void;
}) {
  const set = useCallback(
    <K extends keyof GoogleFields>(key: K, val: GoogleFields[K]) =>
      onChange({ ...fields, [key]: val }),
    [fields, onChange]
  );

  return (
    <div className="space-y-4">
      <FieldInput
        label="Headline"
        value={fields.headline}
        onChange={(v) => set("headline", v)}
        maxLength={GOOGLE_CHAR_LIMITS.headline}
        placeholder="Your ad headline"
      />
      <FieldInput
        label="Display URL"
        value={fields.displayUrl}
        onChange={(v) => set("displayUrl", v)}
        placeholder="https://example.com/page"
      />
      <FieldInput
        label="Description"
        value={fields.description}
        onChange={(v) => set("description", v)}
        maxLength={GOOGLE_CHAR_LIMITS.description}
        multiline
        placeholder="Describe your product or service..."
      />
    </div>
  );
}

function MetaForm({
  fields,
  onChange,
}: {
  fields: MetaFields;
  onChange: (f: MetaFields) => void;
}) {
  const set = useCallback(
    <K extends keyof MetaFields>(key: K, val: MetaFields[K]) =>
      onChange({ ...fields, [key]: val }),
    [fields, onChange]
  );

  return (
    <div className="space-y-4">
      <FieldInput
        label="Page Name"
        value={fields.pageName}
        onChange={(v) => set("pageName", v)}
        placeholder="Your brand or page name"
      />
      <FieldInput
        label="Primary Text"
        value={fields.primaryText}
        onChange={(v) => set("primaryText", v)}
        maxLength={META_CHAR_LIMITS.primaryText}
        multiline
        placeholder="Main ad copy visible above the image..."
      />
      <FieldInput
        label="Headline"
        value={fields.headline}
        onChange={(v) => set("headline", v)}
        maxLength={META_CHAR_LIMITS.headline}
        placeholder="Short headline below image"
      />
      <FieldInput
        label="Description"
        value={fields.description}
        onChange={(v) => set("description", v)}
        maxLength={META_CHAR_LIMITS.description}
        placeholder="Link description"
      />
      <FieldInput
        label="CTA Button Text"
        value={fields.ctaText}
        onChange={(v) => set("ctaText", v)}
        placeholder="Learn More"
      />
      <FieldInput
        label="Image URL (optional)"
        value={fields.imageUrl}
        onChange={(v) => set("imageUrl", v)}
        placeholder="https://example.com/image.jpg"
      />
    </div>
  );
}

function LinkedInForm({
  fields,
  onChange,
}: {
  fields: LinkedInFields;
  onChange: (f: LinkedInFields) => void;
}) {
  const set = useCallback(
    <K extends keyof LinkedInFields>(key: K, val: LinkedInFields[K]) =>
      onChange({ ...fields, [key]: val }),
    [fields, onChange]
  );

  return (
    <div className="space-y-4">
      <FieldInput
        label="Company Name"
        value={fields.companyName}
        onChange={(v) => set("companyName", v)}
        placeholder="Your company name"
      />
      <FieldInput
        label="Intro Text"
        value={fields.introText}
        onChange={(v) => set("introText", v)}
        maxLength={LINKEDIN_CHAR_LIMITS.introText}
        multiline
        placeholder="Write a compelling intro..."
      />
      <FieldInput
        label="Headline"
        value={fields.headline}
        onChange={(v) => set("headline", v)}
        maxLength={LINKEDIN_CHAR_LIMITS.headline}
        placeholder="Ad headline below image"
      />
      <FieldInput
        label="Image URL (optional)"
        value={fields.imageUrl}
        onChange={(v) => set("imageUrl", v)}
        placeholder="https://example.com/image.jpg"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

type AdTab = "google" | "facebook" | "instagram" | "linkedin";

const TAB_CONFIG: {
  value: AdTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "google", label: "Google Search", icon: Search },
  { value: "facebook", label: "Facebook", icon: Facebook },
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin },
];

export default function AdPreviewPage() {
  const [activeTab, setActiveTab] = useState<AdTab>("google");

  // Per-platform form state
  const [google, setGoogle] = useState<GoogleFields>(DEFAULT_GOOGLE);
  const [meta, setMeta] = useState<MetaFields>(DEFAULT_META);
  const [linkedin, setLinkedin] = useState<LinkedInFields>(DEFAULT_LINKEDIN);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ad Preview</h1>
          <p className="text-sm text-muted-foreground">
            See how your ads will look across platforms before publishing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Library className="size-3.5" />
            Import from Library
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="size-3.5" />
            Export as Image
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="google"
        onValueChange={(v) => setActiveTab(v as AdTab)}
      >
        <TabsList>
          {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Shared layout: form | preview */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          {/* ---------- Left: Input form ---------- */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="text-base">
                {TAB_CONFIG.find((t) => t.value === activeTab)?.label} Ad Fields
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TabsContent value="google">
                <GoogleForm fields={google} onChange={setGoogle} />
              </TabsContent>

              <TabsContent value="facebook">
                <MetaForm fields={meta} onChange={setMeta} />
              </TabsContent>

              <TabsContent value="instagram">
                <MetaForm fields={meta} onChange={setMeta} />
              </TabsContent>

              <TabsContent value="linkedin">
                <LinkedInForm fields={linkedin} onChange={setLinkedin} />
              </TabsContent>
            </CardContent>
          </Card>

          {/* ---------- Right: Live preview ---------- */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-300">
                Live Preview
              </h2>
              <span className="rounded-full border border-zinc-700 bg-zinc-800/50 px-2.5 py-0.5 text-[11px] text-zinc-400">
                Updates as you type
              </span>
            </div>

            <Separator />

            <div className="flex items-start justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/30 p-6">
              <TabsContent value="google" className="w-full">
                <GoogleSearchPreview
                  headline={google.headline}
                  displayUrl={google.displayUrl}
                  description={google.description}
                />
              </TabsContent>

              <TabsContent value="facebook" className="w-full">
                <MetaFeedPreview
                  pageName={meta.pageName}
                  primaryText={meta.primaryText}
                  headline={meta.headline}
                  description={meta.description}
                  ctaText={meta.ctaText}
                  imageUrl={meta.imageUrl || undefined}
                  variant="facebook"
                />
              </TabsContent>

              <TabsContent value="instagram" className="w-full">
                <MetaFeedPreview
                  pageName={meta.pageName}
                  primaryText={meta.primaryText}
                  headline={meta.headline}
                  description={meta.description}
                  ctaText={meta.ctaText}
                  imageUrl={meta.imageUrl || undefined}
                  variant="instagram"
                />
              </TabsContent>

              <TabsContent value="linkedin" className="w-full">
                <LinkedInPreview
                  companyName={linkedin.companyName}
                  introText={linkedin.introText}
                  headline={linkedin.headline}
                  imageUrl={linkedin.imageUrl || undefined}
                />
              </TabsContent>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
