/**
 * Feature E - shared target claims.
 *
 * Two alliance members farming the same inactive is wasted fuel for one of them. PTRE already
 * knows which targets teammates have recently hit; this turns that into a colour in galaxy view.
 *
 * Pure state machine over data already fetched. It decides what a row should look like. It does
 * not fetch, does not push, and deliberately exposes no probe or dispatch action - a claim is a
 * hint about a coordinate, never a button that attacks it.
 */

/** How a coordinate should be shown. */
export const CLAIM_FREE = "free";
export const CLAIM_MINE = "mine";
export const CLAIM_TAKEN = "taken";
export const CLAIM_STALE = "stale";

/** A claim older than this is treated as expired: the target is fair game again. */
export const DEFAULT_CLAIM_TTL_MINUTES = 120;

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    // Accept both seconds and milliseconds - PTRE reports unix seconds.
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Normalises "[1:2:3]", " 1:2:3 " and {galaxy, system, position} to "1:2:3". */
export function normaliseCoordinates(input) {
  if (input && typeof input === "object") {
    const { galaxy, system, position } = input;
    if ([galaxy, system, position].every((n) => Number.isFinite(Number(n)))) {
      return `${Number(galaxy)}:${Number(system)}:${Number(position)}`;
    }
    return null;
  }

  const match = String(input ?? "").match(/(\d+)\s*:\s*(\d+)\s*:\s*(\d+)/);

  return match ? `${Number(match[1])}:${Number(match[2])}:${Number(match[3])}` : null;
}

/**
 * Indexes a PTRE claim list by coordinate, keeping only the most recent claim per target.
 *
 * @param {Array<{coordinates?: string, coords?: string, player?: string, playerId?: number, date?: *}>} claims
 * @return {Map<string, object>}
 */
export function indexClaims(claims) {
  const index = new Map();

  (claims || []).forEach((claim) => {
    if (!claim) return;

    const coordinates = normaliseCoordinates(claim.coordinates ?? claim.coords);
    if (!coordinates) return;

    const claimedAt = toTimestamp(claim.date ?? claim.timestamp);
    const entry = {
      coordinates,
      playerId: claim.playerId ?? claim.player_id ?? null,
      playerName: claim.player ?? claim.playerName ?? null,
      claimedAt: Number.isFinite(claimedAt) ? claimedAt : null,
    };

    const existing = index.get(coordinates);
    // A target hit twice keeps the newer claim; an undated claim never displaces a dated one.
    if (existing && (existing.claimedAt ?? -Infinity) >= (entry.claimedAt ?? -Infinity)) return;

    index.set(coordinates, entry);
  });

  return index;
}

/**
 * Decides how one coordinate should be shown.
 *
 * @param {object} params
 * @param {string|object} params.coordinates
 * @param {Map<string, object>} params.claims
 * @param {number|string} [params.ownPlayerId]  so a player's own claims read as "mine", not "taken"
 * @param {number} [params.now]
 * @param {number} [params.ttlMinutes]
 * @return {{status: string, claim: object|null, ageMinutes: number|null}}
 */
export function claimStatus({
  coordinates,
  claims,
  ownPlayerId,
  now = Date.now(),
  ttlMinutes = DEFAULT_CLAIM_TTL_MINUTES,
}) {
  const key = normaliseCoordinates(coordinates);
  const claim = key && claims ? claims.get(key) : null;

  if (!claim) return { status: CLAIM_FREE, claim: null, ageMinutes: null };

  const ageMinutes = claim.claimedAt === null ? null : Math.max(0, (now - claim.claimedAt) / 60000);

  if (ageMinutes !== null && ageMinutes > ttlMinutes) {
    return { status: CLAIM_STALE, claim, ageMinutes };
  }

  const isOwn = ownPlayerId !== undefined && ownPlayerId !== null && String(claim.playerId) === String(ownPlayerId);

  return { status: isOwn ? CLAIM_MINE : CLAIM_TAKEN, claim, ageMinutes };
}

const CLAIM_CLASSES = Object.freeze({
  [CLAIM_MINE]: "ogl-claim-mine",
  [CLAIM_TAKEN]: "ogl-claim-taken",
  [CLAIM_STALE]: "ogl-claim-stale",
});

/** CSS class for a status, or null when the row should be left alone. */
export function claimCssClass(status) {
  return CLAIM_CLASSES[status] ?? null;
}
