"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Eye,
  FileCheck2,
  FileText,
  Info,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { useCmsWorks, useProjectBills } from "@bizovix/api-client";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type ReferenceBillStatus = "Approved" | "Under Processing" | "Submitted" | "Draft" | "Not Submitted" | "Payment Released";

interface ReferenceBillRow {
  id: string;
  tid: string;
  project: string;
  workDescription: string;
  billNo: string;
  billDate: string;
  amount: string;
  submittedTo: string;
  status: ReferenceBillStatus;
  updatedAt: string;
}

const FIRST_PAGE_ROWS: ReferenceBillRow[] = [
  { id: "1", tid: "TID-2024-1258", project: "NBR Building Construction", workDescription: "Foundation Work", billNo: "BILL-2024-001", billDate: "05 May 2024", amount: "1,250,000.00", submittedTo: "Project Engineer", status: "Approved", updatedAt: "05 May 2024" },
  { id: "2", tid: "TID-2024-1257", project: "NBR Building Construction", workDescription: "Column Work", billNo: "BILL-2024-002", billDate: "20 May 2024", amount: "2,750,000.00", submittedTo: "Project Engineer", status: "Under Processing", updatedAt: "22 May 2024" },
  { id: "3", tid: "TID-2024-1256", project: "NBR Building Construction", workDescription: "Beam Work", billNo: "BILL-2024-003", billDate: "10 Jun 2024", amount: "1,850,000.00", submittedTo: "Project Engineer", status: "Submitted", updatedAt: "10 Jun 2024" },
  { id: "4", tid: "TID-2024-1255", project: "Road & Drain Project", workDescription: "Road Work", billNo: "BILL-2024-004", billDate: "25 Jun 2024", amount: "3,200,000.00", submittedTo: "Project Engineer", status: "Draft", updatedAt: "25 Jun 2024" },
  { id: "5", tid: "TID-2024-1254", project: "School Building Project", workDescription: "RCC Work", billNo: "-", billDate: "-", amount: "-", submittedTo: "-", status: "Not Submitted", updatedAt: "-" },
  { id: "6", tid: "TID-2024-1253", project: "NBR Building Construction", workDescription: "Slab Work", billNo: "-", billDate: "-", amount: "-", submittedTo: "-", status: "Not Submitted", updatedAt: "-" },
  { id: "7", tid: "TID-2024-1252", project: "Road & Drain Project", workDescription: "Drain Work", billNo: "BILL-2024-005", billDate: "05 Jul 2024", amount: "1,650,000.00", submittedTo: "Project Engineer", status: "Submitted", updatedAt: "05 Jul 2024" },
  { id: "8", tid: "TID-2024-1251", project: "School Building Project", workDescription: "Brick Work", billNo: "-", billDate: "-", amount: "-", submittedTo: "-", status: "Draft", updatedAt: "12 Jul 2024" },
  { id: "9", tid: "TID-2024-1250", project: "NBR Building Construction", workDescription: "Plaster Work", billNo: "-", billDate: "-", amount: "-", submittedTo: "-", status: "Draft", updatedAt: "15 Jul 2024" },
  { id: "10", tid: "TID-2024-1249", project: "Health Complex Project", workDescription: "Electrical Work", billNo: "-", billDate: "-", amount: "-", submittedTo: "-", status: "Not Submitted", updatedAt: "-" },
];

const EXTRA_ROWS: ReferenceBillRow[] = Array.from({ length: 14 }, (_, index) => {
  const number = 1248 - index;
  const statuses: ReferenceBillStatus[] = ["Submitted", "Draft", "Under Processing", "Submitted", "Payment Released"];
  const status = statuses[index % statuses.length];
  return {
    id: String(index + 11),
    tid: `TID-2024-${number}`,
    project: index % 2 ? "Road & Drain Project" : "NBR Building Construction",
    workDescription: ["Finishing Work", "Earth Work", "Painting Work", "Sanitary Work"][index % 4] ?? "Finishing Work",
    billNo: `BILL-2024-${String(index + 6).padStart(3, "0")}`,
    billDate: `${String((index % 27) + 1).padStart(2, "0")} Aug 2024`,
    amount: `${(850000 + index * 125000).toLocaleString("en-US")}.00`,
    submittedTo: "Project Engineer",
    status: status ?? "Submitted",
    updatedAt: `${String((index % 27) + 1).padStart(2, "0")} Aug 2024`,
  };
});

const ALL_ROWS = [...FIRST_PAGE_ROWS, ...EXTRA_ROWS];
const PROJECT_OPTIONS = ["NBR Building Construction", "Road & Drain Project", "School Building Project", "Health Complex Project"];
const WORK_OPTIONS = Array.from(new Set(ALL_ROWS.map((row) => row.workDescription)));
const STATUS_OPTIONS: ReferenceBillStatus[] = ["Draft", "Submitted", "Under Processing", "Approved", "Payment Released", "Not Submitted"];

const STATUS_CLASS: Record<ReferenceBillStatus, string> = {
  Approved: "bg-[#e9f8ec] text-[#249b4a]",
  "Under Processing": "bg-[#f1eafe] text-[#7047d9]",
  Submitted: "bg-[#eaf3ff] text-[#1767c9]",
  Draft: "bg-[#f1f4f8] text-[#53627a]",
  "Not Submitted": "bg-[#fff0f1] text-[#d83b4b]",
  "Payment Released": "bg-[#e5faf6] text-[#0f9f8b]",
};

const CONTROL_CLASS = "h-[38px] w-full rounded-[5px] border border-[#dbe3f0] bg-white px-3 text-[11px] font-medium text-[#0b1f4b] outline-none transition focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10";

function KpiCard({ label, value, tone, icon: Icon }: { label: string; value: string; tone: "blue" | "orange" | "purple" | "green" | "teal"; icon: React.ComponentType<{ className?: string }> }) {
  const tones = {
    blue: "bg-[#e9f2ff] text-[#1267df]",
    orange: "bg-[#fff3df] text-[#f49a19]",
    purple: "bg-[#f0e8ff] text-[#814ee8]",
    green: "bg-[#e8f8eb] text-[#28a655]",
    teal: "bg-[#e3f8f5] text-[#12a995]",
  };
  return (
    <div className="flex h-[94px] min-w-0 items-center rounded-[7px] border border-[#dfe6f1] bg-white px-4 shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
      <span className={cn("flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full", tones[tone])}>
        <Icon className="h-[22px] w-[22px]" />
      </span>
      <span className="ml-4 min-w-0">
        <span className="block whitespace-nowrap text-[10px] font-semibold text-[#172b55]">{label}</span>
        <span className="mt-2 block text-[20px] font-bold leading-none text-[#071b49]">{value}</span>
      </span>
    </div>
  );
}

export function BillSubmissionWorkspace() {
  useSetBreadcrumb([
    { label: "Projects", href: "/cms/ongoing-works" },
    { label: "Project Documentation", href: "/cms/documentation" },
    { label: "Bill Submission" },
  ]);

  const cmsProjects = useCmsWorks({ limit: 100 });
  const projectBills = useProjectBills({ limit: 100 });
  const realProjects = React.useMemo(() => cmsProjects.data?.items ?? [], [cmsProjects.data?.items]);
  const billsByNumber = React.useMemo(
    () => new Map((projectBills.data?.items ?? []).map((bill) => [bill.billNo, bill])),
    [projectBills.data?.items],
  );
  const [selectedCmsProjectId, setSelectedCmsProjectId] = React.useState("");
  const [searchDraft, setSearchDraft] = React.useState("");
  const [projectDraft, setProjectDraft] = React.useState("");
  const [workDraft, setWorkDraft] = React.useState("");
  const [statusDraft, setStatusDraft] = React.useState("");
  const [filters, setFilters] = React.useState({ search: "", project: "", work: "", status: "" });
  const [page, setPage] = React.useState(1);
  const [viewing, setViewing] = React.useState<ReferenceBillRow | null>(null);

  const filteredRows = React.useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return ALL_ROWS.filter((row) => {
      if (search && !row.tid.toLowerCase().includes(search)) return false;
      if (filters.project && row.project !== filters.project) return false;
      if (filters.work && row.workDescription !== filters.work) return false;
      if (filters.status && row.status !== filters.status) return false;
      return true;
    });
  }, [filters]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 10));
  const visibleRows = filteredRows.slice((page - 1) * 10, page * 10);
  const startEntry = filteredRows.length ? (page - 1) * 10 + 1 : 0;
  const endEntry = Math.min(page * 10, filteredRows.length);
  const effectiveCmsProjectId = selectedCmsProjectId || realProjects[0]?.id || "";
  const selectedCmsProject = realProjects.find((project) => project.id === effectiveCmsProjectId) ?? realProjects[0];
  const createHref = selectedCmsProject ? `/cms/bills/create?cmsWorkId=${selectedCmsProject.id}` : "/cms/bills/create";
  function applyFilters() {
    setFilters({ search: searchDraft, project: projectDraft, work: workDraft, status: statusDraft });
    setPage(1);
  }

  function resetFilters() {
    setSearchDraft("");
    setProjectDraft("");
    setWorkDraft("");
    setStatusDraft("");
    setFilters({ search: "", project: "", work: "", status: "" });
    setPage(1);
  }

  return (
    <div className="min-h-full bg-[#f8faff] px-4 pb-5 pt-3 text-[#0b1f4b] sm:px-5 xl:pl-5 xl:pr-6">
      <div className="flex min-h-[77px] flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h1 className="text-[25px] font-bold leading-tight tracking-[-0.02em] text-[#071b49]">Bill Submission</h1>
          <p className="mt-1 text-[12px] text-[#40577f]">Create and manage bill submissions for project</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative block h-[48px] w-full rounded-[6px] border border-[#dce4ef] bg-white px-4 pt-[7px] shadow-[0_1px_3px_rgba(20,39,74,0.03)] sm:w-[250px]">
            <span className="block text-[9px] font-medium text-[#60718e]">Select Project</span>
            <select
              aria-label="Select Project"
              value={effectiveCmsProjectId}
              onChange={(event) => setSelectedCmsProjectId(event.target.value)}
              className="absolute inset-0 h-full w-full appearance-none bg-transparent px-4 pb-1 pt-[18px] text-[12px] font-bold text-[#10244c] outline-none"
            >
              {realProjects.length ? realProjects.map((project) => <option key={project.id} value={project.id}>{project.workName}</option>) : <option value="">NBR Building Construction</option>}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#071b49]" />
          </label>
          <Link href={createHref} className="inline-flex h-[38px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[#d7e0ec] bg-white px-4 text-[12px] font-semibold text-[#075ed7] shadow-[0_1px_2px_rgba(13,31,70,0.03)] hover:border-[#0b63e5] hover:bg-[#f5f9ff]">
            <Plus className="h-4 w-4" />
            New Bill Submission
          </Link>
        </div>
      </div>

      <section className="rounded-[7px] border border-[#dfe6f1] bg-white px-[18px] py-[17px] shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.16fr_1fr_1.12fr_1fr_auto_auto]">
          <label className="block min-w-0">
            <span className="mb-[7px] block text-[10px] font-medium text-[#33496f]">Search by TID</span>
            <span className="relative block">
              <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} placeholder="Enter Tender ID (TID)" className={cn(CONTROL_CLASS, "pr-10 placeholder:text-[#7c8ca6]")} />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#31476d]" />
            </span>
          </label>
          <label className="block min-w-0">
            <span className="mb-[7px] block text-[10px] font-medium text-[#33496f]">Project</span>
            <select value={projectDraft} onChange={(event) => setProjectDraft(event.target.value)} className={CONTROL_CLASS}>
              <option value="">All Projects</option>
              {PROJECT_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-[7px] block text-[10px] font-medium text-[#33496f]">Work Description</span>
            <select value={workDraft} onChange={(event) => setWorkDraft(event.target.value)} className={CONTROL_CLASS}>
              <option value="">All Work Descriptions</option>
              {WORK_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-[7px] block text-[10px] font-medium text-[#33496f]">Bill Status</span>
            <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} className={CONTROL_CLASS}>
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <button type="button" onClick={applyFilters} className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[5px] bg-[#0765e9] px-5 text-[11px] font-semibold text-white shadow-[0_3px_9px_rgba(7,101,233,0.2)] hover:bg-[#0458ce]">
            <Search className="h-4 w-4" /> Search
          </button>
          <button type="button" onClick={resetFilters} className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[5px] border border-[#d9e1ed] bg-white px-5 text-[11px] font-semibold text-[#33496f] hover:bg-[#f7f9fc]">
            <RotateCcw className="h-3.5 w-3.5 text-[#e2b519]" /> Reset
          </button>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 xl:gap-4">
        <KpiCard label="Total Bills" value="24" tone="blue" icon={FileText} />
        <KpiCard label="Draft" value="6" tone="orange" icon={FileText} />
        <KpiCard label="Submitted" value="10" tone="blue" icon={FileCheck2} />
        <KpiCard label="Under Processing" value="5" tone="purple" icon={FileText} />
        <KpiCard label="Approved" value="2" tone="green" icon={CircleDollarSign} />
        <KpiCard label="Payment Released" value="1" tone="teal" icon={WalletCards} />
      </section>

      <section className="mt-4 overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1190px] table-fixed text-left text-[10px] text-[#10244c]">
            <colgroup>
              <col className="w-[42px]" /><col className="w-[102px]" /><col className="w-[145px]" /><col className="w-[120px]" /><col className="w-[105px]" /><col className="w-[100px]" /><col className="w-[105px]" /><col className="w-[105px]" /><col className="w-[105px]" /><col className="w-[100px]" /><col className="w-[95px]" />
            </colgroup>
            <thead>
              <tr className="h-[38px] border-b border-[#e2e8f1] bg-[#fbfcfe] text-[10px] font-semibold text-[#172c53]">
                {['SL', 'TID', 'Project', 'Work Description', 'Bill No', 'Bill Date', 'Bill Amount (BDT)', 'Submitted To', 'Bill Status', 'Last Updated', 'Action'].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.id} className="h-[47px] border-b border-[#e6ebf2] last:border-0 hover:bg-[#fbfdff]">
                  <td className="px-3">{(page - 1) * 10 + index + 1}</td>
                  <td className="px-3 font-semibold">{row.tid}</td>
                  <td className="truncate px-3" title={row.project}>{row.project}</td>
                  <td className="truncate px-3" title={row.workDescription}>{row.workDescription}</td>
                  <td className="px-3">{row.billNo}</td>
                  <td className="px-3">{row.billDate}</td>
                  <td className="px-3 font-medium">{row.amount}</td>
                  <td className="px-3">{row.submittedTo}</td>
                  <td className="px-3"><span className={cn("inline-flex whitespace-nowrap rounded-[5px] px-2.5 py-[5px] text-[9px] font-semibold leading-none", STATUS_CLASS[row.status])}>{row.status}</span></td>
                  <td className="px-3">{row.updatedAt}</td>
                  <td className="px-3">
                    {row.status === "Not Submitted" ? (
                      <Link href={createHref} aria-label={`Create bill for ${row.tid}`} title="Create bill" className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] text-[#10244c] hover:border-[#0b63e5] hover:text-[#0b63e5]"><Plus className="h-4 w-4" /></Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        {billsByNumber.has(row.billNo) ? <Link href={`/cms/bills/${billsByNumber.get(row.billNo)!.id}`} aria-label={`View ${row.billNo}`} title="View" className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5]"><Eye className="h-3.5 w-3.5" /></Link> : <button type="button" onClick={() => setViewing(row)} aria-label={`View ${row.billNo}`} title="View" className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5]"><Eye className="h-3.5 w-3.5" /></button>}
                        {billsByNumber.get(row.billNo)?.status === "DRAFT" ? <Link href={`/cms/bills/${billsByNumber.get(row.billNo)!.id}/edit`} aria-label={`Edit ${row.billNo}`} title="Edit" className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5]"><Pencil className="h-3.5 w-3.5" /></Link> : <button type="button" disabled aria-label={`Edit unavailable for ${row.billNo}`} title="Edit is available for linked draft bills" className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] text-[#10244c]"><Pencil className="h-3.5 w-3.5" /></button>}
                        <button type="button" onClick={() => setViewing(row)} aria-label={`More actions for ${row.billNo}`} title="More actions" className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5]"><MoreVertical className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!visibleRows.length && <tr><td colSpan={11} className="h-[90px] text-center text-[11px] text-[#6d7e99]">No bill submissions found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex h-[58px] items-center justify-between gap-4 border-t border-[#e2e8f1] px-3 text-[10px] text-[#40577f]">
          <span>Showing {startEntry} to {endEntry} of {filteredRows.length} entries</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page" className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#dce4ef] disabled:text-[#bcc6d5]"><ChevronLeft className="h-4 w-4" /></button>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={cn("flex h-[30px] min-w-[30px] items-center justify-center rounded-[5px] border px-2 font-semibold", page === pageNumber ? "border-[#0765e9] bg-[#0765e9] text-white" : "border-[#dce4ef] bg-white text-[#10244c]")}>{pageNumber}</button>)}
            <button type="button" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next page" className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#dce4ef] disabled:text-[#bcc6d5]"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      <div className="mt-6 flex min-h-[52px] items-center gap-3 rounded-[5px] border border-[#e1e9f7] bg-[#f0f5ff] px-4 text-[10.5px] text-[#314b78]">
        <Info className="h-[21px] w-[21px] shrink-0 text-[#1267df]" />
        <span>You can create new bill submissions, edit draft bills, and track the status of all submitted bills.</span>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b49]/30 p-4" role="dialog" aria-modal="true" aria-label="Bill details">
          <div className="w-full max-w-[440px] rounded-lg border border-[#dce4ef] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e2e8f1] px-5 py-4">
              <div><h2 className="text-[15px] font-bold text-[#071b49]">{viewing.billNo}</h2><p className="mt-1 text-[11px] text-[#60718e]">{viewing.tid}</p></div>
              <button type="button" onClick={() => setViewing(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-[12px]">
              <div><dt className="text-[#71819b]">Project</dt><dd className="mt-1 font-semibold">{viewing.project}</dd></div>
              <div><dt className="text-[#71819b]">Work Description</dt><dd className="mt-1 font-semibold">{viewing.workDescription}</dd></div>
              <div><dt className="text-[#71819b]">Bill Date</dt><dd className="mt-1 font-semibold">{viewing.billDate}</dd></div>
              <div><dt className="text-[#71819b]">Bill Amount</dt><dd className="mt-1 font-semibold">{viewing.amount}</dd></div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
