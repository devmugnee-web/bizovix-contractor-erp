import * as React from "react";

import { formatMoneyInput, parseMoneyInput } from "@/lib/format";
import { roundMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> & {
  clearZeroOnFocus?: boolean;
  money?: boolean;
};

function isZeroLikeValue(value: string) {
  return /^(?:0+|0*\.(?:0+)?)$/.test(value.trim());
}

const DECIMAL_INPUT_VALUE_PATTERN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

/** Return the ungrouped, posted value represented by a money input. */
function normalizeMoneyInputValue(value: string | number | null | undefined) {
  const source = parseMoneyInput(String(value ?? "")).trim();
  if (!source || !DECIMAL_INPUT_VALUE_PATTERN.test(source) || !Number.isFinite(Number(source))) {
    return "";
  }
  return roundMoney(source).toFixed(2);
}

function formatControlledMoneyValue(value: string | number | null | undefined) {
  const normalized = normalizeMoneyInputValue(value);
  return normalized ? formatMoneyInput(normalized, { fixedDecimals: true }) : "";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, clearZeroOnFocus, money, onChange, onFocus, onBlur, type, inputMode, readOnly, disabled, value, defaultValue, ...props }, ref) => {
    const [editingMoney, setEditingMoney] = React.useState(false);
    const [moneyDraft, setMoneyDraft] = React.useState("");
    const inputNodeRef = React.useRef<HTMLInputElement | null>(null);
    const initializedUncontrolledMoneyNodeRef = React.useRef<HTMLInputElement | null>(null);
    const setInputRef = React.useCallback((node: HTMLInputElement | null) => {
      const isNewNode = Boolean(node && inputNodeRef.current !== node);
      if (node) {
        inputNodeRef.current = node;
        if (isNewNode) initializedUncontrolledMoneyNodeRef.current = null;
      }

      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }, [ref]);

    React.useLayoutEffect(() => {
      const node = inputNodeRef.current;
      if (!money || value !== undefined || !node || initializedUncontrolledMoneyNodeRef.current === node) return;
      initializedUncontrolledMoneyNodeRef.current = node;

      // RHF can assign its default value inside the forwarded ref. Normalize
      // after all refs have run, then emit a real input event so RHF's store is
      // also initialized with the same value the user sees and submits.
      const normalizedValue = normalizeMoneyInputValue(node.value);
      if (!node.value.trim() || node.value === normalizedValue) return;

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(node, normalizedValue);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }, [money, value]);
    const displayedValue = money && value !== undefined
      ? editingMoney
        ? moneyDraft
        : formatControlledMoneyValue(value as string | number | null | undefined)
      : value;
    const displayedDefaultValue = money && defaultValue !== undefined
      ? normalizeMoneyInputValue(defaultValue as string | number | null | undefined)
      : defaultValue;

    return <input
      ref={setInputRef}
      className={cn(
        "flex h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted/90",
        className,
      )}
      type={money ? "text" : type}
      inputMode={money ? "decimal" : inputMode}
      value={displayedValue}
      defaultValue={displayedDefaultValue}
      readOnly={readOnly}
      disabled={disabled}
      onFocus={(event) => {
        if (money && value !== undefined && !readOnly && !disabled) {
          setMoneyDraft(parseMoneyInput(event.currentTarget.value));
          setEditingMoney(true);
        }
        const shouldSelectZero =
          (clearZeroOnFocus ?? (type === "number" || inputMode === "decimal" || inputMode === "numeric")) && !readOnly && !disabled;

        if (shouldSelectZero && isZeroLikeValue(event.currentTarget.value)) {
          const target = event.currentTarget;
          window.requestAnimationFrame(() => {
            if (document.activeElement === target) {
              target.select();
            }
          });
        }

        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (money && !readOnly && !disabled) {
          const normalizedValue = normalizeMoneyInputValue(event.currentTarget.value);
          event.currentTarget.value = normalizedValue;
          setMoneyDraft(normalizedValue);

          // Emit the rounded value before blur. This synchronizes controlled
          // state and RHF's uncontrolled store with the exact 2dp value shown
          // after editing, even when the user only focuses and leaves a value
          // such as 10.075.
          onChange?.(event);
        }
        setEditingMoney(false);
        onBlur?.(event);
      }}
      onChange={(event) => {
        if (money) {
          event.currentTarget.value = parseMoneyInput(event.currentTarget.value);
          if (value !== undefined) {
            setMoneyDraft(event.currentTarget.value);
          }
        }
        onChange?.(event);
      }}
      // Business fields have their own pickers; the browser's saved-value dropdown only
      // covers them up. Pass autoComplete explicitly where the browser should help.
      autoComplete="off"
      {...props}
    />;
  },
);

Input.displayName = "Input";
