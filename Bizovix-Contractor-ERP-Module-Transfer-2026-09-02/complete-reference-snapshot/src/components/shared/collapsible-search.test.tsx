import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CollapsibleSearch } from "@/components/shared/collapsible-search";

function SearchHarness() {
  const [value, setValue] = useState("");
  return (
    <CollapsibleSearch
      value={value}
      onChange={setValue}
      label="Search manufacturing workflows"
      placeholder="Search this manufacturing module"
    />
  );
}

describe("CollapsibleSearch", () => {
  it("starts collapsed, expands on demand, and clears when closed", async () => {
    const user = userEvent.setup();
    render(<SearchHarness />);

    expect(
      screen.queryByPlaceholderText("Search this manufacturing module"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Search manufacturing workflows",
      }),
    );

    const input = screen.getByPlaceholderText(
      "Search this manufacturing module",
    );
    expect(input).toHaveFocus();
    await user.type(input, "production order");
    expect(input).toHaveValue("production order");

    await user.click(
      screen.getByRole("button", {
        name: "Close search manufacturing workflows",
      }),
    );

    expect(
      screen.queryByPlaceholderText("Search this manufacturing module"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Search manufacturing workflows",
      }),
    ).toBeInTheDocument();
  });
});
