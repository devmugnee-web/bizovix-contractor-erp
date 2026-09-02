import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppDateInput, parseAppDateInput } from "./app-date-input";

describe("parseAppDateInput", () => {
  it.each([
    ["02.03.2026", "2026-03-02"],
    ["02/03/2026", "2026-03-02"],
    ["02-03-2026", "2026-03-02"],
    ["02.03.26", "2026-03-02"],
    ["2/3/26", "2026-03-02"],
    ["02 Mar 26", "2026-03-02"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(parseAppDateInput(input)).toBe(expected);
  });

  it.each(["31.02.26", "29/02/25", "00-03-26", "02.13.26", "2026-03-02"])(
    "rejects invalid or unsupported input %s",
    (input) => {
      expect(parseAppDateInput(input)).toBeNull();
    },
  );

  it("accepts a valid leap day", () => {
    expect(parseAppDateInput("29.02.24")).toBe("2024-02-29");
  });

  it("uses day/month/year order for ambiguous dates", () => {
    expect(parseAppDateInput("08/01/2026")).toBe("2026-01-08");
  });
});

describe("AppDateInput", () => {
  it("renders ISO state as DD/MM/YYYY and commits typed dates back as ISO", () => {
    const onChange = vi.fn();
    render(createElement(AppDateInput, {
      value: "2026-08-01",
      onChange,
      "aria-label": "From Date",
    }));

    const input = screen.getByLabelText("From Date") as HTMLInputElement;
    expect(input.value).toBe("01/08/2026");

    fireEvent.change(input, { target: { value: "31/08/2026" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith("2026-08-31");
  });

  it("allows an optional date to be cleared", () => {
    const onChange = vi.fn();
    render(createElement(AppDateInput, {
      value: "2026-08-31",
      onChange,
      "aria-label": "To Date",
    }));

    const input = screen.getByLabelText("To Date") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith("");
  });
});
