"use client";

import { useEffect } from "react";

const WHEEL_GUARD_SELECTOR = 'input[type="number"], input[role="spinbutton"]';
const ZERO_CLEAR_SELECTOR = 'input[type="number"], input[inputmode="decimal"]';
const ZERO_ONLY_VALUE = /^[+-]?(?:0+(?:[.,]0*)?|[.,]0+)$/;

function findInput(target: EventTarget | null, selector: string) {
  if (!(target instanceof Element)) return null;

  const input = target.closest(selector);
  return input instanceof HTMLInputElement ? input : null;
}

function canEdit(input: HTMLInputElement) {
  return !input.disabled && !input.readOnly;
}

function hasOnlyZeroValue(input: HTMLInputElement) {
  return ZERO_ONLY_VALUE.test(input.value.trim());
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(input, value);
    return;
  }

  input.value = value;
}

function clearZeroValue(input: HTMLInputElement, notifyChange: boolean) {
  if (!canEdit(input) || !hasOnlyZeroValue(input)) return;

  setNativeInputValue(input, "");

  if (notifyChange) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function NumericInputBehavior() {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const input = findInput(event.target, WHEEL_GUARD_SELECTOR);

      if (input && document.activeElement === input) {
        input.blur();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const input = findInput(event.target, ZERO_CLEAR_SELECTOR);
      if (!input) return;

      clearZeroValue(input, true);

      // A controlled field may immediately render its zero value again.
      // Clear it once more after that render without emitting a second event.
      window.requestAnimationFrame(() => clearZeroValue(input, false));
    };

    const handleBeforeInput = (event: InputEvent) => {
      if (!event.inputType.startsWith("insert")) return;

      const input = findInput(event.target, ZERO_CLEAR_SELECTOR);
      if (input) clearZeroValue(input, false);
    };

    document.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("beforeinput", handleBeforeInput, true);

    return () => {
      document.removeEventListener("wheel", handleWheel, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("beforeinput", handleBeforeInput, true);
    };
  }, []);

  return null;
}
