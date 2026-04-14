/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

const ThrowError = () => {
  throw new Error("Boom");
};

describe("ErrorBoundary", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders fallback when child throws", () => {
    render(
      <ErrorBoundary fallback={<div>Fallback UI</div>}>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(screen.queryByText("Fallback UI")).not.toBeNull();
  });

  it("calls onError when boundary catches error", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary fallback={<div>Fallback UI</div>} onError={onError}>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("can recover when fallback triggers reset", () => {
    let shouldThrow = true;

    const UnstableComponent = () => {
      if (shouldThrow) {
        throw new Error("Recoverable boom");
      }
      return <div>Recovered UI</div>;
    };

    render(
      <ErrorBoundary
        fallback={({ resetError }) => (
          <button
            type="button"
            onClick={() => {
              shouldThrow = false;
              resetError();
            }}
          >
            Retry
          </button>
        )}
      >
        <UnstableComponent />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.queryByText("Recovered UI")).not.toBeNull();
  });
});
