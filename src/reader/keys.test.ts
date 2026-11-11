import { describe, expect, it } from "vitest";
import { isActivatable, isTypingTarget, keyAction, shouldHandleKey } from "./keys";

describe("keyAction", () => {
  it("maps navigation keys", () => {
    expect(keyAction({ key: "ArrowLeft" })).toBe("left");
    expect(keyAction({ key: "ArrowRight" })).toBe("right");
    expect(keyAction({ key: "PageUp" })).toBe("prev");
    expect(keyAction({ key: "PageDown" })).toBe("next");
    expect(keyAction({ key: "Home" })).toBe("first");
    expect(keyAction({ key: "End" })).toBe("last");
  });
  it("uses Space for next and Shift+Space for previous", () => {
    expect(keyAction({ key: " " })).toBe("next");
    expect(keyAction({ key: " ", shiftKey: true })).toBe("prev");
  });
  it("maps Escape and F11", () => {
    expect(keyAction({ key: "Escape" })).toBe("escape");
    expect(keyAction({ key: "F11" })).toBe("fullscreen");
  });
  it("leaves shortcuts with modifiers alone (zoom, find, browser keys)", () => {
    expect(keyAction({ key: "ArrowLeft", ctrlKey: true })).toBeNull();
    expect(keyAction({ key: "ArrowRight", metaKey: true })).toBeNull();
    expect(keyAction({ key: "ArrowLeft", altKey: true })).toBeNull();
    expect(keyAction({ key: "F11", ctrlKey: true })).toBeNull();
  });
  it("ignores other keys", () => {
    expect(keyAction({ key: "a" })).toBeNull();
    expect(keyAction({ key: "Enter" })).toBeNull();
  });
});

describe("focus rules", () => {
  it("treats text controls as typing targets", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
  it("knows which elements Space activates", () => {
    expect(isActivatable({ tagName: "BUTTON" })).toBe(true);
    expect(isActivatable({ tagName: "a" })).toBe(true);
    expect(isActivatable({ tagName: "DIV" })).toBe(false);
  });
  it("does not steal keys from fields, nor Space from buttons", () => {
    expect(shouldHandleKey({ key: "ArrowLeft" }, { tagName: "INPUT" })).toBe(false);
    expect(shouldHandleKey({ key: " " }, { tagName: "BUTTON" })).toBe(false);
    expect(shouldHandleKey({ key: " " }, { tagName: "BODY" })).toBe(true);
    // arrows still page when a button (e.g. "next page") has focus
    expect(shouldHandleKey({ key: "ArrowRight" }, { tagName: "BUTTON" })).toBe(true);
    expect(shouldHandleKey({ key: "PageDown" }, { tagName: "BUTTON" })).toBe(true);
  });
});
