import { memo } from "react";

/** Props for {@link ErrorBanner}. */
export interface ErrorBannerProps {
  /** The verbatim, user-readable error message from the stream's error event. */
  message: string;
}

/**
 * High-contrast alert banner shown when the trace stream reports an error.
 * Displays the backend's message verbatim (backend messages are already
 * user-readable, e.g. rate-limit guidance) — never a stack trace — plus a
 * short "try again" hint.
 */
function ErrorBannerComponent({ message }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-red-950 sm:p-5"
    >
      <p className="font-bold">Something went wrong</p>
      <p>{message}</p>
      <p className="text-sm text-red-800">
        Your form details are still here — press Discover again to try again.
      </p>
    </div>
  );
}

/**
 * Memoized error banner. See {@link ErrorBannerComponent} for behavior.
 */
export const ErrorBanner = memo(ErrorBannerComponent);
