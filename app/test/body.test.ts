import { describe, it, expect } from "vitest";
import { isRegion, parseRegionMessage, regionAt, regionNumber, regions } from "../body/regions";
describe("body picker regions", () => {
  it("maps both shoulders, torso, hips and both thighs consistently front and back", () => {
    for (const x of [-1, 1]) {
      expect(regionAt({ x: .24 * x, y: 1.6 })).toBe("shoulders");
      expect(regionAt({ x: .16 * x, y: .65 })).toBe("legs");
      expect(regionAt({ x: .2 * x, y: 1.08 })).toBe("hips");
    }
    expect(regionAt({ x: .1, y: 1.4 })).toBe("upper-back");
    expect(regions.map(([id]) => regionNumber(id))).toEqual([1, 2, 3, 4]);
  });
  it("leaves the head, empty space and invalid coordinates unselected", () => {
    for (const p of [{ x: 0, y: 1.95 }, { x: 3, y: 1 }, { x: 0, y: -1 }, { x: NaN, y: 1 }]) expect(regionAt(p)).toBeNull();
    expect(regionNumber("")).toBe(0);
  });
  it("accepts only the native region message contract", () => {
    expect(parseRegionMessage('{"type":"region","id":"shoulders"}')).toBe("shoulders");
    expect(parseRegionMessage({ type: "region", id: "legs" })).toBe("legs");
    for (const data of [null, "", "{", {}, [], { type: "region", id: "head" }, { type: "other", id: "hips" }]) expect(parseRegionMessage(data)).toBeNull();
    expect(isRegion("hips")).toBe(true);
    expect(isRegion("head")).toBe(false);
  });
});
