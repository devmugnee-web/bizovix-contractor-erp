"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Building2, FileText, Info, Landmark, Monitor, Plus, Save } from "lucide-react";
import {
  useBankAccounts,
  useCreateMasterCategory,
  useCreateDocumentPurchase,
  useCreateOrganizationMaster,
  useMasterCategories,
  useOrganizations,
  useTender,
} from "@bizovix/api-client";
import {
  createDocumentPurchaseSchema,
  createOrganizationMasterSchema,
  type CreateDocumentPurchaseFormValues,
  type CreateOrganizationMasterFormValues,
} from "@bizovix/validation";
import {
  CurrencyInput,
  DateInput,
  FormField,
  PageHeader,
  PrimaryButton,
  RadioCardGroup,
  SearchSelect,
  SecondaryButton,
  SelectInput,
  TextInput,
} from "@bizovix/ui";
import { MasterCategoryType, PurchaseType } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Modal } from "@/components/layout/Modal";

export default function AddDocumentPurchasePage() {
  return (
    <Suspense fallback={null}>
      <AddDocumentPurchaseForm />
    </Suspense>
  );
}

function AddDocumentPurchaseForm() {
  useSetBreadcrumb([
    { label: "Bank Instruments" },
    { label: "Document Purchase", href: "/bank-instruments/document-purchase" },
    { label: "Add Document Purchase" },
  ]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const tenderId = searchParams.get("tenderId") ?? undefined;
  const linkedTender = useTender(tenderId);
  const bankAccounts = useBankAccounts();
  const categories = useMasterCategories(MasterCategoryType.DOCUMENT_PURCHASE);
  const createMutation = useCreateDocumentPurchase();

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateDocumentPurchaseFormValues>({
    resolver: zodResolver(createDocumentPurchaseSchema),
    defaultValues: {
      purchaseType: PurchaseType.EGP,
      tenderId: "",
      organizationMasterId: "",
      tenderWorkName: "",
      purchaseDate: new Date().toISOString().slice(0, 10),
      documentPrice: undefined,
      paymentFromAccountId: "",
      category: "",
      submissionDate: "",
      remarks: "",
    },
  });

  const purchaseType = watch("purchaseType");
  const organizationMasterId = watch("organizationMasterId");

  const [orgQuery, setOrgQuery] = React.useState("");
  const [selectedOrg, setSelectedOrg] = React.useState<{ value: string; label: string } | null>(null);
  const organizations = useOrganizations(orgQuery);

  const [addOrgOpen, setAddOrgOpen] = React.useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = React.useState(false);

  const prefilledFromTender = React.useRef(false);
  React.useEffect(() => {
    if (!linkedTender.data || prefilledFromTender.current) return;
    prefilledFromTender.current = true;
    if (linkedTender.data.organizationMasterId && linkedTender.data.organizationMaster) {
      setValue("organizationMasterId", linkedTender.data.organizationMasterId);
      setSelectedOrg({
        value: linkedTender.data.organizationMasterId,
        label: linkedTender.data.organizationMaster.shortName,
      });
    }
    setValue("tenderWorkName", linkedTender.data.workName);
    if (linkedTender.data.egpTenderId) setValue("tenderId", linkedTender.data.egpTenderId);
  }, [linkedTender.data, setValue]);

  function onSubmit(values: CreateDocumentPurchaseFormValues) {
    createMutation.mutate(
      {
        purchaseType: values.purchaseType,
        tenderId: values.purchaseType === PurchaseType.EGP ? values.tenderId || undefined : undefined,
        linkedTenderId: tenderId,
        organizationMasterId: values.organizationMasterId,
        tenderWorkName: values.tenderWorkName,
        purchaseDate: values.purchaseDate,
        documentPrice: Number(values.documentPrice),
        paymentFromAccountId: values.paymentFromAccountId,
        category: values.category || undefined,
        submissionDate: values.submissionDate || undefined,
        remarks: values.remarks || undefined,
      },
      {
        onSuccess: (record) => {
          router.push(tenderId ? `/tenders/${tenderId}` : `/bank-instruments/document-purchase/${record.id}`);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add Document Purchase"
        subtitle="Add new tender document purchase information (e-GP & Manual)"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <div className="flex flex-col gap-6">
          <FormField label="1. Purchase Type" required>
            <Controller
              control={control}
              name="purchaseType"
              render={({ field }) => (
                <RadioCardGroup
                  name="purchaseType"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: PurchaseType.EGP, label: "e-GP", icon: Monitor, iconClassName: "text-biz-blue" },
                    { value: PurchaseType.MANUAL, label: "Manual", icon: FileText, iconClassName: "text-biz-orange" },
                  ]}
                />
              )}
            />
          </FormField>

          <FormField
            label="2. Tender ID (e-GP)"
            htmlFor="tenderId"
            helper="Required for e-GP. Leave blank for Manual purchase."
            error={errors.tenderId?.message}
          >
            <TextInput
              id="tenderId"
              icon={Info}
              placeholder="Enter e-GP Tender ID"
              disabled={purchaseType !== PurchaseType.EGP}
              hasError={!!errors.tenderId}
              {...register("tenderId")}
            />
          </FormField>

          <FormField
            label="3. Organization"
            required
            helper="Type minimum 2 characters to search"
            error={errors.organizationMasterId?.message}
          >
            <div className="flex items-start gap-3">
              <SearchSelect
                className="flex-1"
                query={orgQuery}
                value={selectedOrg}
                onQueryChange={(q) => {
                  setOrgQuery(q);
                  if (selectedOrg) {
                    setSelectedOrg(null);
                    setValue("organizationMasterId", "");
                  }
                }}
                onSelect={(option) => {
                  setSelectedOrg(option);
                  setValue("organizationMasterId", option.value);
                }}
                options={(organizations.data ?? []).map((org) => ({
                  value: org.id,
                  label: org.shortName,
                  sublabel: org.fullName,
                }))}
                isLoading={organizations.isLoading}
                placeholder="Search organization by short name or full name..."
              />
              <SecondaryButton type="button" onClick={() => setAddOrgOpen(true)}>
                <Plus className="h-4 w-4" />
                Add New Organization
              </SecondaryButton>
            </div>
            <input type="hidden" value={organizationMasterId} readOnly />
          </FormField>

          <FormField label="4. Tender / Work Name" required error={errors.tenderWorkName?.message}>
            <TextInput
              icon={Building2}
              placeholder="Enter tender / work name"
              hasError={!!errors.tenderWorkName}
              {...register("tenderWorkName")}
            />
          </FormField>

          <FormField label="5. Purchase Date" required error={errors.purchaseDate?.message}>
            <Controller
              control={control}
              name="purchaseDate"
              render={({ field }) => <DateInput {...field} />}
            />
          </FormField>

          <FormField label="6. Document Price" required error={errors.documentPrice?.message}>
            <CurrencyInput placeholder="Enter document price" {...register("documentPrice")} />
          </FormField>

          <FormField
            label="7. Payment From"
            required
            helper="Amount will be posted from the selected account."
            error={errors.paymentFromAccountId?.message}
          >
            <SelectInput
              icon={Landmark}
              placeholder="Select bank or cash account"
              options={(bankAccounts.data ?? []).map((acc) => ({ label: acc.accountName, value: acc.id }))}
              {...register("paymentFromAccountId")}
            />
          </FormField>

          <FormField label="8. Category" error={errors.category?.message}>
            <div className="flex items-start gap-3">
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <SelectInput
                    className="flex-1"
                    placeholder={categories.isLoading ? "Loading categories..." : "Select category"}
                    options={(categories.data ?? [])
                      .filter((category) => category.isActive)
                      .map((category) => ({ label: category.name, value: category.name }))}
                    {...field}
                  />
                )}
              />
              <SecondaryButton type="button" onClick={() => setAddCategoryOpen(true)}>
                <Plus className="h-4 w-4" />
                Add New Category
              </SecondaryButton>
            </div>
          </FormField>

          <FormField label="9. Submission Date" error={errors.submissionDate?.message}>
            <Controller control={control} name="submissionDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <div className="md:col-span-2">
            <FormField label="10. Remarks" error={errors.remarks?.message}>
              <TextInput placeholder="Optional remarks" {...register("remarks")} />
            </FormField>
          </div>
        </div>

        {createMutation.isError && (
          <p className="mt-4 text-[13px] text-biz-danger">Failed to save document purchase. Please try again.</p>
        )}

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton type="button" onClick={() => router.push("/bank-instruments/document-purchase")}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={createMutation.isPending}>
            <Save className="h-4 w-4" />
            {createMutation.isPending ? "Saving..." : "Save Document Purchase"}
          </PrimaryButton>
        </div>
      </form>

      <AddOrganizationModal
        open={addOrgOpen}
        onClose={() => setAddOrgOpen(false)}
        onCreated={(org) => {
          setSelectedOrg({ value: org.id, label: org.shortName });
          setValue("organizationMasterId", org.id);
          setAddOrgOpen(false);
        }}
      />
      <AddCategoryModal
        open={addCategoryOpen}
        onClose={() => setAddCategoryOpen(false)}
        onCreated={(category) => {
          setValue("category", category.name, { shouldDirty: true, shouldValidate: true });
          setAddCategoryOpen(false);
        }}
      />
    </div>
  );
}

function AddCategoryModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (category: { name: string }) => void;
}) {
  const createCategory = useCreateMasterCategory();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function close() {
    setName("");
    setError(null);
    onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const categoryName = name.trim();
    if (!categoryName) {
      setError("Category name is required.");
      return;
    }

    setError(null);
    try {
      const category = await createCategory.mutateAsync({
        type: MasterCategoryType.DOCUMENT_PURCHASE,
        name: categoryName,
      });
      setName("");
      onCreated(category);
    } catch {
      setError("Failed to add category. The category name may already exist.");
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add New Category">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="Category Name" required error={error ?? undefined}>
          <TextInput
            autoFocus
            placeholder="e.g. Civil, Electrical"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <div className="mt-2 flex justify-end gap-3">
          <SecondaryButton type="button" onClick={close}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={!name.trim() || createCategory.isPending}>
            {createCategory.isPending ? "Saving..." : "Save Category"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function AddOrganizationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (org: { id: string; shortName: string }) => void;
}) {
  const createOrg = useCreateOrganizationMaster();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateOrganizationMasterFormValues>({ resolver: zodResolver(createOrganizationMasterSchema) });

  function onSubmit(values: CreateOrganizationMasterFormValues) {
    createOrg.mutate(values, {
      onSuccess: (org) => {
        reset();
        onCreated(org);
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Organization">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField label="Short Name" required error={errors.shortName?.message}>
          <TextInput placeholder="e.g. DPHE" {...register("shortName")} />
        </FormField>
        <FormField label="Full Name" required error={errors.fullName?.message}>
          <TextInput placeholder="e.g. Department of Public Health Engineering" {...register("fullName")} />
        </FormField>
        <div className="mt-2 flex justify-end gap-3">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={createOrg.isPending}>
            {createOrg.isPending ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
