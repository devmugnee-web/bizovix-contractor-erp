export function openPrintWindow(features = "width=1100,height=900") {
  if (typeof window === "undefined") {
    return null;
  }

  return window.open("", "_blank", features);
}

export function printWindowWhenReady(printWindow: Window, options?: { closeAfterPrint?: boolean; delayMs?: number }) {
  const closeAfterPrint = options?.closeAfterPrint ?? true;
  const delayMs = options?.delayMs ?? 180;
  let printed = false;
  let closeTimer: number | null = null;

  const closeWindow = () => {
    if (!closeAfterPrint || printWindow.closed) {
      return;
    }

    closeTimer = window.setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.close();
      }
    }, 400);
  };

  const printOnce = () => {
    if (printed || printWindow.closed) {
      return;
    }

    printed = true;
    if (closeTimer !== null) {
      window.clearTimeout(closeTimer);
    }

    printWindow.focus();
    printWindow.print();
  };

  printWindow.addEventListener("afterprint", closeWindow, { once: true });
  printWindow.document.close();

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(printOnce, delayMs);
    return;
  }

  printWindow.addEventListener("load", () => window.setTimeout(printOnce, delayMs), { once: true });
  window.setTimeout(printOnce, 900);
}
