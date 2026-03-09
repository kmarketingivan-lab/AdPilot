import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Social Media | AdPilot",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
