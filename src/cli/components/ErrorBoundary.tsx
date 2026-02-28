import React from "react";
import { Box, Text } from "ink";
import { logger } from "../../utils/logger.js";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error("React error boundary caught error", error.message, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>
            BombaCode encountered an unexpected error:
          </Text>
          <Text color="red">
            {this.state.error?.message ?? "Unknown error"}
          </Text>
          <Text dimColor>
            {"\n"}Check ~/.bombacode/debug.log for details.
          </Text>
          <Text dimColor>
            Run with BOMBA_DEBUG=1 for verbose output.
          </Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
