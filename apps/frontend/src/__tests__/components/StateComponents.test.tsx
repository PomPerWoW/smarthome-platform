import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState, EmptyState } from "@/components/devices/StateComponents";


describe("StateComponents", () => {
  describe("ErrorState", () => {
    it("renders default title and message", () => {
      render(<ErrorState />);
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByText("We couldn't load this content. Please try again.")).toBeInTheDocument();
    });

    it("renders custom title and message", () => {
      render(<ErrorState title="Custom Title" message="Custom Message" />);
      expect(screen.getByText("Custom Title")).toBeInTheDocument();
      expect(screen.getByText("Custom Message")).toBeInTheDocument();
    });

    it("renders retry button and handles click when onRetry is provided", () => {
      const onRetry = vi.fn();
      render(<ErrorState onRetry={onRetry} />);
      
      const retryButton = screen.getByRole("button", { name: /try again/i });
      expect(retryButton).toBeInTheDocument();
      
      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("hides retry button when onRetry is not provided", () => {
      render(<ErrorState />);
      expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    });
  });

  describe("EmptyState", () => {
    it("renders icon, title, and description", () => {
      const mockIcon = <span data-testid="mock-icon" />;
      render(
        <EmptyState 
          icon={mockIcon} 
          title="Empty Title" 
          description="Empty Description" 
        />
      );

      expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
      expect(screen.getByText("Empty Title")).toBeInTheDocument();
      expect(screen.getByText("Empty Description")).toBeInTheDocument();
    });

    it("renders action node when provided", () => {
      const mockAction = <button>Click Me</button>;
      render(
        <EmptyState 
          icon={<span />} 
          title="Title" 
          action={mockAction} 
        />
      );

      expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
    });
  });
});
