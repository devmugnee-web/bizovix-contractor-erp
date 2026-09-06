export interface PdfPrintJob {
  ready: Promise<void>;
  dispose: () => void;
}

/** Print the server-generated PDF, not the surrounding application page. */
export function createPdfPrintJob(blob: Blob, title = "Bill print document"): PdfPrintJob {
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.dataset.billPrint = "true";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Keep a rendered frame for native PDF viewers; display:none can print blank.
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;pointer-events:none";
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  let settled = false;
  let disposed = false;
  let target: Window | null = null;
  let loadTimeout: number | undefined;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });

  function loaded() {
    if (settled) return;
    settled = true;
    resolveReady();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    window.clearTimeout(loadTimeout);
    frame.onload = null;
    frame.onerror = null;
    try { target?.removeEventListener("afterprint", afterPrint); } catch { /* A native viewer may change its window origin. */ }
    frame.remove();
    URL.revokeObjectURL(url);
    if (!settled) {
      settled = true;
      rejectReady(new DOMException("Printing was cancelled", "AbortError"));
    }
  }
  function afterPrint() { loaded(); dispose(); }
  function failed() {
    if (!settled) {
      settled = true;
      rejectReady(new Error("Could not open print preview. Please try again, or download the PDF and print it."));
    }
    dispose();
  }
  frame.onload = () => {
    if (disposed || settled) return;
    window.clearTimeout(loadTimeout);
    try {
      target = frame.contentWindow;
      if (!target) throw new Error("Print document is unavailable");
      target.addEventListener("afterprint", afterPrint, { once: true });
      target.focus();
      target.print();
      loaded();
      // Keep the PDF alive until afterprint (or the next print/unmount), since
      // some browser print dialogs return from print() before they are closed.
    } catch { failed(); }
  };
  frame.onerror = failed;
  loadTimeout = window.setTimeout(failed, 30_000);
  frame.src = url;
  document.body.appendChild(frame);
  return { ready, dispose };
}
