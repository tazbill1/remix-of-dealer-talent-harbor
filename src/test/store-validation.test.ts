import { describe, it, expect } from "vitest";
import { validateStore, storeValues, storeMissingInfo, storeMissingFields, storeMissingFieldPreview, storeToForm, isValidUsPhone } from "@/lib/store-validation";

const full = { ...storeToForm(), name: "Smith Toyota", brand: "Toyota", city: "Dallas", state: "TX", manager_name: "Ann", manager_phone: "(214) 555-0123" };

describe("store setup rules", () => {
  it("requires the seven required fields", () => {
    const e = validateStore({ ...storeToForm(), timezone: "" });
    expect(e.name).toBe("Store name is required");
    expect(Object.keys(e).sort()).toEqual(["brand", "city", "manager_name", "manager_phone", "name", "state", "timezone"]);
  });
  it("passes with only required fields", () => expect(validateStore(full)).toEqual({}));
  it("checks US phone", () => {
    expect(isValidUsPhone("+1 214-555-0123")).toBe(true);
    expect(isValidUsPhone("555-0123")).toBe(false);
    expect(validateStore({ ...full, manager_phone: "12345" }).manager_phone).toBe("Enter a valid US phone number");
  });
  it("defaults blank assistant to Penny", () => expect(storeValues({ ...full, assistant_name: " " }).assistant_name).toBe("Penny"));
  it("flags existing stores missing info", () => {
    expect(storeMissingInfo({ ...full })).toBe(false);
    expect(storeMissingInfo({ ...full, brand: null })).toBe(true);
  });
  it("identifies only actual required gaps, not optional contact fields", () => {
    expect(storeMissingFields({ ...full, manager_name: null, manager_phone: " " })).toEqual(["manager_name", "manager_phone"]);
    expect(storeMissingFields(full)).toEqual([]);
  });
  it("keeps the existing invalid manager phone warning", () => {
    expect(storeMissingFields({ ...full, manager_phone: "12345" })).toEqual(["manager_phone"]);
  });
  it("shows all three gaps without hiding any", () => {
    expect(storeMissingFieldPreview(["brand", "city", "state"])).toEqual({ visible: ["brand", "city", "state"], remaining: 0 });
  });
  it("shows only the first two of four gaps and counts the other two", () => {
    expect(storeMissingFieldPreview(["brand", "city", "state", "manager_phone"])).toEqual({ visible: ["brand", "city"], remaining: 2 });
  });
  it("counts all remaining gaps for a completely incomplete store", () => {
    const fields = storeMissingFields({});
    expect(fields).toHaveLength(7);
    expect(storeMissingFieldPreview(fields)).toEqual({ visible: ["name", "brand"], remaining: 5 });
  });
});
