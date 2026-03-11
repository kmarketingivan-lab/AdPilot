import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { XIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CopyTagInputProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

// ---------------------------------------------------------------------------
// Tag input component
// ---------------------------------------------------------------------------

export function CopyTagInput({ tags, onAdd, onRemove }: CopyTagInputProps) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      const normalized = input.trim().toLowerCase();
      if (!tags.includes(normalized)) {
        onAdd(normalized);
      }
      setInput("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="gap-1"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="ml-0.5 rounded-full hover:bg-muted"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder="Aggiungi tag e premi Invio..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
