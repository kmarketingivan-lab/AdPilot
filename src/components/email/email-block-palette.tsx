import {
  TypeIcon,
  ImageIcon,
  MousePointerClickIcon,
  MinusIcon,
  ColumnsIcon,
  LayoutTemplateIcon,
  Heading1Icon,
} from "lucide-react";
import type { BlockType } from "./email-builder";

// ---------------------------------------------------------------------------
// Block palette data
// ---------------------------------------------------------------------------

const BLOCK_TYPES: { type: BlockType; label: string; icon: typeof TypeIcon }[] =
  [
    { type: "header", label: "Header", icon: Heading1Icon },
    { type: "text", label: "Text", icon: TypeIcon },
    { type: "image", label: "Image", icon: ImageIcon },
    { type: "button", label: "Button", icon: MousePointerClickIcon },
    { type: "divider", label: "Divider", icon: MinusIcon },
    { type: "columns", label: "Columns", icon: ColumnsIcon },
    { type: "footer", label: "Footer", icon: LayoutTemplateIcon },
  ];

const MERGE_VARIABLES = [
  "{{firstName}}",
  "{{lastName}}",
  "{{email}}",
  "{{company}}",
  "{{phone}}",
];

// ---------------------------------------------------------------------------
// Block palette props
// ---------------------------------------------------------------------------

export interface EmailBlockPaletteProps {
  onDragStart: (type: BlockType) => void;
  onDragEnd: () => void;
  onAddBlock: (type: BlockType) => void;
}

// ---------------------------------------------------------------------------
// Block palette sidebar
// ---------------------------------------------------------------------------

export function EmailBlockPalette({
  onDragStart,
  onDragEnd,
  onAddBlock,
}: EmailBlockPaletteProps) {
  return (
    <div className="w-56 border-r flex flex-col bg-muted/30">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">Blocks</h3>
      </div>
      <div className="p-2 space-y-1 flex-1 overflow-y-auto">
        {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
          <div
            key={type}
            draggable
            onDragStart={() => onDragStart(type)}
            onDragEnd={onDragEnd}
            onClick={() => onAddBlock(type)}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-grab hover:bg-accent transition-colors active:cursor-grabbing"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Merge variables reference */}
      <div className="p-3 border-t">
        <p className="text-xs font-medium text-muted-foreground mb-1">
          Merge Variables
        </p>
        <div className="flex flex-wrap gap-1">
          {MERGE_VARIABLES.map((v) => (
            <span
              key={v}
              className="inline-block px-1.5 py-0.5 text-[10px] bg-accent rounded font-mono"
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
