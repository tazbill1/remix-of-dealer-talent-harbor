import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicantNotes } from "@/components/applicant-notes";
afterEach(cleanup);
describe("Applicant notes", () => {
  it("saves the typed note on an explicit click and confirms success", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<ApplicantNotes initialNotes="" onSave={save}/>);
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Call after 4 pm" } });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("Call after 4 pm"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Notes saved"));
  });
  it("retains the draft and allows retry after a rejected save", async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ApplicantNotes initialNotes="Old note" onSave={save}/>);
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "New note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("weren’t saved"));
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("New note");
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });
  it("does not reuse one applicant's draft for another", () => {
    const save = vi.fn();
    const {rerender}=render(<ApplicantNotes key="a" initialNotes="Jane's note" onSave={save}/>);
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Jane's draft" } });
    rerender(<ApplicantNotes key="b" initialNotes="Sam's note" onSave={save}/>);
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Sam's note");
    expect(save).not.toHaveBeenCalled();
  });
});