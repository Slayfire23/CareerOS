import { expect, it } from "vitest";
import { formatMonth, formatMonthRange } from "@/lib/months";

it("formats stored months for display without changing other values", () => {
  expect(formatMonth("2023-06")).toBe("Jun 2023");
  expect(formatMonth("2021-12")).toBe("Dec 2021");
  expect(formatMonth("2021-00")).toBe("2021-00");
  expect(formatMonth("2021-13")).toBe("2021-13");
  expect(formatMonth("June 2023")).toBe("June 2023");
});

it("shows Present for ongoing entries", () => {
  expect(formatMonthRange("2023-06", null)).toBe("Jun 2023 – Present");
  expect(formatMonthRange("2020-01", "2021-02")).toBe("Jan 2020 – Feb 2021");
});
