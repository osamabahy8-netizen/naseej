const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const adapter = require("../naseej-threejs-adapter.js");

const examplesDir = path.join(__dirname, "..", "phase2", "examples");

test("all Phase 2 examples pass source-data and preview conversion audit", () => {
  const files = fs.readdirSync(examplesDir).filter(name => name.endsWith(".json"));
  assert.equal(files.length, 10, "expected the ten supplied Phase 2 examples");
  let partCount = 0;
  for (const file of files) {
    const product = JSON.parse(fs.readFileSync(path.join(examplesDir, file), "utf8"));
    const audit = adapter.auditProduct(product);
    const objects = adapter.toViewerObjects(product);
    assert.equal(objects.length, audit.partCount, file);
    assert.equal(audit.unit, "mm", file);
    assert.ok(objects.every(item => item.w > 0 && item.h > 0 && item.d > 0), file);
    partCount += objects.length;
  }
  assert.equal(partCount, 207);
});

test("upright profile keeps its length on the viewer vertical axis", () => {
  const product = JSON.parse(fs.readFileSync(path.join(examplesDir, "shoes_B_1200x1600x420.json"), "utf8"));
  const upright = adapter.partToViewerObject(product.parts.find(part => part.part_id === "UPR-FL"));
  assert.equal(upright.w, 40);
  assert.equal(upright.h, 1575);
  assert.equal(upright.d, 40);
  assert.equal(upright.y, 25);
});

test("rotated base cross member preserves its source quarter-turn", () => {
  const product = JSON.parse(fs.readFileSync(path.join(examplesDir, "shoes_B_1200x1600x420.json"), "utf8"));
  const cross = adapter.partToViewerObject(product.parts.find(part => part.part_id === "BASE-X-L"));
  assert.equal(cross.w, 380);
  assert.equal(cross.h, 20);
  assert.equal(cross.d, 40);
  assert.equal(cross.ry, -90);
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
