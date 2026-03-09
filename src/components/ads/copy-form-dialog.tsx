import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CopyTagInput } from "./copy-tag-input";
import type { AdPlatform } from "./copy-variant-card";
import type { SavedCopy, CopyTone } from "./copy-library-manager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_TONES: CopyTone[] = [
  "Professionale",
  "Conversazionale",
  "Urgente",
  "Informativo",
];

const ALL_PLATFORMS: { value: AdPlatform; label: string }[] = [
  { value: "GOOGLE_SEARCH", label: "Google Search" },
  { value: "META_FEED", label: "Meta Feed" },
  { value: "LINKEDIN", label: "LinkedIn" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CopyFormDialogProps {
  trigger: React.ReactNode;
  initial?: SavedCopy;
  onSubmit: (data: Omit<SavedCopy, "id" | "createdAt">) => void;
}

// ---------------------------------------------------------------------------
// Copy form dialog component
// ---------------------------------------------------------------------------

export function CopyFormDialog({
  trigger,
  initial,
  onSubmit,
}: CopyFormDialogProps) {
  const [headline, setHeadline] = useState(initial?.headline ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cta, setCta] = useState(initial?.cta ?? "");
  const [platform, setPlatform] = useState<AdPlatform>(
    initial?.platform ?? "GOOGLE_SEARCH"
  );
  const [tone, setTone] = useState<CopyTone | undefined>(initial?.tone);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [open, setOpen] = useState(false);

  function handleSubmit() {
    if (!headline.trim() || !description.trim()) return;

    onSubmit({
      headline: headline.trim(),
      description: description.trim(),
      cta: cta.trim(),
      platform,
      tone,
      tags,
      performanceScore: initial?.performanceScore,
    });
    setOpen(false);

    // Reset if creating new
    if (!initial) {
      setHeadline("");
      setDescription("");
      setCta("");
      setPlatform("GOOGLE_SEARCH");
      setTone(undefined);
      setTags([]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<>{trigger}</>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Modifica copy" : "Nuovo copy"}
          </DialogTitle>
          <DialogDescription>
            {initial
              ? "Modifica i campi del copy salvato."
              : "Crea un nuovo copy da salvare nella libreria."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Headline *
            </label>
            <Input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Headline del copy..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Descrizione *
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrizione del copy..."
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              CTA
            </label>
            <Input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Call to action..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Piattaforma
              </label>
              <Select
                value={platform}
                onValueChange={(v) => { if (v) setPlatform(v as AdPlatform); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Tono
              </label>
              <Select
                value={tone ?? ""}
                onValueChange={(v) =>
                  setTone(!v || v === "" ? undefined : (v as CopyTone))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona tono" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_TONES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Tag
            </label>
            <CopyTagInput
              tags={tags}
              onAdd={(t) => setTags((prev) => [...prev, t])}
              onRemove={(t) => setTags((prev) => prev.filter((x) => x !== t))}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Annulla
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!headline.trim() || !description.trim()}>
            {initial ? "Salva modifiche" : "Crea copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
