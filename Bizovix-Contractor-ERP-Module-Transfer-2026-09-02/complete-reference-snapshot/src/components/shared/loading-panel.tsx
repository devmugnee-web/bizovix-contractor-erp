export function LoadingPanel({ lines = 5 }: { lines?: number }) {
  return (
    <div className="erp-card animate-pulse space-y-4 p-5">
      <div className="h-6 w-40 rounded-full bg-canvas" />
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="h-10 rounded-xl bg-canvas" />
      ))}
    </div>
  );
}
