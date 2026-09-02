export function printCurrentPage() {
  const body = document.body;
  const cleanup = () => body.classList.remove("report-printing");

  body.classList.add("report-printing");
  window.addEventListener("afterprint", cleanup, { once: true });

  window.requestAnimationFrame(() => {
    window.print();
    window.setTimeout(cleanup, 1_000);
  });
}
