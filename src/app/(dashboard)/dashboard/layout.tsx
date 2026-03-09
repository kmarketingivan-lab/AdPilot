import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | AdPilot",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
