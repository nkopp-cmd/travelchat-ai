/**
 * Safely extract an error message from any error type.
 * Handles Error objects, strings, objects with message property, and unknown types.
 */
export function getErrorMessage(error: unknown): string {
  // Handle Error instances
  if (error instanceof Error) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === "string") {
    return error;
  }

  // Handle objects with a message property
  if (error && typeof error === "object") {
    if ("message" in error && typeof (error as { message: unknown }).message === "string") {
      return (error as { message: string }).message;
    }

    // Handle objects with an error property that has a message
    if ("error" in error) {
      const innerError = (error as { error: unknown }).error;
      if (typeof innerError === "string") {
        return innerError;
      }
      if (innerError && typeof innerError === "object" && "message" in innerError) {
        return String((innerError as { message: unknown }).message);
      }
    }

    // Try to stringify the object (but don't return [object Object])
    try {
      const str = JSON.stringify(error);
      if (str !== "{}" && str.length < 200) {
        return str;
      }
    } catch {
      // Ignore stringify errors
    }
  }

  // Default fallback
  return "An unexpected error occurred. Please try again.";
}

/**
 * Check if an error is a specific API error type
 */
export function isApiError(error: unknown): error is { error: string; message: string } {
  return (
    error !== null &&
    typeof error === "object" &&
    "error" in error &&
    "message" in error &&
    typeof (error as { error: unknown }).error === "string" &&
    typeof (error as { message: unknown }).message === "string"
  );
}

/**
 * Extract HTTP status from an error response
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
  }
  return undefined;
}
