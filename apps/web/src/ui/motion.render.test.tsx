import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Mic } from "lucide-react";
import { SegmentedControl } from "../onboarding/controls";
import { GoFan } from "../shell/composer/GoFan";
import { EmptyState } from "../shell/EmptyState";
import { ChartBlock, TableBlock } from "../components/LiveBlocks";
import { ToastHost } from "./Toast";
import { toast, useToasts } from "./toastStore";

describe("motion surfaces render", () => {
  it("segmented control draws the pill only in the selected item", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl label="Theme" options={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} value="b" onChange={() => {}} />,
    );
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(1);
    expect(html).toContain('aria-checked="true"');
  });

  it("go fan renders its items when open and nothing when closed", () => {
    const items = [{ key: "mic", label: "Speak", icon: Mic, active: false, onClick: () => {} }];
    expect(renderToStaticMarkup(<GoFan open items={items} dir="right" />)).toContain('aria-label="Speak"');
    expect(renderToStaticMarkup(<GoFan open={false} items={items} dir="right" />)).not.toContain("Speak");
  });

  it("empty state keeps its example prompts", () => {
    expect(renderToStaticMarkup(<EmptyState />)).toContain("Track weekly orders for my bakery");
  });

  it("table rows and chart bars render with data", () => {
    const table = renderToStaticMarkup(
      <TableBlock node={{ id: "t", type: "table", columns: ["A", "B"], rows: [["1", "2"], ["3", "4"]] } as never} style={{}} />,
    );
    expect(table.match(/<tr/g)?.length).toBe(3);
    const bars = renderToStaticMarkup(
      <ChartBlock node={{ id: "c", type: "chart", kind: "bar", labels: ["x", "y"], series: [{ name: "s", values: [1, 3] }] } as never} style={{}} />,
    );
    expect(bars.match(/<rect/g)?.length).toBe(2);
    const line = renderToStaticMarkup(
      <ChartBlock node={{ id: "c", type: "chart", kind: "line", labels: ["x", "y"], series: [{ name: "s", values: [1, 3] }] } as never} style={{}} />,
    );
    expect(line).toContain("<polyline");
  });

  it("toasts queue, cap at three and dismiss", () => {
    useToasts.setState({ toasts: [] });
    for (const m of ["a", "b", "c", "d"]) toast(m, 60000);
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(["b", "c", "d"]);
    expect(renderToStaticMarkup(<ToastHost />)).toContain("d");
    useToasts.getState().dismiss(useToasts.getState().toasts[0].id);
    expect(useToasts.getState().toasts).toHaveLength(2);
  });
});
