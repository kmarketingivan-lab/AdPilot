import Image from "next/image";
import type { EmailBlock } from "./email-builder";

// ---------------------------------------------------------------------------
// Block preview props
// ---------------------------------------------------------------------------

export interface EmailBlockPreviewProps {
  block: EmailBlock;
}

// ---------------------------------------------------------------------------
// Minimal block preview (canvas-side)
// ---------------------------------------------------------------------------

export function EmailBlockPreview({ block }: EmailBlockPreviewProps) {
  const c = block.content;

  switch (block.type) {
    case "header":
      return (
        <div style={{ background: c.backgroundColor, padding: "12px 16px", textAlign: c.align as "left" | "center" | "right" }}>
          <span style={{ fontSize: `${Math.min(Number(c.fontSize), 32)}px`, fontWeight: 700, color: c.color }}>{c.text}</span>
        </div>
      );
    case "text":
      return (
        <div style={{ padding: "8px 16px", textAlign: c.align as "left" | "center" | "right" }}>
          <span style={{ fontSize: "14px", color: c.color, lineHeight: c.lineHeight }}>{c.text}</span>
        </div>
      );
    case "image":
      return (
        <div style={{ padding: "8px 16px", textAlign: c.align as "left" | "center" | "right" }}>
          <div style={{ position: "relative", maxWidth: `${c.width}%`, display: "inline-block" }}>
            <Image src={c.src} alt={c.alt} width={600} height={200} style={{ width: "100%", height: "auto", borderRadius: "4px" }} />
          </div>
        </div>
      );
    case "button":
      return (
        <div style={{ padding: "8px 16px", textAlign: c.align as "left" | "center" | "right" }}>
          <span style={{ display: "inline-block", background: c.backgroundColor, color: c.color, padding: "8px 20px", borderRadius: `${c.borderRadius}px`, fontSize: "14px", fontWeight: 600 }}>
            {c.text}
          </span>
        </div>
      );
    case "divider":
      return (
        <div style={{ padding: "8px 16px" }}>
          <hr style={{ border: "none", borderTop: `${c.thickness}px solid ${c.color}`, width: `${c.width}%`, margin: "0 auto" }} />
        </div>
      );
    case "columns":
      return (
        <div style={{ padding: "8px 16px", display: "flex", gap: "8px" }}>
          <div style={{ flex: 1, fontSize: "13px", color: c.leftColor }}>{c.leftText}</div>
          <div style={{ flex: 1, fontSize: "13px", color: c.rightColor }}>{c.rightText}</div>
        </div>
      );
    case "footer":
      return (
        <div style={{ background: c.backgroundColor, padding: "12px 16px", textAlign: c.align as "left" | "center" | "right" }}>
          <span style={{ fontSize: `${c.fontSize}px`, color: c.color }}>{c.text}</span>
        </div>
      );
    default:
      return null;
  }
}
