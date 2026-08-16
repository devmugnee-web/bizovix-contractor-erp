import type { ReactNode } from "react";
import Image from "next/image";

export interface PrintableDocumentData {
  companyName: string;
  companyLogoUrl?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  reference: string;
  date: string;
  recipient: string;
  recipientOrganization?: string;
  recipientAddress?: string;
  subject: string;
  body: string;
  tenderId?: string;
  work?: string;
  signatory: string;
  designation: string;
}

function Letterhead({ data }: { data: PrintableDocumentData }) {
  const contacts = [data.companyPhone, data.companyEmail, data.companyWebsite].filter(Boolean);
  return (
    <header className="document-letterhead">
      <div className="flex items-start gap-4">
        {data.companyLogoUrl ? (
          <Image
            unoptimized
            width={64}
            height={64}
            className="h-16 w-16 object-contain"
            src={data.companyLogoUrl}
            alt="Company logo"
          />
        ) : null}
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-[22px] font-bold leading-tight text-slate-900">{data.companyName}</h2>
          {data.companyAddress ? (
            <p className="mt-1 text-[11px] text-slate-600">{data.companyAddress}</p>
          ) : null}
          {contacts.length ? (
            <p className="mt-1 text-[11px] text-slate-600">{contacts.join("  •  ")}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 border-b border-slate-400" />
    </header>
  );
}
function OptionalLine({ children }: { children?: ReactNode }) {
  return children ? <p>{children}</p> : null;
}
function DocumentSignature({ data }: { data: PrintableDocumentData }) {
  return (
    <footer className="document-signature mt-10 break-inside-avoid text-[12px] leading-5 text-slate-900">
      <p>Sincerely,</p>
      <div className="h-16" aria-hidden="true" />
      <p className="font-semibold">{data.signatory || "Authorized Signatory"}</p>
      {data.designation ? <p>{data.designation}</p> : null}
      <p>{data.companyName}</p>
    </footer>
  );
}

export function PrintableDocument({
  data,
  previewReady,
}: {
  data: PrintableDocumentData;
  previewReady: boolean;
}) {
  const bodyIncludesGreeting = /^\s*dear\b/i.test(data.body);
  return (
    <article
      id="printable-document"
      className={`printable-document mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white px-[18mm] py-[15mm] text-slate-900 shadow-card ${previewReady ? "" : "opacity-70"}`}
      aria-label="Printable document preview"
    >
      <Letterhead data={data} />
      <div className="mt-7 flex justify-between gap-6 text-[12px]">
        <p>
          <span className="font-semibold">Reference:</span> {data.reference || "—"}
        </p>
        <p className="whitespace-nowrap">
          <span className="font-semibold">Date:</span> {data.date || "—"}
        </p>
      </div>
      <section className="mt-7 text-[12px] leading-6">
        <p className="font-semibold">To:</p>
        <OptionalLine>{data.recipient || "Recipient Name"}</OptionalLine>
        <OptionalLine>{data.recipientOrganization}</OptionalLine>
        <OptionalLine>{data.recipientAddress}</OptionalLine>
      </section>
      <p className="mt-7 break-inside-avoid text-[12px] font-bold leading-6">
        Subject: {data.subject || "—"}
      </p>
      <section className="document-body mt-6 whitespace-pre-wrap text-justify text-[12px] leading-7">
        {!bodyIncludesGreeting ? <p className="mb-5">Dear Sir/Madam,</p> : null}
        <p>{data.body}</p>
      </section>
      {data.tenderId || data.work ? (
        <section className="mt-7 break-inside-avoid rounded-sm border border-slate-300 p-3 text-[12px] leading-6">
          {data.tenderId ? (
            <p>
              <span className="font-semibold">Tender ID:</span> {data.tenderId}
            </p>
          ) : null}
          {data.work ? (
            <p>
              <span className="font-semibold">Tender / Work:</span> {data.work}
            </p>
          ) : null}
        </section>
      ) : null}
      <DocumentSignature data={data} />
    </article>
  );
}
