"use client";

import { useState } from "react";
import { BriefcaseBusiness, FileCheck2, Pencil, Plus, UserSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { HrEmptyState } from "@/components/shared/hr-empty-state";
import {
  useCandidatesQuery,
  useCreateCandidateMutation,
  useCreateJobApplicationMutation,
  useCreateJobOpeningMutation,
  useDepartmentsQuery,
  useDesignationsQuery,
  useJobApplicationsQuery,
  useJobOpeningsQuery,
  useUpdateJobApplicationMutation,
  useUpdateJobOpeningMutation,
} from "@/hooks/use-hr-query";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApplicationStage, JobApplicationRecord, JobOpeningRecord } from "@/types/hr";

const STAGE_LABELS: Record<ApplicationStage, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  ASSESSMENT: "Assessment",
  REFERENCE_CHECK: "Reference Check",
  SELECTED: "Selected",
  OFFER_SENT: "Offer Sent",
  OFFER_ACCEPTED: "Offer Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const STAGE_ORDER: ApplicationStage[] = [
  "APPLIED", "SCREENING", "SHORTLISTED", "INTERVIEW", "ASSESSMENT", "REFERENCE_CHECK", "SELECTED", "OFFER_SENT", "OFFER_ACCEPTED", "REJECTED", "WITHDRAWN",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function NewJobOpeningDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const departmentsQuery = useDepartmentsQuery(open);
  const designationsQuery = useDesignationsQuery(open);
  const createMutation = useCreateJobOpeningMutation();
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [numberOfPositions, setNumberOfPositions] = useState("1");
  const [description, setDescription] = useState("");

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        departmentId: departmentId || undefined,
        designationId: designationId || undefined,
        numberOfPositions: Number(numberOfPositions) || 1,
        description: description.trim() || undefined,
      });
      toast.success("Job opening created.");
      setTitle("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create this job opening.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,480px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">New Job Opening</DialogTitle>
        </div>
        <div className="space-y-3 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Title</label>
            <Input className="h-9 rounded-[8px] text-[13px]" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Department</label>
              <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">— None —</option>
                {(departmentsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Designation</label>
              <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={designationId} onChange={(e) => setDesignationId(e.target.value)}>
                <option value="">— None —</option>
                {(designationsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Number of Positions</label>
            <Input className="h-9 w-24 rounded-[8px] text-[13px]" type="number" min={1} value={numberOfPositions} onChange={(e) => setNumberOfPositions(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Description</label>
            <Input className="h-9 rounded-[8px] text-[13px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={createMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditJobOpeningForm({ opening, onClose }: { opening: JobOpeningRecord; onClose: () => void }) {
  const departmentsQuery = useDepartmentsQuery(true);
  const designationsQuery = useDesignationsQuery(true);
  const updateMutation = useUpdateJobOpeningMutation();
  const [title, setTitle] = useState(opening.title);
  const [departmentId, setDepartmentId] = useState(opening.departmentId ?? "");
  const [designationId, setDesignationId] = useState(opening.designationId ?? "");
  const [numberOfPositions, setNumberOfPositions] = useState(String(opening.numberOfPositions));
  const [description, setDescription] = useState(opening.description ?? "");

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        jobOpeningId: opening.id,
        input: {
          title: title.trim(),
          departmentId: departmentId || null,
          designationId: designationId || null,
          numberOfPositions: Number(numberOfPositions) || 1,
          description: description.trim() || null,
        },
      });
      toast.success("Job opening updated.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this job opening.");
    }
  }

  return (
    <>
      <div className="space-y-3 px-5 py-5">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Title</label>
          <Input className="h-9 rounded-[8px] text-[13px]" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Department</label>
            <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— None —</option>
              {(departmentsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Designation</label>
            <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={designationId} onChange={(e) => setDesignationId(e.target.value)}>
              <option value="">— None —</option>
              {(designationsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Number of Positions</label>
          <Input className="h-9 w-24 rounded-[8px] text-[13px]" type="number" min={1} value={numberOfPositions} onChange={(e) => setNumberOfPositions(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Description</label>
          <Input className="h-9 rounded-[8px] text-[13px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
        <Button variant="outline" onClick={onClose} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
        <Button onClick={() => void handleSubmit()} disabled={updateMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">Save</Button>
      </div>
    </>
  );
}

function EditJobOpeningDialog({ opening, onClose }: { opening: JobOpeningRecord | null; onClose: () => void }) {
  return (
    <Dialog open={opening !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(94vw,480px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">Edit Job Opening</DialogTitle>
        </div>
        {opening ? <EditJobOpeningForm key={opening.id} opening={opening} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NewCandidateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createMutation = useCreateCandidateMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [resumeNote, setResumeNote] = useState("");

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        source: source.trim() || undefined,
        resumeNote: resumeNote.trim() || undefined,
      });
      toast.success("Candidate added.");
      setName("");
      setEmail("");
      setPhone("");
      setSource("");
      setResumeNote("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this candidate.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,440px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">New Candidate</DialogTitle>
        </div>
        <div className="space-y-3 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Name</label>
            <Input className="h-9 rounded-[8px] text-[13px]" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Email</label>
              <Input className="h-9 rounded-[8px] text-[13px]" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Phone</label>
              <Input className="h-9 rounded-[8px] text-[13px]" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Source</label>
            <Input className="h-9 rounded-[8px] text-[13px]" placeholder="e.g. LinkedIn, Referral" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Resume Note</label>
            <textarea className="min-h-[70px] w-full rounded-[8px] border border-border bg-white px-3 py-2 text-[13px]" placeholder="Summary, skills, links, etc." value={resumeNote} onChange={(e) => setResumeNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={createMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">Add Candidate</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewApplicationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const candidatesQuery = useCandidatesQuery(open);
  const jobOpeningsQuery = useJobOpeningsQuery(open);
  const createMutation = useCreateJobApplicationMutation();
  const [candidateId, setCandidateId] = useState("");
  const [jobOpeningId, setJobOpeningId] = useState("");
  const openJobOpenings = (jobOpeningsQuery.data ?? []).filter((item) => item.status === "OPEN");

  async function handleSubmit() {
    if (!candidateId || !jobOpeningId) {
      toast.error("Select both a candidate and a job opening.");
      return;
    }
    try {
      await createMutation.mutateAsync({ candidateId, jobOpeningId, appliedDate: todayIso() });
      toast.success("Application recorded.");
      setCandidateId("");
      setJobOpeningId("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record this application.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,440px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">New Application</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">Link a candidate to a job opening.</DialogDescription>
        </div>
        <div className="space-y-3 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Candidate</label>
            <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
              <option value="">Select candidate...</option>
              {(candidatesQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Job Opening</label>
            <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={jobOpeningId} onChange={(e) => setJobOpeningId(e.target.value)}>
              <option value="">Select job opening...</option>
              {openJobOpenings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            {openJobOpenings.length === 0 ? <p className="mt-1 text-[11px] text-[#c2410c]">No open job openings available.</p> : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={createMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">Record Application</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationDetailsForm({ application, onClose }: { application: JobApplicationRecord; onClose: () => void }) {
  const updateMutation = useUpdateJobApplicationMutation();
  const [interviewDate, setInterviewDate] = useState(application.interviewDate?.slice(0, 10) ?? "");
  const [interviewNotes, setInterviewNotes] = useState(application.interviewNotes ?? "");
  const [assessmentScore, setAssessmentScore] = useState(application.assessmentScore ?? "");
  const [referenceCheckNotes, setReferenceCheckNotes] = useState(application.referenceCheckNotes ?? "");
  const [offeredSalary, setOfferedSalary] = useState(application.offeredSalary ?? "");
  const [offerDate, setOfferDate] = useState(application.offerDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(application.notes ?? "");

  async function handleSubmit() {
    try {
      await updateMutation.mutateAsync({
        jobApplicationId: application.id,
        input: {
          interviewDate: interviewDate || null,
          interviewNotes: interviewNotes.trim() || null,
          assessmentScore: assessmentScore === "" ? null : Number(assessmentScore),
          referenceCheckNotes: referenceCheckNotes.trim() || null,
          offeredSalary: offeredSalary === "" ? null : Number(offeredSalary),
          offerDate: offerDate || null,
          notes: notes.trim() || null,
        },
      });
      toast.success("Application details saved.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save these details.");
    }
  }

  return (
    <>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Interview Date</label>
            <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={interviewDate} onChange={setInterviewDate} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Assessment Score</label>
            <Input className="h-9 rounded-[8px] text-[13px]" type="number" min={0} max={100} value={assessmentScore} onChange={(e) => setAssessmentScore(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Interview Notes</label>
          <textarea className="min-h-[60px] w-full rounded-[8px] border border-border bg-white px-3 py-2 text-[13px]" value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Reference Check Notes</label>
          <textarea className="min-h-[60px] w-full rounded-[8px] border border-border bg-white px-3 py-2 text-[13px]" value={referenceCheckNotes} onChange={(e) => setReferenceCheckNotes(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Offered Salary</label>
            <Input className="h-9 rounded-[8px] text-[13px]" money value={offeredSalary} onChange={(e) => setOfferedSalary(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Offer Date</label>
            <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={offerDate} onChange={setOfferDate} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">General Notes</label>
          <textarea className="min-h-[60px] w-full rounded-[8px] border border-border bg-white px-3 py-2 text-[13px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
        <Button variant="outline" onClick={onClose} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
        <Button onClick={() => void handleSubmit()} disabled={updateMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">Save</Button>
      </div>
    </>
  );
}

function ApplicationDetailsDialog({ application, onClose }: { application: JobApplicationRecord | null; onClose: () => void }) {
  return (
    <Dialog open={application !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(94vw,480px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">Application Details</DialogTitle>
          {application ? <DialogDescription className="mt-1 text-[12px] text-[#77869c]">{application.candidate.name} · {application.jobOpening.title}</DialogDescription> : null}
        </div>
        {application ? <ApplicationDetailsForm key={application.id} application={application} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function RecruitmentSection() {
  const jobOpeningsQuery = useJobOpeningsQuery(true);
  const candidatesQuery = useCandidatesQuery(true);
  const applicationsQuery = useJobApplicationsQuery(true);
  const updateStageMutation = useUpdateJobApplicationMutation();
  const updateJobOpeningMutation = useUpdateJobOpeningMutation();

  const [newJobOpeningOpen, setNewJobOpeningOpen] = useState(false);
  const [newCandidateOpen, setNewCandidateOpen] = useState(false);
  const [newApplicationOpen, setNewApplicationOpen] = useState(false);
  const [editingOpening, setEditingOpening] = useState<JobOpeningRecord | null>(null);
  const [detailsApplication, setDetailsApplication] = useState<JobApplicationRecord | null>(null);

  const jobOpenings = jobOpeningsQuery.data ?? [];
  const candidates = candidatesQuery.data ?? [];
  const applications = applicationsQuery.data ?? [];

  async function handleStageChange(applicationId: string, stage: ApplicationStage) {
    try {
      await updateStageMutation.mutateAsync({ jobApplicationId: applicationId, input: { stage } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this application.");
    }
  }

  async function handleCloseOpening(jobOpeningId: string) {
    try {
      await updateJobOpeningMutation.mutateAsync({ jobOpeningId, input: { status: "CLOSED" } });
      toast.success("Job opening closed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not close this job opening.");
    }
  }

  return (
    <div className="m-4 flex flex-1 flex-col gap-4 overflow-y-auto lg:m-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white">
          <div className="flex items-center justify-between border-b border-[#e1e7f0] px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[#223754]">Job Openings ({jobOpenings.length})</h2>
            <Button onClick={() => setNewJobOpeningOpen(true)} className="h-7 rounded-[7px] bg-[#2f67e8] px-2.5 text-[11px] text-white hover:bg-[#2459ce]"><Plus className="h-3 w-3" /> New</Button>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {jobOpenings.length === 0 ? (
              <HrEmptyState compact icon={BriefcaseBusiness} title="No job openings yet" description="Create an opening to start recruitment." />
            ) : (
              <ul className="divide-y divide-[#eef1f6]">
                {jobOpenings.map((opening) => (
                  <li key={opening.id} className="flex items-center justify-between px-4 py-2.5 text-[12px]">
                    <div>
                      <div className="font-medium text-[#223754]">{opening.title}</div>
                      <div className="text-[10px] text-[#8592a5]">{opening.department?.name ?? "—"} · {opening.numberOfPositions} position(s) · {opening._count.applications} applicant(s)</div>
                      {opening.description ? <div className="mt-0.5 truncate text-[10px] text-[#a2adbc]" title={opening.description}>{opening.description}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-[10px] font-semibold", opening.status === "OPEN" ? "bg-[#e7f7ee] text-[#15925f]" : opening.status === "ON_HOLD" ? "bg-[#fff3e0] text-[#b96b09]" : "bg-[#f1f4f8] text-[#65758c]")}>{opening.status}</span>
                      <button type="button" onClick={() => setEditingOpening(opening)} className="text-[#8592a5] hover:text-[#2f67e8]" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                      {opening.status === "OPEN" ? <button type="button" onClick={() => void handleCloseOpening(opening.id)} className="text-[10px] font-semibold text-[#2f67e8] hover:underline">Close</button> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white">
          <div className="flex items-center justify-between border-b border-[#e1e7f0] px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[#223754]">Candidates ({candidates.length})</h2>
            <Button onClick={() => setNewCandidateOpen(true)} className="h-7 rounded-[7px] bg-[#2f67e8] px-2.5 text-[11px] text-white hover:bg-[#2459ce]"><Plus className="h-3 w-3" /> New</Button>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {candidates.length === 0 ? (
              <HrEmptyState compact icon={UserSearch} title="No candidates yet" description="Add a candidate to build your talent pool." />
            ) : (
              <ul className="divide-y divide-[#eef1f6]">
                {candidates.map((candidate) => (
                  <li key={candidate.id} className="px-4 py-2.5 text-[12px]">
                    <div className="font-medium text-[#223754]">{candidate.name}</div>
                    <div className="text-[10px] text-[#8592a5]">{[candidate.email, candidate.phone, candidate.source].filter(Boolean).join(" · ") || "—"}</div>
                    {candidate.resumeNote ? <div className="mt-0.5 truncate text-[10px] text-[#a2adbc]" title={candidate.resumeNote}>{candidate.resumeNote}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white">
        <div className="flex items-center justify-between border-b border-[#e1e7f0] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[#223754]">Applications ({applications.length})</h2>
          <Button onClick={() => setNewApplicationOpen(true)} className="h-7 rounded-[7px] bg-[#2f67e8] px-2.5 text-[11px] text-white hover:bg-[#2459ce]"><Plus className="h-3 w-3" /> New Application</Button>
        </div>
        {applications.length === 0 ? (
          <HrEmptyState compact icon={FileCheck2} title="No applications yet" description="New candidate applications will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[12px]">
              <thead className="bg-[#f7f9fc] text-[#5b6b83]">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Candidate</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Job Opening</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Applied</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Stage</th>
                  <th className="px-4 py-2.5 text-left font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id} className="border-t border-[#eef1f6]">
                    <td className="px-4 py-2.5 font-medium text-[#223754]">{application.candidate.name}</td>
                    <td className="px-4 py-2.5 text-[#4a5b73]">{application.jobOpening.title}</td>
                    <td className="px-4 py-2.5 text-[#4a5b73]">{formatDate(application.appliedDate)}</td>
                    <td className="px-4 py-2.5">
                      <select
                        className="h-8 rounded-[7px] border border-border bg-white px-2 text-[12px]"
                        value={application.stage}
                        onChange={(e) => void handleStageChange(application.id, e.target.value as ApplicationStage)}
                      >
                        {STAGE_ORDER.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => setDetailsApplication(application)} className="text-[11px] font-semibold text-[#2f67e8] hover:underline">Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewJobOpeningDialog open={newJobOpeningOpen} onOpenChange={setNewJobOpeningOpen} />
      <NewCandidateDialog open={newCandidateOpen} onOpenChange={setNewCandidateOpen} />
      <NewApplicationDialog open={newApplicationOpen} onOpenChange={setNewApplicationOpen} />
      <EditJobOpeningDialog opening={editingOpening} onClose={() => setEditingOpening(null)} />
      <ApplicationDetailsDialog application={detailsApplication} onClose={() => setDetailsApplication(null)} />
    </div>
  );
}
