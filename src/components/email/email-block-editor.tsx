import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EmailBlock } from "./email-builder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MERGE_VARIABLES = [
  "{{firstName}}",
  "{{lastName}}",
  "{{email}}",
  "{{company}}",
  "{{phone}}",
];

// ---------------------------------------------------------------------------
// Block editor props
// ---------------------------------------------------------------------------

export interface EmailBlockEditorProps {
  block: EmailBlock;
  onChange: (content: Record<string, string>) => void;
}

// ---------------------------------------------------------------------------
// Block editor panel
// ---------------------------------------------------------------------------

export function EmailBlockEditor({ block, onChange }: EmailBlockEditorProps) {
  const update = (key: string, value: string) => {
    onChange({ ...block.content, [key]: value });
  };

  const c = block.content;

  switch (block.type) {
    case "header":
      return (
        <div className="space-y-3">
          <div>
            <Label>Text</Label>
            <Input value={c.text} onChange={(e) => update("text", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Font Size</Label>
              <Input type="number" value={c.fontSize} onChange={(e) => update("fontSize", e.target.value)} />
            </div>
            <div>
              <Label>Align</Label>
              <select aria-label="Header alignment" className="w-full rounded-md border px-3 py-2 text-sm" value={c.align} onChange={(e) => update("align", e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Text Color</Label>
              <Input type="color" value={c.color} onChange={(e) => update("color", e.target.value)} />
            </div>
            <div>
              <Label>Background</Label>
              <Input type="color" value={c.backgroundColor} onChange={(e) => update("backgroundColor", e.target.value)} />
            </div>
          </div>
        </div>
      );

    case "text":
      return (
        <div className="space-y-3">
          <div>
            <Label>Content</Label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[100px] resize-y"
              value={c.text}
              onChange={(e) => update("text", e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Merge variables: {MERGE_VARIABLES.join(", ")}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Font Size</Label>
              <Input type="number" value={c.fontSize} onChange={(e) => update("fontSize", e.target.value)} />
            </div>
            <div>
              <Label>Color</Label>
              <Input type="color" value={c.color} onChange={(e) => update("color", e.target.value)} />
            </div>
            <div>
              <Label>Align</Label>
              <select aria-label="Text alignment" className="w-full rounded-md border px-3 py-2 text-sm" value={c.align} onChange={(e) => update("align", e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </div>
      );

    case "image":
      return (
        <div className="space-y-3">
          <div>
            <Label>Image URL</Label>
            <Input value={c.src} onChange={(e) => update("src", e.target.value)} />
          </div>
          <div>
            <Label>Alt Text</Label>
            <Input value={c.alt} onChange={(e) => update("alt", e.target.value)} />
          </div>
          <div>
            <Label>Link URL (optional)</Label>
            <Input value={c.link} onChange={(e) => update("link", e.target.value)} placeholder="https://" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Width (%)</Label>
              <Input type="number" min="10" max="100" value={c.width} onChange={(e) => update("width", e.target.value)} />
            </div>
            <div>
              <Label>Align</Label>
              <select aria-label="Image alignment" className="w-full rounded-md border px-3 py-2 text-sm" value={c.align} onChange={(e) => update("align", e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </div>
      );

    case "button":
      return (
        <div className="space-y-3">
          <div>
            <Label>Button Text</Label>
            <Input value={c.text} onChange={(e) => update("text", e.target.value)} />
          </div>
          <div>
            <Label>URL</Label>
            <Input value={c.url} onChange={(e) => update("url", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>BG Color</Label>
              <Input type="color" value={c.backgroundColor} onChange={(e) => update("backgroundColor", e.target.value)} />
            </div>
            <div>
              <Label>Text Color</Label>
              <Input type="color" value={c.color} onChange={(e) => update("color", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Font Size</Label>
              <Input type="number" value={c.fontSize} onChange={(e) => update("fontSize", e.target.value)} />
            </div>
            <div>
              <Label>Radius</Label>
              <Input type="number" value={c.borderRadius} onChange={(e) => update("borderRadius", e.target.value)} />
            </div>
            <div>
              <Label>Align</Label>
              <select aria-label="Button alignment" className="w-full rounded-md border px-3 py-2 text-sm" value={c.align} onChange={(e) => update("align", e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </div>
      );

    case "divider":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Color</Label>
              <Input type="color" value={c.color} onChange={(e) => update("color", e.target.value)} />
            </div>
            <div>
              <Label>Thickness</Label>
              <Input type="number" min="1" max="10" value={c.thickness} onChange={(e) => update("thickness", e.target.value)} />
            </div>
            <div>
              <Label>Width (%)</Label>
              <Input type="number" min="10" max="100" value={c.width} onChange={(e) => update("width", e.target.value)} />
            </div>
          </div>
        </div>
      );

    case "columns":
      return (
        <div className="space-y-3">
          <div>
            <Label>Left Column</Label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px] resize-y"
              value={c.leftText}
              onChange={(e) => update("leftText", e.target.value)}
            />
          </div>
          <div>
            <Label>Right Column</Label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px] resize-y"
              value={c.rightText}
              onChange={(e) => update("rightText", e.target.value)}
            />
          </div>
        </div>
      );

    case "footer":
      return (
        <div className="space-y-3">
          <div>
            <Label>Footer Text</Label>
            <Input value={c.text} onChange={(e) => update("text", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Text Color</Label>
              <Input type="color" value={c.color} onChange={(e) => update("color", e.target.value)} />
            </div>
            <div>
              <Label>Background</Label>
              <Input type="color" value={c.backgroundColor} onChange={(e) => update("backgroundColor", e.target.value)} />
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
