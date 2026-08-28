/**
 * `src/background.js` - the service worker.
 *
 * It is the only part of the extension that outlives a page: Chrome unloads it
 * between events and restores nothing, so every piece of state has to survive a
 * round trip through `chrome.storage.local`. A defect here shows up as a
 * notification that never fires or fires twice, hours later, on a machine nobody is
 * looking at. That is why it gets its own suite even though it has no exports.
 *
 * There are no exports: the module registers three listeners and keeps its two
 * objects in module scope. So the tests drive it exactly the way Chrome does, by
 * calling the registered listeners, and observe it through the chrome stub.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "./helpers/globals.js";

/** The module registers listeners at import time, so it is imported once, here. */
const browser = setupBrowser({ chrome: true });
const chromeStub = globalThis.chrome;

// background.js narrates every step to the console. Useful in a service worker,
// deafening in a test run.
const quiet = ["log", "warn", "debug"].map((level) => {
  const original = console[level];
  console[level] = () => {};
  return () => (console[level] = original);
});

await import("../src/background.js");

const [onMessage] = chromeStub._listeners.message;
const [onAlarm] = chromeStub._listeners.alarm;
const [onNotificationClicked] = chromeStub._listeners.notificationClicked;

test.after(() => {
  quiet.forEach((restore) => restore());
  browser.cleanup();
});

/**
 * Sends a message the way `chrome.runtime.onMessage` does and waits for the
 * listener's detached async work.
 *
 * The listener returns `true` synchronously and does everything inside an IIFE, so
 * there is nothing to await. Draining the microtask queue a few times is what a
 * caller can actually do - and is itself worth knowing about this design.
 */
async function send(eventType, message) {
  let response;
  onMessage({ eventType, message }, {}, (value) => (response = value));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return response;
}

async function drain(promise) {
  await promise;
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Wipes everything the previous test left in the stub. */
function reset() {
  chromeStub._store.clear();
  chromeStub._alarms.clear();
  chromeStub._notifications.clear();
  chromeStub._tabs.length = 0;
  const calls = chromeStub._calls;
  for (const key of [
    "alarmsCreated",
    "alarmsCleared",
    "notificationsCreated",
    "notificationsCleared",
    "tabsUpdated",
    "tabsCreated",
  ]) {
    calls[key].length = 0;
  }
}

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function notification(overrides = {}) {
  return {
    id: "fleet-4711",
    domain: "s1-en.ogame.gameforge.com",
    title: "Fleet returning",
    message: "Your fleet arrives shortly",
    when: inAnHour(),
    priority: 0,
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
    ...overrides,
  };
}

const stored = () => chromeStub._store.get("ogi-notifications");

// --------------------------------------------------------------------------
// Persistence
// --------------------------------------------------------------------------

test("an empty storage is initialised with an empty notification set, and written back", async () => {
  reset();
  await send("ogi-notification-scheduled", notification());

  assert.ok(stored(), "the worker persists on every message, not only on change");
  assert.ok(stored().notifications);
  assert.ok(stored().lastSynced);
});

test("a scheduled notification is persisted and gets an alarm at its own time", async () => {
  reset();
  const item = notification();

  await send("ogi-notification-scheduled", item);

  assert.deepEqual(stored().notifications[item.id], item);
  assert.deepEqual(chromeStub._calls.alarmsCreated, [{ name: item.id, when: new Date(item.when).getTime() }]);
});

test("rescheduling the same notification to a new time replaces the alarm", async () => {
  reset();
  const item = notification();
  await send("ogi-notification-scheduled", item);

  const later = notification({ when: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() });
  await send("ogi-notification-scheduled", later);

  assert.equal(chromeStub._calls.alarmsCreated.length, 2);
  assert.equal(chromeStub._calls.alarmsCreated[1].when, new Date(later.when).getTime());
  assert.equal(stored().notifications[item.id].when, later.when);
});

test("rescheduling an unchanged notification leaves the alarm alone", async () => {
  reset();
  const item = notification();
  await send("ogi-notification-scheduled", item);
  await send("ogi-notification-scheduled", { ...item });

  assert.equal(chromeStub._calls.alarmsCreated.length, 1, "the second pass recognised it as unchanged");
});

test("cancelling a scheduled notification removes both the record and the alarm", async () => {
  reset();
  const item = notification();
  await send("ogi-notification-scheduled", item);

  await send("ogi-notification-cancel", item);

  assert.equal(stored().notifications[item.id], undefined);
  assert.ok(chromeStub._calls.alarmsCleared.includes(item.id));
});

// --------------------------------------------------------------------------
// Surviving a restart
// --------------------------------------------------------------------------

test("a notification already marked notified is dropped when storage is re-read", async () => {
  reset();
  // What the previous run of the worker would have left behind.
  chromeStub._store.set("ogi-notifications", {
    notifications: { "old-1": notification({ id: "old-1", notified: true }) },
    lastSynced: {},
  });

  await send("ogi-notification-scheduled", notification());

  assert.equal(stored().notifications["old-1"], undefined, "already-fired notifications are not resurrected");
});

test("a scheduled notification more than five minutes in the past is dropped on re-read", async () => {
  reset();
  const stale = notification({ id: "stale-1", when: new Date(Date.now() - 6 * 60 * 1000).toISOString() });
  const recent = notification({ id: "recent-1", when: new Date(Date.now() - 60 * 1000).toISOString() });
  chromeStub._store.set("ogi-notifications", {
    notifications: { "stale-1": stale, "recent-1": recent },
    lastSynced: {},
  });

  await send("ogi-notification-scheduled", notification());

  assert.equal(stored().notifications["stale-1"], undefined, "six minutes late is given up on");
  assert.ok(stored().notifications["recent-1"], "one minute late still fires");
});

// --------------------------------------------------------------------------
// Firing
// --------------------------------------------------------------------------

test("an immediate notification is displayed once and never scheduled", async () => {
  reset();
  const item = notification({ id: "now-1" });

  await send("ogi-notification", item);

  assert.equal(chromeStub._calls.notificationsCreated.length, 1);
  assert.deepEqual(chromeStub._calls.notificationsCreated[0].options, {
    type: "basic",
    priority: 0,
    iconUrl: "/assets/images/logo128.png",
    title: item.title,
    message: item.message,
  });
  assert.equal(stored().notifications["now-1"].notified, true);
  assert.deepEqual(chromeStub._calls.alarmsCreated, [], "an immediate notification needs no alarm");
});

test("the same immediate notification twice is displayed once", async () => {
  reset();
  const item = notification({ id: "dup-1" });

  await send("ogi-notification", item);
  await send("ogi-notification", { ...item, notified: false });

  assert.equal(chromeStub._calls.notificationsCreated.length, 1, "the in-memory guard held");
});

test("an alarm displays its notification and marks it notified", async () => {
  reset();
  const item = notification({ id: "alarm-1" });
  await send("ogi-notification-scheduled", item);

  await drain(onAlarm({ name: "alarm-1" }));

  assert.equal(chromeStub._calls.notificationsCreated.length, 1);
  assert.equal(chromeStub._calls.notificationsCreated[0].id, "alarm-1");
  assert.equal(stored().notifications["alarm-1"].notified, true);
});

test("an alarm for a notification nobody knows about does nothing", async () => {
  reset();
  await drain(onAlarm({ name: "never-heard-of-it" }));

  assert.deepEqual(chromeStub._calls.notificationsCreated, []);
});

test("a notification carries its priority through to Chrome", async () => {
  reset();
  await send("ogi-notification", notification({ id: "prio-1", priority: 2 }));

  assert.equal(chromeStub._calls.notificationsCreated[0].options.priority, 2);
});

// --------------------------------------------------------------------------
// Clicking
// --------------------------------------------------------------------------

test("clicking a notification focuses an existing OGame tab of that universe", async () => {
  reset();
  const item = notification({ id: "click-1" });
  await send("ogi-notification-scheduled", item);
  chromeStub._tabs.push({ id: 42, url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame" });

  await drain(onNotificationClicked("click-1"));

  assert.deepEqual(chromeStub._calls.tabsUpdated, [{ id: 42, url: item.url, active: true }]);
  assert.deepEqual(chromeStub._calls.tabsCreated, []);
  assert.ok(chromeStub._calls.notificationsCleared.includes("click-1"));
});

test("clicking a notification with no matching tab opens a new one", async () => {
  reset();
  const item = notification({ id: "click-2" });
  await send("ogi-notification-scheduled", item);
  chromeStub._tabs.push({ id: 7, url: "https://s99-de.ogame.gameforge.com/game/index.php" });

  await drain(onNotificationClicked("click-2"));

  assert.deepEqual(chromeStub._calls.tabsCreated, [{ url: item.url }]);
  assert.deepEqual(chromeStub._calls.tabsUpdated, [], "a tab of another universe is not hijacked");
});

// --------------------------------------------------------------------------
// Sync
// --------------------------------------------------------------------------

test("syncing drops background notifications the page no longer knows about", async () => {
  reset();
  const keep = notification({ id: "keep-1" });
  const drop = notification({ id: "drop-1" });
  await send("ogi-notification-scheduled", keep);
  await send("ogi-notification-scheduled", drop);

  await send("ogi-notification-sync", { domain: keep.domain, notifications: [keep] });

  assert.ok(stored().notifications["keep-1"]);
  assert.equal(stored().notifications["drop-1"], undefined);
  assert.ok(chromeStub._calls.alarmsCleared.includes("drop-1"));
});

test("syncing leaves another universe's notifications untouched", async () => {
  reset();
  const here = notification({ id: "here-1", domain: "s1-en.ogame.gameforge.com" });
  const elsewhere = notification({ id: "there-1", domain: "s99-de.ogame.gameforge.com" });
  await send("ogi-notification-scheduled", here);
  await send("ogi-notification-scheduled", elsewhere);

  await send("ogi-notification-sync", { domain: here.domain, notifications: [] });

  assert.equal(stored().notifications["here-1"], undefined);
  assert.ok(stored().notifications["there-1"], "sync is scoped to one domain");
});

// --------------------------------------------------------------------------
// The message contract
// --------------------------------------------------------------------------

test("the message listener always returns true, so Chrome keeps the port open", () => {
  reset();
  assert.equal(
    onMessage({ eventType: "something-else" }, {}, () => {}),
    true
  );
});

test("a message with no payload is ignored rather than throwing", async () => {
  reset();
  await send("ogi-notification", undefined);
  await send("ogi-notification-scheduled", undefined);

  assert.deepEqual(chromeStub._calls.notificationsCreated, []);
  assert.deepEqual(chromeStub._calls.alarmsCreated, []);
});
