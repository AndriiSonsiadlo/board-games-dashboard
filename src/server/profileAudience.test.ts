import { expect, test } from "vitest";
import { profileAudience } from "./profileAudience";

test("the admin view needs both an admin session and an explicit ?view=admin", () => {
  expect(profileAudience(false, undefined)).toBe("public");
  expect(profileAudience(true, undefined)).toBe("public");
  expect(profileAudience(false, "admin")).toBe("public");
  expect(profileAudience(true, ["admin"])).toBe("public");
  expect(profileAudience(true, "admin")).toBe("admin");
});
