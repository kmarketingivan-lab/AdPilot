"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  GripVerticalIcon,
  Trash2Icon,
  MonitorIcon,
  SmartphoneIcon,
  EyeIcon,
  CodeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmailBlockPreview } from "./email-block-preview";
import { EmailBlockEditor } from "./email-block-editor";
import { EmailBlockPalette } from "./email-block-palette";

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

export type BlockType =
  | "header"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "columns"
  | "footer";

export interface EmailBlock {
  id: string;
  type: BlockType;
  content: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Default block content
// ---------------------------------------------------------------------------

function createDefaultBlock(type: BlockType): EmailBlock {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  switch (type) {
    case "header":
      return {
        id,
        type,
        content: {
          text: "Your Heading",
          fontSize: "28",
          color: "#1e293b",
          backgroundColor: "#ffffff",
          align: "center",
        },
      };
    case "text":
      return {
        id,
        type,
        content: {
          text: "Write your email content here. You can use merge variables like {{firstName}} and {{company}}.",
          fontSize: "16",
          color: "#374151",
          lineHeight: "1.6",
          align: "left",
        },
      };
    case "image":
      return {
        id,
        type,
        content: {
          src: "https://placehold.co/600x200/e2e8f0/64748b?text=Your+Image",
          alt: "Image",
          width: "100",
          align: "center",
          link: "",
        },
      };
    case "button":
      return {
        id,
        type,
        content: {
          text: "Click Here",
          url: "https://",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          fontSize: "16",
          borderRadius: "6",
          align: "center",
        },
      };
    case "divider":
      return {
        id,
        type,
        content: {
          color: "#e2e8f0",
          thickness: "1",
          width: "100",
        },
      };
    case "columns":
      return {
        id,
        type,
        content: {
          leftText: "Left column content",
          rightText: "Right column content",
          leftColor: "#374151",
          rightColor: "#374151",
        },
      };
    case "footer":
      return {
        id,
        type,
        content: {
          text: "\u00a9 {{company}} - All rights reserved",
          fontSize: "12",
          color: "#9ca3af",
          backgroundColor: "#f9fafb",
          align: "center",
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Block to HTML conversion
// ---------------------------------------------------------------------------

function blockToHtml(block: EmailBlock): string {
  const c = block.content;

  switch (block.type) {
    case "header":
      return `<tr><td style="padding:20px 30px;background:${c.backgroundColor};text-align:${c.align};"><h1 style="margin:0;font-size:${c.fontSize}px;color:${c.color};font-family:Arial,sans-serif;">${c.text}</h1></td></tr>`;
    case "text":
      return `<tr><td style="padding:15px 30px;"><p style="margin:0;font-size:${c.fontSize}px;color:${c.color};line-height:${c.lineHeight};text-align:${c.align};font-family:Arial,sans-serif;">${c.text}</p></td></tr>`;
    case "image": {
      const img = `<img src="${c.src}" alt="${c.alt}" style="max-width:${c.width}%;height:auto;display:block;border:0;" />`;
      const wrapped = c.link ? `<a href="${c.link}">${img}</a>` : img;
      return `<tr><td style="padding:15px 30px;text-align:${c.align};">${wrapped}</td></tr>`;
    }
    case "button":
      return `<tr><td style="padding:15px 30px;text-align:${c.align};"><table cellpadding="0" cellspacing="0" style="${c.align === "center" ? "margin:0 auto" : c.align === "right" ? "margin-left:auto" : ""}"><tr><td style="background:${c.backgroundColor};border-radius:${c.borderRadius}px;padding:12px 30px;"><a href="${c.url}" style="color:${c.color};text-decoration:none;font-size:${c.fontSize}px;font-weight:600;font-family:Arial,sans-serif;">${c.text}</a></td></tr></table></td></tr>`;
    case "divider":
      return `<tr><td style="padding:10px 30px;"><hr style="border:none;border-top:${c.thickness}px solid ${c.color};width:${c.width}%;margin:0 auto;" /></td></tr>`;
    case "columns":
      return `<tr><td style="padding:15px 30px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top" style="padding-right:10px;"><p style="margin:0;font-size:15px;color:${c.leftColor};font-family:Arial,sans-serif;">${c.leftText}</p></td><td width="50%" valign="top" style="padding-left:10px;"><p style="margin:0;font-size:15px;color:${c.rightColor};font-family:Arial,sans-serif;">${c.rightText}</p></td></tr></table></td></tr>`;
    case "footer":
      return `<tr><td style="padding:20px 30px;background:${c.backgroundColor};text-align:${c.align};"><p style="margin:0;font-size:${c.fontSize}px;color:${c.color};font-family:Arial,sans-serif;">${c.text}</p></td></tr>`;
    default:
      return "";
  }
}

/**
 * Render all blocks into a complete HTML email string.
 */
export function blocksToHtml(blocks: EmailBlock[]): string {
  const rows = blocks.map(blockToHtml).join("");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
${rows}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Parse an HTML string back into blocks (best-effort for predefined templates).
 * Falls back to a single text block if parsing is too complex.
 */
export function htmlToBlocks(html: string): EmailBlock[] {
  // Simple approach: just create a single text block with the raw HTML
  // This is used when loading predefined templates
  return [
    {
      id: `block-${Date.now()}`,
      type: "text",
      content: {
        text: "Template loaded. Edit blocks below or switch to HTML view to customize.",
        fontSize: "16",
        color: "#374151",
        lineHeight: "1.6",
        align: "left",
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Main EmailBuilder component
// ---------------------------------------------------------------------------

interface EmailBuilderProps {
  /** Initial HTML to load (e.g. from a predefined template) */
  initialHtml?: string;
  /** Initial blocks (takes precedence over initialHtml) */
  initialBlocks?: EmailBlock[];
  /** Called whenever the HTML output changes */
  onChange?: (html: string) => void;
  /** Called when the user clicks "Save" */
  onSave?: (html: string, blocks: EmailBlock[]) => void;
}

export function EmailBuilder({
  initialHtml,
  initialBlocks,
  onChange,
  onSave,
}: EmailBuilderProps) {
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => {
    if (initialBlocks && initialBlocks.length > 0) return initialBlocks;
    return [
      createDefaultBlock("header"),
      createDefaultBlock("text"),
      createDefaultBlock("button"),
      createDefaultBlock("footer"),
    ];
  });

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [viewMode, setViewMode] = useState<"editor" | "preview" | "html">("editor");
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedBlockType = useRef<BlockType | null>(null);
  const draggedBlockIndex = useRef<number | null>(null);

  // Initial HTML loading: store separately for HTML view
  const [rawHtml, setRawHtml] = useState<string>(initialHtml ?? "");

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId]
  );

  const outputHtml = useMemo(() => {
    if (rawHtml && viewMode === "html") return rawHtml;
    return blocksToHtml(blocks);
  }, [blocks, rawHtml, viewMode]);

  // Notify parent
  const notifyChange = useCallback(
    (newBlocks: EmailBlock[]) => {
      if (onChange) onChange(blocksToHtml(newBlocks));
    },
    [onChange]
  );

  // Block manipulation
  const updateBlock = useCallback(
    (blockId: string, content: Record<string, string>) => {
      setBlocks((prev) => {
        const next = prev.map((b) =>
          b.id === blockId ? { ...b, content } : b
        );
        notifyChange(next);
        return next;
      });
    },
    [notifyChange]
  );

  const removeBlock = useCallback(
    (blockId: string) => {
      setBlocks((prev) => {
        const next = prev.filter((b) => b.id !== blockId);
        notifyChange(next);
        return next;
      });
      if (selectedBlockId === blockId) setSelectedBlockId(null);
    },
    [selectedBlockId, notifyChange]
  );

  const moveBlock = useCallback(
    (fromIndex: number, toIndex: number) => {
      setBlocks((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        notifyChange(next);
        return next;
      });
    },
    [notifyChange]
  );

  const addBlock = useCallback(
    (type: BlockType, atIndex?: number) => {
      const newBlock = createDefaultBlock(type);
      setBlocks((prev) => {
        const next = [...prev];
        if (atIndex !== undefined) {
          next.splice(atIndex, 0, newBlock);
        } else {
          next.push(newBlock);
        }
        notifyChange(next);
        return next;
      });
      setSelectedBlockId(newBlock.id);
    },
    [notifyChange]
  );

  // Drag from palette
  const handlePaletteDragStart = (type: BlockType) => {
    draggedBlockType.current = type;
    draggedBlockIndex.current = null;
  };

  // Drag existing block
  const handleBlockDragStart = (index: number) => {
    draggedBlockIndex.current = index;
    draggedBlockType.current = null;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (draggedBlockType.current) {
      addBlock(draggedBlockType.current, targetIndex);
      draggedBlockType.current = null;
    } else if (draggedBlockIndex.current !== null) {
      moveBlock(draggedBlockIndex.current, targetIndex);
      draggedBlockIndex.current = null;
    }
  };

  const handleDragEnd = () => {
    setDragOverIndex(null);
    draggedBlockType.current = null;
    draggedBlockIndex.current = null;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full min-h-[600px] border rounded-lg overflow-hidden bg-background">
      {/* ─── Left: Block palette ─── */}
      <EmailBlockPalette
        onDragStart={handlePaletteDragStart}
        onDragEnd={handleDragEnd}
        onAddBlock={addBlock}
      />

      {/* ─── Center: Canvas / Preview ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-2 border-b bg-muted/20">
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <button
              onClick={() => setViewMode("editor")}
              className={cn(
                "px-2 py-1 text-xs rounded",
                viewMode === "editor" && "bg-background shadow-sm"
              )}
            >
              Editor
            </button>
            <button
              onClick={() => setViewMode("preview")}
              className={cn(
                "px-2 py-1 text-xs rounded",
                viewMode === "preview" && "bg-background shadow-sm"
              )}
            >
              <EyeIcon className="h-3 w-3 inline mr-1" />
              Preview
            </button>
            <button
              onClick={() => setViewMode("html")}
              className={cn(
                "px-2 py-1 text-xs rounded",
                viewMode === "html" && "bg-background shadow-sm"
              )}
            >
              <CodeIcon className="h-3 w-3 inline mr-1" />
              HTML
            </button>
          </div>

          {viewMode === "preview" && (
            <div className="flex items-center gap-1 rounded-md border p-0.5 ml-2">
              <button
                onClick={() => setPreviewMode("desktop")}
                className={cn(
                  "px-2 py-1 text-xs rounded",
                  previewMode === "desktop" && "bg-background shadow-sm"
                )}
              >
                <MonitorIcon className="h-3 w-3 inline mr-1" />
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode("mobile")}
                className={cn(
                  "px-2 py-1 text-xs rounded",
                  previewMode === "mobile" && "bg-background shadow-sm"
                )}
              >
                <SmartphoneIcon className="h-3 w-3 inline mr-1" />
                Mobile
              </button>
            </div>
          )}

          <div className="ml-auto">
            {onSave && (
              <Button
                size="sm"
                onClick={() => onSave(outputHtml, blocks)}
              >
                Save
              </Button>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
          {viewMode === "editor" && (
            <div
              className="max-w-[620px] mx-auto bg-white rounded-lg shadow-sm border min-h-[200px]"
              onDragOver={(e) => {
                e.preventDefault();
                if (blocks.length === 0) setDragOverIndex(0);
              }}
              onDrop={(e) => {
                if (blocks.length === 0) handleDrop(e, 0);
              }}
            >
              {blocks.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Drag blocks here or click a block type to add it
                </div>
              )}
              {blocks.map((block, index) => (
                <div key={block.id}>
                  {/* Drop zone indicator */}
                  {dragOverIndex === index && (
                    <div className="h-1 bg-blue-500 mx-4 rounded" />
                  )}
                  <div
                    draggable
                    onDragStart={() => handleBlockDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedBlockId(block.id)}
                    className={cn(
                      "relative group cursor-pointer border-2 border-transparent transition-colors",
                      selectedBlockId === block.id && "border-blue-500"
                    )}
                  >
                    {/* Block controls overlay */}
                    <div className="absolute right-1 top-1 hidden group-hover:flex items-center gap-0.5 z-10">
                      {index > 0 && (
                        <button
                          aria-label="Move block up"
                          onClick={(e) => { e.stopPropagation(); moveBlock(index, index - 1); }}
                          className="p-1 bg-background border rounded shadow-sm hover:bg-accent"
                        >
                          <ChevronUpIcon className="h-3 w-3" />
                        </button>
                      )}
                      {index < blocks.length - 1 && (
                        <button
                          aria-label="Move block down"
                          onClick={(e) => { e.stopPropagation(); moveBlock(index, index + 1); }}
                          className="p-1 bg-background border rounded shadow-sm hover:bg-accent"
                        >
                          <ChevronDownIcon className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        aria-label="Delete block"
                        onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                        className="p-1 bg-background border rounded shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2Icon className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Drag handle */}
                    <div aria-label="Drag to reorder block" className="absolute left-1 top-1/2 -translate-y-1/2 hidden group-hover:block z-10 cursor-grab">
                      <GripVerticalIcon className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <EmailBlockPreview block={block} />
                  </div>
                </div>
              ))}
              {/* Final drop zone */}
              {dragOverIndex === blocks.length && (
                <div className="h-1 bg-blue-500 mx-4 rounded" />
              )}
              <div
                onDragOver={(e) => handleDragOver(e, blocks.length)}
                onDrop={(e) => handleDrop(e, blocks.length)}
                className="h-8"
              />
            </div>
          )}

          {viewMode === "preview" && (
            <div
              className={cn(
                "mx-auto bg-white rounded-lg shadow-sm border overflow-hidden",
                previewMode === "desktop" ? "max-w-[620px]" : "max-w-[375px]"
              )}
            >
              <iframe
                srcDoc={outputHtml}
                title="Email Preview"
                className="w-full border-0"
                style={{ minHeight: "500px" }}
              />
            </div>
          )}

          {viewMode === "html" && (
            <div className="max-w-[800px] mx-auto">
              <textarea
                className="w-full h-[500px] font-mono text-xs p-4 rounded-lg border bg-muted/50 resize-y"
                value={rawHtml || outputHtml}
                onChange={(e) => {
                  setRawHtml(e.target.value);
                  if (onChange) onChange(e.target.value);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Right: Block settings ─── */}
      {viewMode === "editor" && (
        <div className="w-72 border-l flex flex-col bg-muted/30">
          <div className="p-3 border-b">
            <h3 className="font-semibold text-sm">
              {selectedBlock
                ? `${selectedBlock.type.charAt(0).toUpperCase() + selectedBlock.type.slice(1)} Settings`
                : "Block Settings"}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {selectedBlock ? (
              <EmailBlockEditor
                block={selectedBlock}
                onChange={(content) => updateBlock(selectedBlock.id, content)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a block to edit its properties.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
