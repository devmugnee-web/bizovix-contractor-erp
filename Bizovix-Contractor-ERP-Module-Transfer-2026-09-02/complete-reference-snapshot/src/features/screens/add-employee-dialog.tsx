"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Check, Plus, Settings2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { DepartmentDesignationManagerDialog } from "@/features/screens/department-designation-manager-dialog";
import {
  useBusinessUnitsQuery,
  useCostCentersQuery,
  useCreateDepartmentMutation,
  useCreateDesignationMutation,
  useCreateEmployeeMutation,
  useDepartmentsQuery,
  useDesignationsQuery,
  useDivisionsQuery,
  useEmployeesQuery,
  useGradesQuery,
  useLocationsQuery,
  usePayrollSettingsQuery,
  useUpdateEmployeeMutation,
} from "@/hooks/use-hr-query";
import { formatCurrency } from "@/lib/format";
import type { DepartmentRecord, DesignationRecord, EmployeeRecord, EmploymentType, EmployeeStatus, Gender, SalaryComponent, SalaryPaymentMethod } from "@/types/hr";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const lookupSelectClass = "h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px] text-foreground";

interface LookupSelectHandle {
  commitPending: () => Promise<string>;
}

const LookupSelect = forwardRef<LookupSelectHandle, {
  label: string;
  value: string;
  options: Array<DepartmentRecord | DesignationRecord>;
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<{ id: string } | null>;
  creating: boolean;
}>(function LookupSelect({
  label,
  value,
  options,
  onChange,
  onCreate,
  creating,
}, ref) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  async function confirmAdd() {
    const name = draft.trim();
    if (!name) return value;
    const created = await onCreate(name);
    if (created) {
      onChange(created.id);
      setDraft("");
      setAdding(false);
      return created.id;
    }
    return null;
  }

  useImperativeHandle(ref, () => ({
    commitPending: async () => {
      if (!adding || !draft.trim()) return value;
      const createdId = await confirmAdd();
      if (!createdId) throw new Error(`Could not save ${label.toLowerCase()}.`);
      return createdId;
    },
  }), [adding, draft, value]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-[11px] font-medium text-[#5b6b83]">{label}</label>
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#2f67e8] hover:underline">
          <Plus className="h-3 w-3" /> New
        </button>
      </div>
      {adding ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            className="h-9 flex-1 rounded-[8px] text-[13px]"
            placeholder={`${label} name`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmAdd();
              }
              if (event.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
          />
          <button type="button" onClick={() => void confirmAdd()} disabled={creating || !draft.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#2f67e8] text-white hover:bg-[#2459ce] disabled:opacity-50">
            <Check className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setAdding(false); setDraft(""); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#d7e0ec] text-[#5b6b83] hover:bg-[#f5f7fb]">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <select className={lookupSelectClass} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">— None —</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      )}
    </div>
  );
});

const DEFAULT_COMPONENTS: SalaryComponent[] = [
  { name: "Basic", percent: 50 },
  { name: "House Rent", percent: 25 },
  { name: "Medical Allowance", percent: 15 },
  { name: "Conveyance", percent: 10 },
];

interface FormState {
  employeeCode: string;
  name: string;
  fatherOrSpouseName: string;
  gender: Gender | "";
  dateOfBirth: string;
  phone: string;
  email: string;
  nationalId: string;
  presentAddress: string;
  permanentAddress: string;
  departmentId: string;
  designationId: string;
  gradeId: string;
  businessUnitId: string;
  divisionId: string;
  locationId: string;
  costCenterId: string;
  reportingManagerId: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  joiningDate: string;
  probationEndDate: string;
  contractEndDate: string;
  grossSalary: string;
  components: Array<{ name: string; percent: string }>;
  pfRate: string;
  paymentMethod: SalaryPaymentMethod;
  bankName: string;
  bankAccountNumber: string;
  mfsProvider: string;
  mfsAccountNumber: string;
  notes: string;
}

function emptyForm(defaultComponents: SalaryComponent[] = DEFAULT_COMPONENTS): FormState {
  return {
    employeeCode: "",
    name: "",
    fatherOrSpouseName: "",
    gender: "",
    dateOfBirth: "",
    phone: "",
    email: "",
    nationalId: "",
    presentAddress: "",
    permanentAddress: "",
    departmentId: "",
    designationId: "",
    gradeId: "",
    businessUnitId: "",
    divisionId: "",
    locationId: "",
    costCenterId: "",
    reportingManagerId: "",
    employmentType: "PERMANENT",
    status: "ACTIVE",
    joiningDate: todayIso(),
    probationEndDate: "",
    contractEndDate: "",
    grossSalary: "",
    components: defaultComponents.map((component) => ({ name: component.name, percent: String(component.percent) })),
    pfRate: "",
    paymentMethod: "CASH",
    bankName: "",
    bankAccountNumber: "",
    mfsProvider: "",
    mfsAccountNumber: "",
    notes: "",
  };
}

function fromEmployee(employee: EmployeeRecord): FormState {
  return {
    employeeCode: employee.employeeCode,
    name: employee.name,
    fatherOrSpouseName: employee.fatherOrSpouseName ?? "",
    gender: employee.gender ?? "",
    dateOfBirth: employee.dateOfBirth?.slice(0, 10) ?? "",
    phone: employee.phone ?? "",
    email: employee.email ?? "",
    nationalId: employee.nationalId ?? "",
    presentAddress: employee.presentAddress ?? "",
    permanentAddress: employee.permanentAddress ?? "",
    departmentId: employee.departmentId ?? "",
    designationId: employee.designationId ?? "",
    gradeId: employee.gradeId ?? "",
    businessUnitId: employee.businessUnitId ?? "",
    divisionId: employee.divisionId ?? "",
    locationId: employee.locationId ?? "",
    costCenterId: employee.costCenterId ?? "",
    reportingManagerId: employee.reportingManagerId ?? "",
    employmentType: employee.employmentType,
    status: employee.status,
    joiningDate: employee.joiningDate.slice(0, 10),
    probationEndDate: employee.probationEndDate?.slice(0, 10) ?? "",
    contractEndDate: employee.contractEndDate?.slice(0, 10) ?? "",
    grossSalary: employee.grossSalary,
    components: employee.salaryComponents.length
      ? employee.salaryComponents.map((component) => ({ name: component.name, percent: String(component.percent) }))
      : DEFAULT_COMPONENTS.map((component) => ({ name: component.name, percent: String(component.percent) })),
    pfRate: employee.pfRate ?? "",
    paymentMethod: employee.paymentMethod,
    bankName: employee.bankName ?? "",
    bankAccountNumber: employee.bankAccountNumber ?? "",
    mfsProvider: employee.mfsProvider ?? "",
    mfsAccountNumber: employee.mfsAccountNumber ?? "",
    notes: employee.notes ?? "",
  };
}

const fieldLabel = "mb-1.5 block text-[11px] font-medium text-[#5b6b83]";
const fieldInput = "h-9 rounded-[8px] text-[13px]";
const selectClass = "h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px] text-foreground";

export function AddEmployeeDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: EmployeeRecord | null;
}) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [managerOpen, setManagerOpen] = useState(false);
  const departmentsQuery = useDepartmentsQuery(open);
  const designationsQuery = useDesignationsQuery(open);
  const gradesQuery = useGradesQuery(open);
  const businessUnitsQuery = useBusinessUnitsQuery(open);
  const divisionsQuery = useDivisionsQuery(open);
  const locationsQuery = useLocationsQuery(open);
  const costCentersQuery = useCostCentersQuery(open);
  const allEmployeesQuery = useEmployeesQuery(open);
  const payrollSettingsQuery = usePayrollSettingsQuery(open && !employee);
  const createMutation = useCreateEmployeeMutation();
  const updateMutation = useUpdateEmployeeMutation();
  const createDepartmentMutation = useCreateDepartmentMutation();
  const createDesignationMutation = useCreateDesignationMutation();
  const departmentSelectRef = useRef<LookupSelectHandle>(null);
  const designationSelectRef = useRef<LookupSelectHandle>(null);
  const isEdit = Boolean(employee);
  const saving = createMutation.isPending || updateMutation.isPending;

  async function createDepartment(name: string) {
    try {
      return await createDepartmentMutation.mutateAsync(name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add department.");
      return null;
    }
  }

  async function createDesignation(name: string) {
    try {
      return await createDesignationMutation.mutateAsync(name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add designation.");
      return null;
    }
  }

  useEffect(() => {
    if (open) {
      setForm(employee ? fromEmployee(employee) : emptyForm(payrollSettingsQuery.data?.salaryComponents));
    }
  }, [open, employee, payrollSettingsQuery.data]);

  const percentTotal = useMemo(() => form.components.reduce((sum, component) => sum + (Number(component.percent) || 0), 0), [form.components]);
  const gross = Number(form.grossSalary) || 0;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateComponent(index: number, patch: Partial<{ name: string; percent: string }>) {
    setForm((prev) => ({ ...prev, components: prev.components.map((component, i) => (i === index ? { ...component, ...patch } : component)) }));
  }

  function addComponent() {
    setForm((prev) => ({ ...prev, components: [...prev.components, { name: "", percent: "0" }] }));
  }

  function removeComponent(index: number) {
    setForm((prev) => ({ ...prev, components: prev.components.filter((_, i) => i !== index) }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Employee name is required.");
      return;
    }
    if (!form.joiningDate) {
      toast.error("Joining date is required.");
      return;
    }
    if (!gross || gross <= 0) {
      toast.error("Gross salary must be greater than zero.");
      return;
    }
    if (form.components.some((component) => !component.name.trim())) {
      toast.error("Every salary component needs a name.");
      return;
    }
    if (Math.abs(percentTotal - 100) > 0.01) {
      toast.error(`Salary components must add up to 100% — currently ${percentTotal.toFixed(2)}%.`);
      return;
    }

    let departmentId: string;
    let designationId: string;
    try {
      [departmentId, designationId] = await Promise.all([
        departmentSelectRef.current?.commitPending() ?? Promise.resolve(form.departmentId),
        designationSelectRef.current?.commitPending() ?? Promise.resolve(form.designationId),
      ]);
    } catch {
      return;
    }

    const payload = {
      employeeCode: form.employeeCode.trim() || undefined,
      name: form.name.trim(),
      fatherOrSpouseName: form.fatherOrSpouseName.trim() || undefined,
      gender: form.gender || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      nationalId: form.nationalId.trim() || undefined,
      presentAddress: form.presentAddress.trim() || undefined,
      permanentAddress: form.permanentAddress.trim() || undefined,
      departmentId: departmentId || undefined,
      designationId: designationId || undefined,
      gradeId: form.gradeId || undefined,
      businessUnitId: form.businessUnitId || undefined,
      divisionId: form.divisionId || undefined,
      locationId: form.locationId || undefined,
      costCenterId: form.costCenterId || undefined,
      reportingManagerId: form.reportingManagerId || undefined,
      employmentType: form.employmentType,
      status: form.status,
      joiningDate: form.joiningDate,
      probationEndDate: form.employmentType === "PROBATION" && form.probationEndDate ? form.probationEndDate : undefined,
      contractEndDate: form.employmentType === "CONTRACTUAL" && form.contractEndDate ? form.contractEndDate : undefined,
      grossSalary: gross,
      salaryComponents: form.components.map((component) => ({ name: component.name.trim(), percent: Number(component.percent) || 0 })),
      pfRate: form.pfRate.trim() ? Number(form.pfRate) : undefined,
      paymentMethod: form.paymentMethod,
      bankName: form.bankName.trim() || undefined,
      bankAccountNumber: form.bankAccountNumber.trim() || undefined,
      mfsProvider: form.mfsProvider.trim() || undefined,
      mfsAccountNumber: form.mfsAccountNumber.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (isEdit && employee) {
        const pfRate = form.pfRate.trim() ? Number(form.pfRate) : null;
        const probationEndDate = form.employmentType === "PROBATION" && form.probationEndDate ? form.probationEndDate : null;
        const contractEndDate = form.employmentType === "CONTRACTUAL" && form.contractEndDate ? form.contractEndDate : null;
        await updateMutation.mutateAsync({
          employeeId: employee.id,
          input: {
            ...payload,
            pfRate,
            probationEndDate,
            contractEndDate,
            departmentId: departmentId || null,
            designationId: designationId || null,
            gradeId: form.gradeId || null,
            businessUnitId: form.businessUnitId || null,
            divisionId: form.divisionId || null,
            locationId: form.locationId || null,
            costCenterId: form.costCenterId || null,
            reportingManagerId: form.reportingManagerId || null,
          },
        });
        toast.success(`${form.name} updated.`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`${form.name} added as an employee.`);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the employee.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,780px)] max-h-[88vh] overflow-y-auto rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">{isEdit ? "Edit Employee" : "Add Employee"}</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">
            Employee profile, employment details and salary structure.
          </DialogDescription>
        </div>

        <div className="grid gap-5 px-5 py-5">
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">Basic Information</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className={fieldLabel}>Employee Code</label>
                <Input className={fieldInput} value={form.employeeCode} onChange={(e) => update("employeeCode", e.target.value)} placeholder="Auto-generated" />
              </div>
              <div className="col-span-2">
                <label className={fieldLabel}>Full Name *</label>
                <Input className={fieldInput} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Employee full name" />
              </div>
              <div>
                <label className={fieldLabel}>Father / Spouse Name</label>
                <Input className={fieldInput} value={form.fatherOrSpouseName} onChange={(e) => update("fatherOrSpouseName", e.target.value)} />
              </div>
              <div>
                <label className={fieldLabel}>Gender</label>
                <select className={selectClass} value={form.gender} onChange={(e) => update("gender", e.target.value as Gender | "")}>
                  <option value="">Not specified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Date of Birth</label>
                <AppDateInput className={fieldInput} value={form.dateOfBirth} onChange={(value) => update("dateOfBirth", value)} />
              </div>
              <div>
                <label className={fieldLabel}>Phone</label>
                <Input className={fieldInput} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div>
                <label className={fieldLabel}>Email</label>
                <Input className={fieldInput} type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div>
                <label className={fieldLabel}>National ID</label>
                <Input className={fieldInput} value={form.nationalId} onChange={(e) => update("nationalId", e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={fieldLabel}>Present Address</label>
                <Input className={fieldInput} value={form.presentAddress} onChange={(e) => update("presentAddress", e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={fieldLabel}>Permanent Address</label>
                <Input className={fieldInput} value={form.permanentAddress} onChange={(e) => update("permanentAddress", e.target.value)} />
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">Employment</h3>
              <button type="button" onClick={() => setManagerOpen(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2f67e8] hover:underline">
                <Settings2 className="h-3.5 w-3.5" /> Manage Org & Job Structure
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <LookupSelect
                ref={departmentSelectRef}
                label="Department"
                value={form.departmentId}
                options={departmentsQuery.data ?? []}
                onChange={(id) => update("departmentId", id)}
                onCreate={createDepartment}
                creating={createDepartmentMutation.isPending}
              />
              <LookupSelect
                ref={designationSelectRef}
                label="Designation"
                value={form.designationId}
                options={designationsQuery.data ?? []}
                onChange={(id) => update("designationId", id)}
                onCreate={createDesignation}
                creating={createDesignationMutation.isPending}
              />
              <div>
                <label className={fieldLabel}>Grade</label>
                <select className={selectClass} value={form.gradeId} onChange={(e) => update("gradeId", e.target.value)}>
                  <option value="">— None —</option>
                  {(gradesQuery.data ?? []).map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Business Unit</label>
                <select className={selectClass} value={form.businessUnitId} onChange={(e) => update("businessUnitId", e.target.value)}>
                  <option value="">— None —</option>
                  {(businessUnitsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Division</label>
                <select className={selectClass} value={form.divisionId} onChange={(e) => update("divisionId", e.target.value)}>
                  <option value="">— None —</option>
                  {(divisionsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Location</label>
                <select className={selectClass} value={form.locationId} onChange={(e) => update("locationId", e.target.value)}>
                  <option value="">— None —</option>
                  {(locationsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Cost Center</label>
                <select className={selectClass} value={form.costCenterId} onChange={(e) => update("costCenterId", e.target.value)}>
                  <option value="">— None —</option>
                  {(costCentersQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Reporting Manager</label>
                <select className={selectClass} value={form.reportingManagerId} onChange={(e) => update("reportingManagerId", e.target.value)}>
                  <option value="">— None —</option>
                  {(allEmployeesQuery.data ?? []).filter((item) => item.id !== employee?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Joining Date *</label>
                <AppDateInput className={fieldInput} value={form.joiningDate} onChange={(value) => update("joiningDate", value)} />
              </div>
              <div>
                <label className={fieldLabel}>Employment Type</label>
                <select className={selectClass} value={form.employmentType} onChange={(e) => update("employmentType", e.target.value as EmploymentType)}>
                  <option value="PERMANENT">Permanent</option>
                  <option value="PROBATION">Probation</option>
                  <option value="CONTRACTUAL">Contractual</option>
                  <option value="INTERN">Intern</option>
                </select>
              </div>
              {form.employmentType === "PROBATION" ? (
                <div>
                  <label className={fieldLabel}>Probation End Date</label>
                  <AppDateInput className={fieldInput} value={form.probationEndDate} onChange={(value) => update("probationEndDate", value)} />
                </div>
              ) : null}
              {form.employmentType === "CONTRACTUAL" ? (
                <div>
                  <label className={fieldLabel}>Contract End Date</label>
                  <AppDateInput className={fieldInput} value={form.contractEndDate} onChange={(value) => update("contractEndDate", value)} />
                </div>
              ) : null}
              {isEdit ? (
                <div>
                  <label className={fieldLabel}>Status</label>
                  <select className={selectClass} value={form.status} onChange={(e) => update("status", e.target.value as EmployeeStatus)}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="RESIGNED">Resigned</option>
                    <option value="TERMINATED">Terminated</option>
                  </select>
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">Salary Structure</h3>
            <div className="mb-3">
              <label className={fieldLabel}>Gross Salary (Monthly) *</label>
              <Input className={`${fieldInput} sm:max-w-xs`} money value={form.grossSalary} onChange={(e) => update("grossSalary", e.target.value)} placeholder="0.00" />
            </div>

            <div className="space-y-2">
              {form.components.map((component, index) => {
                const amount = (gross * (Number(component.percent) || 0)) / 100;
                return (
                  <div key={index} className="flex items-center gap-2">
                    <Input className={`${fieldInput} flex-1`} placeholder="Component name" value={component.name} onChange={(e) => updateComponent(index, { name: e.target.value })} />
                    <Input className={`${fieldInput} w-20`} type="number" value={component.percent} onChange={(e) => updateComponent(index, { percent: e.target.value })} />
                    <span className="w-8 shrink-0 text-[11px] text-[#8592a5]">%</span>
                    <span className="w-28 shrink-0 text-right text-[12px] text-[#4a5b73]">{formatCurrency(amount)}</span>
                    <button type="button" onClick={() => removeComponent(index)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-[#8592a5] hover:bg-[#fdecec] hover:text-[#c2410c]" aria-label="Remove component">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button type="button" onClick={addComponent} className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-[#c7d3e5] px-3 py-1.5 text-[12px] font-medium text-[#2f67e8] hover:bg-[#f5f9ff]">
              <Plus className="h-3.5 w-3.5" /> Add Component
            </button>

            <p className={`mt-3 text-[11px] font-medium ${Math.abs(percentTotal - 100) > 0.01 ? "text-[#c2410c]" : "text-[#15925f]"}`}>
              Total: {percentTotal.toFixed(2)}% {Math.abs(percentTotal - 100) > 0.01 ? "— must add up to 100%" : "✓"}
            </p>

            <div className="mt-4 sm:max-w-xs">
              <label className={fieldLabel}>Provident Fund Rate (%)</label>
              <Input className={fieldInput} type="number" value={form.pfRate} onChange={(e) => update("pfRate", e.target.value)} placeholder="e.g. 8" />
              <p className="mt-1 text-[10px] text-[#8592a5]">Leave blank if this employee is not enrolled in Provident Fund. Applied to prorated Basic Salary each payroll run.</p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">Payment Method</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={fieldLabel}>Pay Via</label>
                <select className={selectClass} value={form.paymentMethod} onChange={(e) => update("paymentMethod", e.target.value as SalaryPaymentMethod)}>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="MFS">Mobile Financial Service</option>
                </select>
              </div>
              {form.paymentMethod === "BANK" ? (
                <>
                  <div>
                    <label className={fieldLabel}>Bank Name</label>
                    <Input className={fieldInput} value={form.bankName} onChange={(e) => update("bankName", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className={fieldLabel}>Bank Account Number</label>
                    <Input className={fieldInput} value={form.bankAccountNumber} onChange={(e) => update("bankAccountNumber", e.target.value)} />
                  </div>
                </>
              ) : null}
              {form.paymentMethod === "MFS" ? (
                <>
                  <div>
                    <label className={fieldLabel}>MFS Provider</label>
                    <Input className={fieldInput} value={form.mfsProvider} onChange={(e) => update("mfsProvider", e.target.value)} placeholder="bKash / Nagad / Rocket" />
                  </div>
                  <div className="col-span-2">
                    <label className={fieldLabel}>MFS Account Number</label>
                    <Input className={fieldInput} value={form.mfsAccountNumber} onChange={(e) => update("mfsAccountNumber", e.target.value)} />
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section>
            <label className={fieldLabel}>Notes</label>
            <Input className={fieldInput} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Employee"}
          </Button>
        </div>
      </DialogContent>

      <DepartmentDesignationManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </Dialog>
  );
}
