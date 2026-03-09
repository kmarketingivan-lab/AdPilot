"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-lg font-semibold">Qualcosa è andato storto</h2>
          <p className="text-sm text-muted-foreground">{this.state.error?.message}</p>
          <Button onClick={() => this.setState({ hasError: false })}>
            Riprova
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
