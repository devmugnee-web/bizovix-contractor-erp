import { writeFile } from "node:fs/promises";

const debugPort = process.argv[2] ?? "9336";
const targetUrl = process.argv[3] ?? "http://127.0.0.1:3010/bank-instruments/credit-commitment";
const outputPath = process.argv[4] ?? ".codex-runtime/credit-commitment-bank-final.png";
const viewportWidth = Number(process.argv[5] ?? 1365);
const viewportHeight = Number(process.argv[6] ?? 900);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForTargets() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page");
        if (page) return page;
      }
    } catch {
      // Edge may still be starting.
    }
    await delay(250);
  }
  throw new Error(`No debuggable Edge page appeared on port ${debugPort}.`);
}

const target = await waitForTargets();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function waitForApplication(timeoutMilliseconds = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const state = await send("Runtime.evaluate", {
      expression: `({ readyState: document.readyState, text: document.body?.innerText.trim().slice(0, 120) ?? '' })`,
      returnByValue: true,
    });
    const value = state.result.value;
    if (value.readyState === "complete" && value.text && value.text !== "Loading...") return value;
    await delay(500);
  }
  return null;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: viewportWidth,
  height: viewportHeight,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: targetUrl });
let applicationState = await waitForApplication();
if (!applicationState) {
  await send("Page.reload", { ignoreCache: true });
  applicationState = await waitForApplication();
}
if (!applicationState) throw new Error("Application remained in its loading state after a controlled reload.");

for (let attempt = 0; attempt < 30; attempt += 1) {
  const rowState = await send("Runtime.evaluate", {
    expression: `Boolean(document.querySelector('tbody button[aria-label^="Select "]:not([disabled])'))`,
    returnByValue: true,
  });
  if (rowState.result.value) break;
  await delay(500);
}

const action = await send("Runtime.evaluate", {
  expression: `(() => {
    const rowCheckbox = document.querySelector('tbody button[aria-label^="Select "]:not([disabled])');
    if (!rowCheckbox) {
      const existingCharge = [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Save Charge for'));
      if (existingCharge) return { ok: true, stage: 'already-added' };
      return { ok: false, stage: 'select', url: location.href, body: document.body.innerText.slice(0, 500) };
    }
    rowCheckbox.click();
    return { ok: true, stage: 'selected' };
  })()`,
  returnByValue: true,
});
if (!action.result.value?.ok) throw new Error(JSON.stringify(action.result.value));

if (action.result.value.stage === "selected") {
  await delay(300);
  const addition = await send("Runtime.evaluate", {
    expression: `(() => {
      const addButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Add Selected to Charge List'));
      if (!addButton || addButton.disabled) return { ok: false, stage: 'add', text: addButton?.textContent, disabled: addButton?.disabled };
      addButton.click();
      return { ok: true, stage: 'added' };
    })()`,
    returnByValue: true,
  });
  if (!addition.result.value?.ok) throw new Error(JSON.stringify(addition.result.value));
}

await delay(1200);
const verification = await send("Runtime.evaluate", {
  expression: `(() => {
    const section = [...document.querySelectorAll('section')].find((item) => item.textContent.includes('2. Charge & Payment Details'));
    section?.scrollIntoView({ block: 'start' });
    const labels = [...document.querySelectorAll('label')].map((label) => label.innerText.trim());
    const configureTable = section?.querySelector('table');
    const selects = [...document.querySelectorAll('select')].map((select) => ({ value: select.value, text: select.options[select.selectedIndex]?.text ?? '' }));
    return {
      url: location.href,
      title: document.title,
      hasSingleBankAccount: labels.some((label) => label.startsWith('Bank Account')),
      hasSeparatePaymentAccount: labels.some((label) => label.startsWith('Charge Paid From Account')),
      hasPaymentDate: labels.some((label) => label.startsWith('Payment Date')),
      hasOverallRemarks: labels.some((label) => label.startsWith('Overall Remarks')),
      hasThirdSection: document.body.innerText.includes('3. Payment & Review'),
      hasAddAnotherTender: document.body.innerText.includes('Add Another Tender'),
      hasBulkChargeAmount: labels.some((label) => label.startsWith('Charge Amount')),
      hasCommonRemarks: labels.some((label) => label.startsWith('Common Remarks')),
      hasApplyButton: [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Apply Amount')),
      configureHeaders: configureTable ? [...configureTable.querySelectorAll('th')].map((cell) => cell.innerText.trim()) : [],
      configureSelectCount: configureTable ? configureTable.querySelectorAll('select').length : -1,
      selectedValues: selects,
      bodyHasAdded: document.body.innerText.includes('1 tender in charge list'),
    };
  })()`,
  returnByValue: true,
});

await delay(300);
const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true,
  captureBeyondViewport: false,
});
await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));

process.stdout.write(`${JSON.stringify(verification.result.value, null, 2)}\n${outputPath}\n`);
socket.close();
