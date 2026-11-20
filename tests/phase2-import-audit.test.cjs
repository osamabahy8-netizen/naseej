const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const adapter = require("../naseej-threejs-adapter.js");

const fixturePath = path.join(__dirname, "fixtures", "phase2-import-sample.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

test("sample import passes source-data and preview conversion audit", () => {
  const audit = adapter.auditProduct(fixture);
  const objects = adapter.toViewerObjects(fixture);
  assert.equal(audit.partCount, 3);
  assert.equal(audit.quantityTotal, 3);
  assert.equal(objects.length, audit.partCount);
  assert.ok(objects.every(item => item.w > 0 && item.h > 0 && item.d > 0));
});

test("upright profile keeps its length on the viewer vertical axis", () => {
  const upright = adapter.partToViewerObject(fixture.parts.find(part => part.part_id === "UPR-FL"));
  assert.deepEqual([upright.w, upright.h, upright.d, upright.y], [40, 1575, 40, 25]);
});

test("rotated base cross member preserves its source quarter-turn", () => {
  const cross = adapter.partToViewerObject(fixture.parts.find(part => part.part_id === "BASE-X-L"));
  assert.deepEqual([cross.w, cross.h, cross.d, cross.ry], [380, 20, 40, -90]);
});

test("sheet thickness is never silently guessed", () => {
  const bad = { meta: { unit: "mm" }, parts: [{
    part_id: "SHELF-X", name: "Shelf", profile_or_sheet: "",
    width: 500, height: 300, length: 0, position: [0, 0, 100], rotation: [0, 0, 0]
  }] };
  assert.throws(() => adapter.auditProduct(bad), /missing a confirmed sheet thickness/);
});

test("unsupported units are rejected rather than scaled implicitly", () => {
  const bad = { meta: { unit: "cm" }, parts: [{
    part_id: "BAR-X", name: "Bar", profile_or_sheet: "30x30x2",
    length: 500, position: [0, 0, 0], rotation: [0, 0, 0]
  }] };
  assert.throws(() => adapter.auditProduct(bad), /expects millimetres/);
});

test("all supplied Phase 2 examples pass when the example library is present", t => {
  const examplesDir = path.join(__dirname, "..", "phase2", "examples");
  if (!fs.existsSync(examplesDir)) return t.skip("Phase 2 examples are distributed in the separate library ZIP");
  const files = fs.readdirSync(examplesDir).filter(name => name.endsWith(".json"));
  assert.equal(files.length, 10);
  let partCount = 0;
  for (const file of files) {
    const product = JSON.parse(fs.readFileSync(path.join(examplesDir, file), "utf8"));
    const audit = adapter.auditProduct(product);
    assert.equal(adapter.toViewerObjects(product).length, audit.partCount, file);
    partCount += audit.partCount;
  }
  assert.equal(partCount, 207);
});
