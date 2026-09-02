"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Factory,
  Loader2,
  MapPin,
  PackageCheck,
  Route,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import {
  getManufacturingExecutionTransferContext,
  postManufacturingExecutionTransfer,
} from "@/services/manufacturing-execution-transfer.service";
import type { ManufacturingExecutionTransferKind } from "@/types/manufacturing-execution-transfer";

const selectClass =
  "h-9 w-full rounded-lg border border-[#d4e0ee] bg-white px-3 text-xs text-[#263a54] outline-none focus:border-[#78aceb]";
const labelClass = "grid gap-1.5 text-[11px] font-medium text-[#53657d]";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function requestKey(kind: ManufacturingExecutionTransferKind) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `manufacturing:${kind.toLowerCase()}:${suffix}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : "0.00";
}

function destinationAllowed(
  kind: ManufacturingExecutionTransferKind,
  bucket: "AVAILABLE" | "HOLD" | undefined,
  disposition: string,
) {
  if (bucket === "HOLD") return disposition === "QC_HOLD";
  return kind === "WIP_TRANSFER"
    ? ["WIP", "STAGING"].includes(disposition)
    : ["WIP", "STAGING", "RELEASED"].includes(disposition);
}

export function isManufacturingExecutionTransferView(view: string) {
  return view === "wip-transfer" || view === "bulk-product-transfer";
}

export function ManufacturingExecutionTransferWorkspace({
  workspaceId,
  view,
  title,
}: {
  workspaceId?: string;
  view: string;
  title: string;
}) {
  const queryClient = useQueryClient();
  const kind: ManufacturingExecutionTransferKind =
    view === "bulk-product-transfer" ? "BULK_PRODUCT_TRANSFER" : "WIP_TRANSFER";
  const [orderId, setOrderId] = useState("");
  const [orderLotId, setOrderLotId] = useState("");
  const [operationExecutionId, setOperationExecutionId] = useState("");
  const [sourceInventoryLotId, setSourceInventoryLotId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [transactionDate, setTransactionDate] = useState(today());
  const [signatureMeaning, setSignatureMeaning] = useState("");
  const [reauthenticationPassword, setReauthenticationPassword] = useState("");
  const [note, setNote] = useState("");
  const [serialIds, setSerialIds] = useState<string[]>([]);

  const context = useQuery({
    queryKey: ["manufacturing-execution-transfer-context", workspaceId, kind],
    queryFn: () =>
      getManufacturingExecutionTransferContext({
        workspaceId: workspaceId!,
        kind,
      }),
    enabled: Boolean(workspaceId),
  });
  useEffect(() => {
    if (
      !signatureMeaning &&
      context.data?.electronicSignature.allowedMeanings[0]
    )
      setSignatureMeaning(context.data.electronicSignature.allowedMeanings[0]);
  }, [context.data?.electronicSignature.allowedMeanings, signatureMeaning]);

  const selectedOrder = context.data?.orders.find(
    (order) => order.id === orderId,
  );
  const orderLots = selectedOrder?.lots ?? [];
  const operationExecutions = (selectedOrder?.operationExecutions ?? []).filter(
    (execution) => execution.orderLotId === orderLotId,
  );
  const sourceLots = useMemo(
    () =>
      (context.data?.sourceLots ?? []).filter(
        (lot) =>
          lot.orderId === orderId &&
          lot.orderLotId === orderLotId &&
          (lot.sourceOperationExecutionId === operationExecutionId ||
            (lot.stockBacked && !lot.sourceOperationExecutionId)),
      ),
    [context.data?.sourceLots, operationExecutionId, orderId, orderLotId],
  );
  const selectedSourceLot = sourceLots.find(
    (lot) => lot.id === sourceInventoryLotId,
  );
  const destinations = useMemo(
    () =>
      (context.data?.locations ?? []).filter(
        (location) =>
          location.id !== selectedSourceLot?.locationId &&
          (selectedSourceLot?.stockBacked ||
            location.warehouseId === selectedSourceLot?.warehouseId) &&
          destinationAllowed(
            kind,
            selectedSourceLot?.quantityBucket,
            location.disposition,
          ),
      ),
    [context.data?.locations, kind, selectedSourceLot],
  );
  const selectedDestination = destinations.find(
    (location) => location.id === destinationLocationId,
  );

  const resetDependent = (level: "order" | "lot" | "source") => {
    if (level === "order") {
      setOrderLotId("");
      setOperationExecutionId("");
    }
    if (level === "order" || level === "lot") {
      setSourceInventoryLotId("");
    }
    setDestinationLocationId("");
    setQuantity("");
    setSerialIds([]);
  };

  const postTransfer = useMutation({
    mutationFn: postManufacturingExecutionTransfer,
    onSuccess: async ({ transfer, replayed }) => {
      await queryClient.invalidateQueries({
        queryKey: [
          "manufacturing-execution-transfer-context",
          workspaceId,
          kind,
        ],
      });
      setSourceInventoryLotId("");
      setDestinationLocationId("");
      setQuantity("");
      setSerialIds([]);
      setReauthenticationPassword("");
      setNote("");
      toast.success(
        replayed
          ? `${transfer.transactionNumber} was already posted.`
          : `${transfer.transactionNumber} posted successfully.`,
      );
    },
    onError: (error) =>
      toast.error(errorMessage(error, `${title} could not be posted.`)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId) return toast.error("Select an active workspace.");
    if (
      !orderId ||
      !orderLotId ||
      !operationExecutionId ||
      !sourceInventoryLotId ||
      !destinationLocationId
    )
      return toast.error(
        "Select the order, production lot, completed operation, source lot and destination.",
      );
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)
      return toast.error("Enter a transfer quantity greater than zero.");
    if (
      selectedSourceLot &&
      parsedQuantity > selectedSourceLot.transferableQuantity
    )
      return toast.error(
        `Maximum transferable balance is ${selectedSourceLot.transferableQuantity} ${selectedSourceLot.unit}.`,
      );
    if (
      selectedSourceLot?.serials.length &&
      serialIds.length !== parsedQuantity
    )
      return toast.error(`Select exactly ${parsedQuantity} serial number(s).`);
    const signature = context.data?.electronicSignature;
    if (signature?.required && !signature.policyReady)
      return toast.error(
        "Approve an electronic-signature policy before posting this transfer.",
      );
    if (signature?.required && !signatureMeaning)
      return toast.error("Select an approved electronic-signature meaning.");
    if (signature?.reauthenticationRequired && !reauthenticationPassword)
      return toast.error(
        "Current password is required for the electronic signature.",
      );
    postTransfer.mutate({
      workspaceId,
      kind,
      orderId,
      orderLotId,
      operationExecutionId,
      sourceInventoryLotId,
      destinationLocationId,
      quantity: parsedQuantity,
      serialIds,
      transactionDate: new Date(
        `${transactionDate}T00:00:00.000Z`,
      ).toISOString(),
      idempotencyKey: requestKey(kind),
      note: note.trim() || null,
      signatureMeaning: signatureMeaning || null,
      reauthenticationPassword: reauthenticationPassword || null,
    });
  };

  const isInterWarehouse = Boolean(
    selectedSourceLot &&
    selectedDestination &&
    selectedSourceLot.warehouseId !== selectedDestination.warehouseId,
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#cfdeef] bg-white shadow-[0_6px_20px_rgba(30,64,175,0.05)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce7f3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f2ff] text-[#2478df]">
            {kind === "WIP_TRANSFER" ? (
              <Route className="h-5 w-5" />
            ) : (
              <Boxes className="h-5 w-5" />
            )}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#203651]">{title}</h2>
            <p className="text-[11px] text-[#718096]">
              Post a real, traceable lot movement against a completed operation.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <CheckCircle2 className="mr-1 inline h-3 w-3" /> Real records only
          </span>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
            <ShieldCheck className="mr-1 inline h-3 w-3" /> Period + e-sign
            controlled
          </span>
        </div>
      </header>

      <form
        onSubmit={submit}
        className="grid gap-3 border-b border-[#dce7f3] bg-[#fbfdff] p-4 lg:grid-cols-3 xl:grid-cols-4"
      >
        <label className={labelClass}>
          Production order *
          <select
            className={selectClass}
            value={orderId}
            onChange={(event) => {
              setOrderId(event.target.value);
              resetDependent("order");
            }}
          >
            <option value="">Select a real order...</option>
            {(context.data?.orders ?? []).map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} — {order.finishedProductName} (
                {order.status.replaceAll("_", " ")})
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Production lot / batch *
          <select
            className={selectClass}
            value={orderLotId}
            disabled={!orderId}
            onChange={(event) => {
              setOrderLotId(event.target.value);
              resetDependent("lot");
            }}
          >
            <option value="">Select lot...</option>
            {orderLots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.lotNumber} — {lot.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Completed operation *
          <select
            className={selectClass}
            value={operationExecutionId}
            disabled={!orderLotId}
            onChange={(event) => {
              setOperationExecutionId(event.target.value);
              resetDependent("source");
            }}
          >
            <option value="">Select operation...</option>
            {operationExecutions.map((execution) => (
              <option key={execution.id} value={execution.id}>
                {String(execution.sequence).padStart(2, "0")} ·{" "}
                {execution.operationCode} — {execution.operationName}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Transaction date *
          <AppDateInput
            aria-label="Transaction date *"
            inputClassName="h-9 rounded-lg border-[#d4e0ee] text-xs"
            value={transactionDate}
            onChange={(value) => setTransactionDate(value)}
          />
        </label>
        <label className={`${labelClass} lg:col-span-2`}>
          Source inventory lot *
          <select
            className={selectClass}
            value={sourceInventoryLotId}
            disabled={!operationExecutionId}
            onChange={(event) => {
              const lotId = event.target.value;
              const lot = sourceLots.find((entry) => entry.id === lotId);
              setSourceInventoryLotId(lotId);
              setQuantity(lot ? String(lot.transferableQuantity) : "");
              resetDependent("source");
              if (lot) setQuantity(String(lot.transferableQuantity));
            }}
          >
            <option value="">Select traceable source lot...</option>
            {sourceLots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.lotNumber} · {lot.itemCode} · {lot.warehouseCode}/
                {lot.locationCode} · {lot.transferableQuantity} {lot.unit}{" "}
                {lot.quantityBucket.toLowerCase()} · {lot.sourceClassification}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} lg:col-span-2`}>
          Destination warehouse / location *
          <select
            className={selectClass}
            value={destinationLocationId}
            disabled={!sourceInventoryLotId}
            onChange={(event) => setDestinationLocationId(event.target.value)}
          >
            <option value="">Select active destination...</option>
            {destinations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.warehouseCode} — {location.warehouseName} /{" "}
                {location.code} — {location.name} (
                {location.disposition.replaceAll("_", " ")})
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Quantity *{" "}
          {selectedSourceLot
            ? `(max ${selectedSourceLot.transferableQuantity} ${selectedSourceLot.unit})`
            : ""}
          <Input
            className="h-9 rounded-lg border-[#d4e0ee] text-xs"
            type="number"
            min="0.0001"
            step="0.0001"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Signature meaning{" "}
          {context.data?.electronicSignature.required ? "*" : ""}
          <select
            className={selectClass}
            value={signatureMeaning}
            onChange={(event) => setSignatureMeaning(event.target.value)}
          >
            <option value="">Select approved meaning...</option>
            {(context.data?.electronicSignature.allowedMeanings ?? []).map(
              (meaning) => (
                <option key={meaning} value={meaning}>
                  {meaning}
                </option>
              ),
            )}
          </select>
        </label>
        {context.data?.electronicSignature.reauthenticationRequired ? (
          <label className={labelClass}>
            Current password *
            <Input
              className="h-9 rounded-lg border-[#d4e0ee] text-xs"
              type="password"
              autoComplete="current-password"
              value={reauthenticationPassword}
              onChange={(event) =>
                setReauthenticationPassword(event.target.value)
              }
            />
          </label>
        ) : null}
        <label
          className={`${labelClass} ${context.data?.electronicSignature.reauthenticationRequired ? "" : "lg:col-span-2"}`}
        >
          Note
          <Input
            className="h-9 rounded-lg border-[#d4e0ee] text-xs"
            value={note}
            placeholder="Transfer reason / handover note"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {selectedSourceLot?.serials.length ? (
          <div className="rounded-xl border border-[#d6e2ef] bg-white p-3 lg:col-span-3 xl:col-span-4">
            <div className="mb-2 text-[11px] font-semibold text-[#334a65]">
              Select exact serial numbers *
            </div>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
              {selectedSourceLot.serials.map((serial) => (
                <label
                  key={serial.id}
                  className="flex items-center gap-2 rounded-lg border border-[#dbe5f0] px-2.5 py-1.5 text-[10px]"
                >
                  <input
                    type="checkbox"
                    checked={serialIds.includes(serial.id)}
                    onChange={(event) =>
                      setSerialIds((current) =>
                        event.target.checked
                          ? [...current, serial.id]
                          : current.filter((id) => id !== serial.id),
                      )
                    }
                  />
                  {serial.serialNumber} · {serial.status}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9e4f0] bg-white p-3 lg:col-span-3 xl:col-span-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#61738a]">
            {selectedSourceLot ? (
              <>
                <span className="rounded-full bg-[#eef5ff] px-2.5 py-1">
                  <PackageCheck className="mr-1 inline h-3 w-3" />
                  {selectedSourceLot.lotNumber}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="rounded-full bg-[#f1f7f4] px-2.5 py-1">
                  <MapPin className="mr-1 inline h-3 w-3" />
                  {selectedDestination?.name ?? "Select destination"}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 ${isInterWarehouse ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                >
                  {isInterWarehouse
                    ? "Balanced warehouse OUT / IN; no GL"
                    : "Location-only move; no stock / GL movement"}
                </span>
                {selectedSourceLot.retestDueAt ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    Retest due{" "}
                    {formatDate(selectedSourceLot.retestDueAt)}
                  </span>
                ) : null}
              </>
            ) : (
              <span>Select a source lot to see the posting path.</span>
            )}
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={postTransfer.isPending || context.isLoading}
          >
            {postTransfer.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Factory className="h-4 w-4" />
            )}
            Post transfer
          </Button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex items-center justify-between border-b border-[#e2eaf3] px-4 py-2.5">
          <div>
            <h3 className="text-xs font-semibold text-[#2d425d]">
              Posted transfer register
            </h3>
            <p className="text-[10px] text-[#7b8ba0]">
              Immutable transaction, lot genealogy and posting evidence.
            </p>
          </div>
          <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[10px] text-[#607089]">
            {context.data?.recentTransfers.length ?? 0} posted
          </span>
        </div>
        {context.isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-xs text-[#718096]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading real transfer context...
          </div>
        ) : context.isError ? (
          <div className="flex min-h-48 items-center justify-center text-xs text-red-600">
            {errorMessage(
              context.error,
              "Transfer context could not be loaded.",
            )}
          </div>
        ) : context.data?.recentTransfers.length ? (
          <table className="w-full min-w-[1080px] border-collapse text-[10px]">
            <thead className="sticky top-0 bg-[#f4f7fb] text-[#60738d]">
              <tr>
                {[
                  "TRANSFER NO.",
                  "DATE",
                  "ORDER / LOT",
                  "OPERATION",
                  "ITEM / SOURCE LOT",
                  "FROM",
                  "TO",
                  "QTY",
                  "VALUE (BDT)",
                  "POSTING",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="border-b border-[#dfe8f2] px-3 py-2.5 text-left font-semibold"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {context.data.recentTransfers.map((transfer) => (
                <tr
                  key={transfer.id}
                  className="border-b border-[#edf2f7] text-[#33465e] hover:bg-[#fbfdff]"
                >
                  <td className="px-3 py-2.5 font-semibold text-[#246fca]">
                    {transfer.transactionNumber}
                  </td>
                  <td className="px-3 py-2.5">
                    {formatDate(transfer.transactionDate)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{transfer.orderNumber}</div>
                    <div className="text-[#7b8ba0]">
                      {transfer.orderLotNumber}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {transfer.operationCode ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">
                      {transfer.itemCode} · {transfer.itemName}
                    </div>
                    <div className="text-[#7b8ba0]">
                      {transfer.sourceLotNumber} →{" "}
                      {transfer.destinationLotNumber}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{transfer.fromWarehouseName}</div>
                    <div className="text-[#7b8ba0]">
                      {transfer.fromLocationName}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{transfer.toWarehouseName}</div>
                    <div className="text-[#7b8ba0]">
                      {transfer.toLocationName}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-semibold">
                    {transfer.quantity} {transfer.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    {money(transfer.totalCost)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-1 ${transfer.interWarehouse ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {transfer.interWarehouse
                        ? "Warehouse OUT / IN"
                        : "Location only"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#2d7ee7]">
              <Warehouse className="h-5 w-5" />
            </span>
            <div className="mt-3 text-sm font-semibold text-[#29405d]">
              No posted {title.toLowerCase()} yet
            </div>
            <div className="mt-1 max-w-lg text-[11px] leading-5 text-[#76879d]">
              Only real, traceable production lots linked to completed
              operations are selectable. No demo or generated records are shown.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
