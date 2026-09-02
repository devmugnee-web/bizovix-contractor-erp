import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { Input } from "@/components/ui/input";

describe("Input money mode", () => {
  it("keeps controlled editing raw, then emits and displays the rounded 2dp value", () => {
    function ControlledMoneyInput() {
      const [amount, setAmount] = React.useState("10.075");
      return (
        <>
          <Input aria-label="Amount" money value={amount} onChange={(event) => setAmount(event.currentTarget.value)} />
          <output data-testid="amount-state">{amount}</output>
        </>
      );
    }

    render(<ControlledMoneyInput />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;

    expect(input).toHaveValue("10.08");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1234.565" } });
    expect(input).toHaveValue("1234.565");
    fireEvent.blur(input);

    expect(screen.getByTestId("amount-state")).toHaveTextContent("1234.57");
    expect(input).toHaveValue("1,234.57");
  });

  it("keeps an uncontrolled value ungrouped and submits the same rounded decimal", () => {
    const submitted = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted(new FormData(event.currentTarget).get("amount"));
        }}
      >
        <Input aria-label="Amount" name="amount" money defaultValue="1000.075" />
        <button type="submit">Submit</button>
      </form>,
    );

    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(input).toHaveValue("1000.08");
    expect(input.value).not.toContain(",");

    fireEvent.change(input, { target: { value: "2500.125" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(input).toHaveValue("2500.13");
    expect(submitted).toHaveBeenCalledWith("2500.13");
  });

  it("initializes and synchronizes React Hook Form with the rounded value", async () => {
    const submitted = vi.fn();

    function HookFormMoneyInput() {
      const { handleSubmit, register } = useForm<{ amount: string }>({
        defaultValues: { amount: "10.075" },
      });
      return (
        <form onSubmit={handleSubmit((values) => submitted(values.amount))}>
          <Input aria-label="RHF amount" money {...register("amount")} />
          <button type="submit">Save</button>
        </form>
      );
    }

    render(<HookFormMoneyInput />);
    const input = screen.getByLabelText("RHF amount") as HTMLInputElement;
    expect(input).toHaveValue("10.08");
    expect(input.value).not.toContain(",");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(submitted).toHaveBeenCalledWith("10.08"));

    submitted.mockClear();
    fireEvent.change(input, { target: { value: "20.075" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(submitted).toHaveBeenCalledWith("20.08"));
  });

  it("clears invalid text on blur instead of emitting NaN", () => {
    const changedValues: string[] = [];
    render(
      <Input
        aria-label="Amount"
        money
        defaultValue="1.00"
        onChange={(event) => changedValues.push(event.currentTarget.value)}
      />,
    );
    const input = screen.getByLabelText("Amount") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "not-money" } });
    fireEvent.blur(input);

    expect(input).toHaveValue("");
    expect(changedValues.at(-1)).toBe("");
  });
});
