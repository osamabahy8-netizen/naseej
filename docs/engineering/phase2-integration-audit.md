# Naseej Phase 2 Integration Audit
**Reference date:** 2026-11-20  
**Purpose:** Preserve the audit findings as the engineering baseline for the Phase 2 catalogue integration.

## Verified source findings
- The uploaded archive `Naseej_Phase2_BOM_Viewer_Integration(1).zip` contained 154 entries.
- The archive included Phase 1 and Phase 2 libraries, ten JSON examples, OBJ/MTL previews, cut lists, illustrative images, BOM reports, and tests.
- Python tests: `python -m pytest phase1/tests phase2/tests -q` — **31 passed**.
- The archive's Three.js adapter converted all ten JSON examples, representing **207 parts**.
- The ten examples cover five families, with models A and B for each: bags/accessories, shoes, jewelry, gondola shelving, and cashier counters.
- The live Naseej repository already has `importPhase2ProductFile()`, which calls `NaseejThreeJSAdapter.auditProduct()` and `toViewerObjects()`, then updates the model, cut list, and part properties.

## Compatibility constraint
The archive adapter at `phase2/integration/naseej-threejs-adapter.js` exports `partToViewerObject` and `toViewerObjects`, but does **not** export `auditProduct()`. The current repository adapter does export `auditProduct()` and supports both `geometry.parts` and `parts`. Do not replace the repository adapter with the archive copy until the API contract is deliberately unified and tested.

## Engineering limitations
- OBJ/MTL files and current images are simplified previews, not solid CAD models or hollow tube geometry.
- CSV files are preliminary cut lists, not final workshop drawings. Tolerances, cut allowances, holes, joints, and material thicknesses still require verification.
- No live market prices or currency are configured. Monetary cost must remain unapproved until real supplier quotations and a currency are entered.
- The designs are Type B proposals according to the source README, not copies of commercial manufacturers' products.

## Integration sequence
1. Preserve the current repository adapter and its `auditProduct()` contract.
2. Add the ten example product files and preview assets under a clearly named library directory.
3. Add a manifest mapping each product to its family, model, image, JSON file, and cut-list file.
4. Connect catalogue cards to the existing import flow so a product opens directly in the 3D viewer; avoid duplicating conversion logic.
5. Add automated JavaScript tests for `auditProduct()` and `toViewerObjects()` against every example.
6. Test product opening, part selection, exploded view, cut list, and mobile layout in a real browser.
7. Do not label any output as a final manufacturing drawing until joints, holes, tolerances, and structural checks are complete.

## Acceptance gates
- All ten products load through the repository's existing adapter without replacing its API.
- Product identity, image, JSON, and cut-list references remain correctly paired.
- The viewer and cut-list update from the same selected product.
- Existing catalogue and design features remain intact.
- Any unsupported or unverified engineering data is visibly marked as provisional.

## Status
This document records the audit baseline. It does not itself implement the product import or establish that browser/mobile integration has passed.
