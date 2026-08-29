/**
 * The page lists two files have to agree on.
 *
 * `ogCore.js` decides whether to fetch the `technoDetail` chunk; `technoDetail()`
 * decides whether to do anything once it is loaded. Before Phase 5 of
 * refactoring.md there was one check, inside the function. Now there are two, and
 * only one of them runs if the other says no - so a page dropped from the outer
 * list is not an error anywhere. The building detail panel just stops appearing on
 * that page, and nothing fails.
 *
 * They read the same frozen list, and this pins its contents so a "cleanup" that
 * drops a page has to be deliberate. `lfbuildings` and `lfresearch` are the ones
 * worth naming: they are lifeform pages, so a developer on a server without
 * lifeforms never sees them break.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BUILD_PAGES,
  LEVELED_BUILDING_PAGES,
  RESEARCH_PAGES,
  isBuildPage,
  isLeveledBuildingPage,
  isResearchPage,
} from "../../src/util/enum/gamePages.js";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");

test("the build pages are the seven OGame construction and research components", () => {
  assert.deepEqual([...BUILD_PAGES].sort(), [
    "defenses",
    "facilities",
    "lfbuildings",
    "lfresearch",
    "research",
    "shipyard",
    "supplies",
  ]);
});

test("every build page is recognised, and nothing else is", () => {
  for (const page of BUILD_PAGES) assert.equal(isBuildPage(page), true, `${page} was not recognised`);

  for (const page of ["overview", "galaxy", "fleetdispatch", "messages", "highscore", "shop", "", undefined]) {
    assert.equal(isBuildPage(page), false, `${page} should not be a build page`);
  }
});

test("the list cannot be mutated by a caller", () => {
  // It is shared between the core bundle and a chunk. A push in one would change
  // what the other sees, at a distance nobody would look for.
  assert.throws(() => BUILD_PAGES.push("overview"));
  assert.equal(BUILD_PAGES.includes("overview"), false);
});

test("the two families inside the build pages split them without overlap", () => {
  // `technoDetail()` picks `research()` or `building()` from these. A page in both
  // lists would take the first branch and silently price a building as a research;
  // a page in neither leaves `techno` undefined and the next line throws.
  assert.deepEqual([...RESEARCH_PAGES].sort(), ["lfresearch", "research"]);
  assert.deepEqual([...LEVELED_BUILDING_PAGES].sort(), ["facilities", "lfbuildings", "supplies"]);

  for (const page of RESEARCH_PAGES) assert.equal(isLeveledBuildingPage(page), false, `${page} is in both lists`);
  for (const page of LEVELED_BUILDING_PAGES) assert.equal(isResearchPage(page), false, `${page} is in both lists`);
  for (const page of [...RESEARCH_PAGES, ...LEVELED_BUILDING_PAGES]) {
    assert.equal(isBuildPage(page), true, `${page} has to be a build page to be reached at all`);
  }
});

test("shipyard and defenses belong to no family, on purpose", () => {
  // They are build pages - the chunk loads there - but their entries have no level,
  // so both `updateResearchDetails()` branches skip them. Pinned because "completing"
  // LEVELED_BUILDING_PAGES with them is the obvious wrong fix: `building()` has no
  // formula for a ship and would return undefined costs.
  for (const page of ["shipyard", "defenses"]) {
    assert.equal(isBuildPage(page), true);
    assert.equal(isResearchPage(page), false);
    assert.equal(isLeveledBuildingPage(page), false);
  }
});

test("both family lists are frozen as well", () => {
  assert.throws(() => RESEARCH_PAGES.push("supplies"));
  assert.throws(() => LEVELED_BUILDING_PAGES.push("research"));
});

test("neither side of the chunk boundary rebuilds the membership check by hand", () => {
  // The point of the module. Both files still name individual pages, and they
  // should: `technoDetail()` treats research pages differently from supply pages
  // inside its body. What must not come back is the *membership* test - the
  // `page == "supplies" || page == "facilities" || ...` chain that used to be the
  // guard - because then the two sides can disagree and the outer one wins in
  // silence. Three or more of the seven in one statement is that chain.
  for (const name of ["src/ogCore.js", "src/ctxpage/technoDetail/index.js"]) {
    const source = fs.readFileSync(path.join(projectRoot, name), "utf8");
    assert.match(source, /isBuildPage/, `${name} no longer uses the shared list`);

    source.split(/[\n;]/).forEach((statement, index) => {
      const named = BUILD_PAGES.filter((page) => statement.includes(`"${page}"`));
      assert.ok(
        named.length < 3,
        `${name} statement ${index + 1} lists ${named.join(", ")} - use isBuildPage() instead`
      );
    });
  }
});
