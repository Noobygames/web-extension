/**
 * Feature E - alliance target claims: who already hit what, so two members do not farm the
 * same inactive.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  normaliseCoordinates,
  indexClaims,
  claimStatus,
  claimCssClass,
  CLAIM_FREE,
  CLAIM_MINE,
  CLAIM_TAKEN,
  CLAIM_STALE,
  DEFAULT_CLAIM_TTL_MINUTES,
} from "../../src/ctxpage/galaxy/targetClaims.js";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const minutesAgo = (minutes) => NOW - minutes * 60000;

// --------------------------------------------------------------------------
// normaliseCoordinates
// --------------------------------------------------------------------------

test("coordinates are normalised from every shape the game and PTRE use", () => {
  assert.equal(normaliseCoordinates("1:2:3"), "1:2:3");
  assert.equal(normaliseCoordinates("[1:2:3]"), "1:2:3");
  assert.equal(normaliseCoordinates("  1 : 2 : 3  "), "1:2:3");
  assert.equal(normaliseCoordinates({ galaxy: 1, system: 2, position: 3 }), "1:2:3");
  assert.equal(normaliseCoordinates({ galaxy: "4", system: "250", position: "8" }), "4:250:8");
});

test("leading zeroes do not create two keys for one target", () => {
  assert.equal(normaliseCoordinates("1:002:3"), normaliseCoordinates("1:2:3"));
});

test("unparseable coordinates yield null rather than a bogus key", () => {
  assert.equal(normaliseCoordinates("not coordinates"), null);
  assert.equal(normaliseCoordinates(""), null);
  assert.equal(normaliseCoordinates(undefined), null);
  assert.equal(normaliseCoordinates({ galaxy: 1 }), null);
});

// --------------------------------------------------------------------------
// indexClaims
// --------------------------------------------------------------------------

test("claims are indexed by coordinate", () => {
  const index = indexClaims([{ coordinates: "[1:2:3]", player: "Xtro", playerId: 101, date: minutesAgo(5) / 1000 }]);

  assert.equal(index.size, 1);
  assert.equal(index.get("1:2:3").playerName, "Xtro");
  assert.equal(index.get("1:2:3").playerId, 101);
});

test("the most recent claim on a target wins", () => {
  const index = indexClaims([
    { coords: "1:2:3", player: "Early", date: minutesAgo(90) / 1000 },
    { coords: "1:2:3", player: "Late", date: minutesAgo(5) / 1000 },
  ]);

  assert.equal(index.get("1:2:3").playerName, "Late");
});

test("an undated claim never displaces a dated one", () => {
  const index = indexClaims([
    { coords: "1:2:3", player: "Dated", date: minutesAgo(5) / 1000 },
    { coords: "1:2:3", player: "Undated" },
  ]);

  assert.equal(index.get("1:2:3").playerName, "Dated");
});

test("both unix seconds and milliseconds are accepted", () => {
  const seconds = indexClaims([{ coords: "1:2:3", date: NOW / 1000 }]).get("1:2:3");
  const millis = indexClaims([{ coords: "1:2:4", date: NOW }]).get("1:2:4");

  assert.equal(seconds.claimedAt, millis.claimedAt);
});

test("malformed entries are skipped instead of poisoning the index", () => {
  const index = indexClaims([null, undefined, { player: "no coords" }, { coords: "nonsense" }, { coords: "1:2:3" }]);

  assert.equal(index.size, 1);
  assert.ok(index.has("1:2:3"));
});

test("an empty or missing claim list yields an empty index", () => {
  assert.equal(indexClaims([]).size, 0);
  assert.equal(indexClaims(undefined).size, 0);
});

// --------------------------------------------------------------------------
// claimStatus
// --------------------------------------------------------------------------

test("an unclaimed coordinate is free", () => {
  const claims = indexClaims([{ coords: "1:2:3", playerId: 101, date: minutesAgo(5) / 1000 }]);

  assert.equal(claimStatus({ coordinates: "9:9:9", claims, now: NOW }).status, CLAIM_FREE);
});

test("a teammate's recent claim marks the target taken", () => {
  const claims = indexClaims([{ coords: "1:2:3", playerId: 202, player: "Mate", date: minutesAgo(10) / 1000 }]);

  const result = claimStatus({ coordinates: "1:2:3", claims, ownPlayerId: 101, now: NOW });

  assert.equal(result.status, CLAIM_TAKEN);
  assert.equal(result.claim.playerName, "Mate");
  assert.ok(result.ageMinutes >= 9 && result.ageMinutes <= 11);
});

test("a player's own claim reads as mine, not as taken", () => {
  const claims = indexClaims([{ coords: "1:2:3", playerId: 101, date: minutesAgo(10) / 1000 }]);

  assert.equal(claimStatus({ coordinates: "1:2:3", claims, ownPlayerId: 101, now: NOW }).status, CLAIM_MINE);
});

test("own-player matching survives a string/number id mismatch", () => {
  const claims = indexClaims([{ coords: "1:2:3", playerId: "101", date: minutesAgo(10) / 1000 }]);

  assert.equal(claimStatus({ coordinates: "1:2:3", claims, ownPlayerId: 101, now: NOW }).status, CLAIM_MINE);
});

test("an expired claim frees the target again", () => {
  const claims = indexClaims([
    { coords: "1:2:3", playerId: 202, date: minutesAgo(DEFAULT_CLAIM_TTL_MINUTES + 1) / 1000 },
  ]);

  assert.equal(claimStatus({ coordinates: "1:2:3", claims, ownPlayerId: 101, now: NOW }).status, CLAIM_STALE);
});

test("a claim exactly at the TTL is still considered active", () => {
  const claims = indexClaims([{ coords: "1:2:3", playerId: 202, date: minutesAgo(DEFAULT_CLAIM_TTL_MINUTES) / 1000 }]);

  assert.equal(claimStatus({ coordinates: "1:2:3", claims, ownPlayerId: 101, now: NOW }).status, CLAIM_TAKEN);
});

test("a shorter TTL expires claims sooner", () => {
  const claims = indexClaims([{ coords: "1:2:3", playerId: 202, date: minutesAgo(30) / 1000 }]);

  assert.equal(
    claimStatus({ coordinates: "1:2:3", claims, ownPlayerId: 101, now: NOW, ttlMinutes: 15 }).status,
    CLAIM_STALE
  );
  assert.equal(
    claimStatus({ coordinates: "1:2:3", claims, ownPlayerId: 101, now: NOW, ttlMinutes: 60 }).status,
    CLAIM_TAKEN
  );
});

test("an undated claim is treated as active rather than silently expired", () => {
  const claims = indexClaims([{ coords: "1:2:3", playerId: 202 }]);
  const result = claimStatus({ coordinates: "1:2:3", claims, ownPlayerId: 101, now: NOW });

  assert.equal(result.status, CLAIM_TAKEN);
  assert.equal(result.ageMinutes, null);
});

test("bracketed galaxy-view coordinates match plain PTRE ones", () => {
  const claims = indexClaims([{ coords: "1:2:3", playerId: 202, date: minutesAgo(5) / 1000 }]);

  assert.equal(claimStatus({ coordinates: "[1:2:3]", claims, now: NOW }).status, CLAIM_TAKEN);
});

test("no claim index at all is safe", () => {
  assert.equal(claimStatus({ coordinates: "1:2:3", claims: null, now: NOW }).status, CLAIM_FREE);
});

// --------------------------------------------------------------------------
// claimCssClass
// --------------------------------------------------------------------------

test("each status maps to its own class, and a free row is left alone", () => {
  assert.equal(claimCssClass(CLAIM_MINE), "ogl-claim-mine");
  assert.equal(claimCssClass(CLAIM_TAKEN), "ogl-claim-taken");
  assert.equal(claimCssClass(CLAIM_STALE), "ogl-claim-stale");
  assert.equal(claimCssClass(CLAIM_FREE), null, "an unclaimed row must not be restyled");
  assert.equal(claimCssClass("anything else"), null);
});
