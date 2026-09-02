import { forwardRef, type SVGProps } from "react";

type BrandIconProps = SVGProps<SVGSVGElement>;

export const WhatsAppIcon = forwardRef<SVGSVGElement, BrandIconProps>(function WhatsAppIcon(props, ref) {
  return (
    <svg ref={ref} width={24} height={24} viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        fill="#25D366"
        d="M16 3C8.82 3 3 8.73 3 15.79c0 2.48.72 4.91 2.08 6.99L3.5 29l6.45-1.67A13.1 13.1 0 0 0 16 28.58c7.18 0 13-5.73 13-12.79C29 8.73 23.18 3 16 3Z"
      />
      <path
        fill="#fff"
        d="M23.62 19.4c-.3-.15-1.77-.86-2.05-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.95 1.16-.17.2-.35.23-.64.08-.3-.15-1.26-.46-2.4-1.46-.89-.79-1.5-1.75-1.67-2.05-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.48-.5-.67-.5h-.57c-.2 0-.53.07-.8.37-.28.3-1.06 1.03-1.06 2.52s1.08 2.92 1.23 3.12c.15.2 2.1 3.33 5.2 4.53 3.1 1.2 3.1.8 3.66.75.56-.05 1.77-.72 2.02-1.41.25-.69.25-1.28.17-1.4-.07-.13-.27-.2-.57-.35Z"
      />
    </svg>
  );
});

export const GmailIcon = forwardRef<SVGSVGElement, BrandIconProps>(function GmailIcon(props, ref) {
  return (
    <svg ref={ref} width={24} height={24} viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path fill="#EA4335" d="M6 24.5V9.74l10 7.58 10-7.58V24.5h-3.28V14.85L16 19.86l-6.72-5.01v9.65H6Z" />
      <path fill="#34A853" d="M22.72 24.5H26V9.74l-3.28 2.5V24.5Z" />
      <path fill="#4285F4" d="M6 24.5h3.28V12.24L6 9.74V24.5Z" />
      <path fill="#FBBC04" d="M6 9.74 9.28 12.24 16 17.25l6.72-5.01L26 9.74V7.5A1.5 1.5 0 0 0 24.5 6h-17A1.5 1.5 0 0 0 6 7.5v2.24Z" />
    </svg>
  );
});

export const ExcelIcon = forwardRef<SVGSVGElement, BrandIconProps>(function ExcelIcon(props, ref) {
  return (
    <svg ref={ref} width={24} height={24} viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path fill="#107C41" d="M18.75 4H10a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V11.25L18.75 4Z" />
      <path fill="#33C481" d="M18.75 4v5.25A2 2 0 0 0 20.75 11H26L18.75 4Z" />
      <path fill="#185C37" d="M6 8.5h10v15H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
      <path
        fill="#fff"
        d="m8.61 12.1 1.95 3.17 1.94-3.17h2.05l-2.85 4.39 2.92 4.46h-2.13l-1.99-3.22-2 3.22H6.39l2.97-4.45-2.81-4.4h2.06Z"
      />
    </svg>
  );
});

export const PdfIcon = forwardRef<SVGSVGElement, BrandIconProps>(function PdfIcon(props, ref) {
  return (
    <svg ref={ref} width={24} height={24} viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path fill="#E53935" d="M18.75 4H10a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V11.25L18.75 4Z" />
      <path fill="#FF8A80" d="M18.75 4v5.25A2 2 0 0 0 20.75 11H26L18.75 4Z" />
      <path
        fill="#fff"
        d="M10.2 21.4v-7h2.82c1.6 0 2.54.9 2.54 2.3 0 1.47-.95 2.35-2.54 2.35h-1.2v2.35H10.2Zm1.62-3.72h1.02c.72 0 1.13-.35 1.13-.98 0-.61-.41-.95-1.13-.95h-1.02v1.93Zm5.16 3.72v-7h2.52c2.06 0 3.4 1.34 3.4 3.48 0 2.16-1.34 3.52-3.4 3.52h-2.52Zm1.63-1.38h.77c1.18 0 1.87-.73 1.87-2.14 0-1.4-.69-2.1-1.87-2.1h-.77v4.24Zm5.57 1.38v-7h4.54v1.38h-2.92v1.54h2.5v1.36h-2.5v2.72h-1.62Z"
      />
    </svg>
  );
});
