// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RatingValue } from "@/domain/types";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RatingInput } from "@/components/ui/rating";
import { RatingStars } from "@/components/ui/rating-stars";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";

describe("Switch", () => {
  it("is a named switch that toggles with click and keyboard", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [on, setOn] = useState(false);
      return (
        <>
          <span id="lbl">Riduci animazioni</span>
          <Switch checked={on} onChange={setOn} labelledBy="lbl" />
        </>
      );
    }
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Riduci animazioni" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    sw.focus();
    await user.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "false");
  });
});

describe("RatingInput", () => {
  it("offers ten half-star choices and reports the picked value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RatingInput value={null} onChange={onChange} label="Il tuo voto" />);
    const group = screen.getByRole("group", { name: "Il tuo voto" });
    expect(group.querySelectorAll("input[type=radio]")).toHaveLength(10);
    await user.click(screen.getByLabelText("4 su 5"));
    expect(onChange).toHaveBeenCalledWith(8);
  });

  it("clears the rating when the current value is clicked again", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [v, setV] = useState<RatingValue | null>(6);
      return (
        <>
          <RatingInput value={v} onChange={setV} label="Voto" />
          <output>{v ?? "nessuno"}</output>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByLabelText("3 su 5"));
    expect(screen.getByRole("status")).toHaveTextContent("nessuno");
  });

  it("read-only stars announce the value", () => {
    render(<RatingStars value={7} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("3,5 su 5");
  });
});

describe("Segmented", () => {
  it("is a radio group with roving focus on arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Segmented
        label="Tipo"
        value="all"
        onChange={onChange}
        options={[
          { value: "all", label: "Tutti" },
          { value: "movie", label: "Film" },
          { value: "series", label: "Serie" },
        ]}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    radios[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("movie");
    expect(radios[1]).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    // Wraps around from the first option to the last.
    expect(onChange).toHaveBeenLastCalledWith("series");
  });
});

describe("ProgressBar", () => {
  it("clamps and exposes the value as a percentage", () => {
    render(<ProgressBar value={1.4} label="Avanzamento" />);
    expect(screen.getByRole("progressbar", { name: "Avanzamento" })).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("EmptyState", () => {
  it("shows the message and the next action", () => {
    render(<EmptyState icon={null} title="La tua wishlist è vuota." action={<a href="/library">Esplora</a>} />);
    expect(screen.getByText("La tua wishlist è vuota.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Esplora" })).toHaveAttribute("href", "/library");
  });
});
