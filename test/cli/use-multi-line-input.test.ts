// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMultiLineInput } from "../../src/cli/hooks/useMultiLineInput.js";

describe("useMultiLineInput", () => {
  it("starts with empty state", () => {
    const { result } = renderHook(() => useMultiLineInput());
    const [state] = result.current;
    expect(state.value).toBe("");
    expect(state.lines).toEqual([""]);
    expect(state.isMultiLine).toBe(false);
  });

  describe("insertChar", () => {
    it("appends a character to the value", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].insertChar("a");
      });

      expect(result.current[0].value).toBe("a");

      act(() => {
        result.current[1].insertChar("b");
      });

      expect(result.current[0].value).toBe("ab");
    });
  });

  describe("insertNewline", () => {
    it("creates multi-line state", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].insertChar("a");
      });

      act(() => {
        result.current[1].insertNewline();
      });

      act(() => {
        result.current[1].insertChar("b");
      });

      const [state] = result.current;
      expect(state.value).toBe("a\nb");
      expect(state.isMultiLine).toBe(true);
      expect(state.lines).toEqual(["a", "b"]);
      expect(state.lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("deleteBack", () => {
    it("removes the last character", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].insertChar("a");
        result.current[1].insertChar("b");
        result.current[1].insertChar("c");
      });

      act(() => {
        result.current[1].deleteBack();
      });

      expect(result.current[0].value).toBe("ab");
    });

    it("collapses lines when deleting at a newline boundary", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].setValue("hello\n");
      });

      expect(result.current[0].isMultiLine).toBe(true);

      act(() => {
        result.current[1].deleteBack();
      });

      expect(result.current[0].value).toBe("hello");
      expect(result.current[0].isMultiLine).toBe(false);
      expect(result.current[0].lines).toEqual(["hello"]);
    });
  });

  describe("deleteWord", () => {
    it("removes the last word", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].setValue("hello world");
      });

      act(() => {
        result.current[1].deleteWord();
      });

      expect(result.current[0].value).toBe("hello ");
    });

    it("handles trailing spaces by stripping them first, then the word", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].setValue("hello world   ");
      });

      act(() => {
        result.current[1].deleteWord();
      });

      expect(result.current[0].value).toBe("hello ");
    });
  });

  describe("clearLine", () => {
    it("clears everything on a single-line input", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].setValue("hello");
      });

      act(() => {
        result.current[1].clearLine();
      });

      expect(result.current[0].value).toBe("");
    });

    it("removes only the current line on multi-line input", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].setValue("first\nsecond\nthird");
      });

      act(() => {
        result.current[1].clearLine();
      });

      // Should keep up to and including the last newline, removing "third"
      expect(result.current[0].value).toBe("first\nsecond\n");
      expect(result.current[0].isMultiLine).toBe(true);
    });
  });

  describe("submitAndClear", () => {
    it("returns the trimmed value and resets to empty", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].setValue("  hello world  ");
      });

      let submitted = "";
      act(() => {
        submitted = result.current[1].submitAndClear();
      });

      expect(submitted).toBe("hello world");
      expect(result.current[0].value).toBe("");
    });

    it("returns empty string when value is blank", () => {
      const { result } = renderHook(() => useMultiLineInput());

      let submitted = "";
      act(() => {
        submitted = result.current[1].submitAndClear();
      });

      expect(submitted).toBe("");
      expect(result.current[0].value).toBe("");
    });
  });

  describe("setValue", () => {
    it("sets the full value (for Tab completion)", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].setValue("completed-command --flag");
      });

      expect(result.current[0].value).toBe("completed-command --flag");
      expect(result.current[0].lines).toEqual(["completed-command --flag"]);
    });
  });

  describe("clear", () => {
    it("resets to empty string", () => {
      const { result } = renderHook(() => useMultiLineInput());

      act(() => {
        result.current[1].setValue("some content\nwith lines");
      });

      expect(result.current[0].value).toBe("some content\nwith lines");

      act(() => {
        result.current[1].clear();
      });

      expect(result.current[0].value).toBe("");
      expect(result.current[0].lines).toEqual([""]);
      expect(result.current[0].isMultiLine).toBe(false);
    });
  });

  describe("actions referential stability", () => {
    it("returns the same actions object across renders", () => {
      const { result, rerender } = renderHook(() => useMultiLineInput());

      const firstActions = result.current[1];

      act(() => {
        result.current[1].insertChar("x");
      });

      rerender();

      const secondActions = result.current[1];
      expect(secondActions).toBe(firstActions);
    });
  });
});
