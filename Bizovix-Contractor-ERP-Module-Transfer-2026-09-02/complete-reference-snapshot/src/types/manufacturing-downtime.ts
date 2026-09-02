export type ManufacturingDowntimeCandidate = {
  orderId: string;
  orderNumber: string;
  finishedProduct: {
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
  };
  operationExecutionId: string;
  operationStatus: "IN_PROGRESS" | "PAUSED";
  operation: { id: string; code: string; name: string; sequence: number };
  resource: {
    id: string;
    code: string;
    name: string;
    kind: "EQUIPMENT" | "PRODUCTION_LINE";
  };
  openDowntimeEvent: {
    id: string;
    resourceId: string;
    startedAt: string;
  } | null;
};

export type ManufacturingDowntimeReasonCode = {
  id: string;
  code: string;
  name: string;
  payload: unknown;
};

export type ManufacturingDowntimeEvent = {
  id: string;
  workspaceId: string;
  orderId: string;
  operationExecutionId: string;
  resourceId: string;
  status: "OPEN" | "ENDED";
  reasonCode: string | null;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: string | null;
  endNote: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    finishedProduct: {
      id: string;
      itemCode: string;
      itemName: string;
      unit: string;
    };
  };
  operationExecution: {
    id: string;
    status: string;
    routingOperation: { id: string; code: string; name: string };
  };
  resource: { id: string; code: string; name: string; kind: string };
  startedBy: { id: string; name: string };
  endedBy: { id: string; name: string } | null;
};

export type StartManufacturingDowntimeInput = {
  workspaceId: string;
  orderId: string;
  operationExecutionId: string;
  resourceId: string;
  reasonCode?: string | null;
  reason: string;
  transactionDate: string;
  idempotencyKey: string;
  signatureMeaning?: string | null;
  reauthenticationPassword?: string | null;
};

export type EndManufacturingDowntimeInput = {
  workspaceId: string;
  transactionDate: string;
  idempotencyKey: string;
  endNote?: string | null;
  signatureMeaning?: string | null;
  reauthenticationPassword?: string | null;
};
