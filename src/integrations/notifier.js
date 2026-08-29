import { getLogger } from "../platform/logger.js";
import OGBIData from "../store/OGBIData.js";
import Translator from "../format/i18n/translate.js";
import MissionType from "../game/missionType.js";
import NotificationPriority from "./notificationPriority.js";

class Notifier {
  constructor() {
    this.logger = getLogger("Notifier");

    // The content script answers ogi-notification-sync on this event rather than calling into
    // this singleton directly - Notifier belongs to the page context and must not be imported
    // by ctxcontent/**, which has its own module graph and would get a stale OGBIData.
    document.addEventListener("ogi-notification-sync-rep", (event) => {
      this.EndSyncNotifications(event.detail);
    });
  }

  #controlNotification(notification, isScheduled) {
    if (!notification.id) throw new Error("Notification must have an id");
    if (!notification.domain) throw new Error("Notification must have a domain");
    if (!notification.title) throw new Error("Notification must have a title");
    if (!notification.message) throw new Error("Notification must have a message");
    if (isScheduled && !notification.when) throw new Error("Scheduled notification must have a 'when' date");
  }
  #dispatchEvent(event, data) {
    document.dispatchEvent(new CustomEvent(event, { detail: data }));
  }
  #dispatchNotification(event, notification, isScheduled) {
    if (!notification.domain) {
      notification.domain = OGBIData.json.universeDomain;
    }
    this.#controlNotification(notification, isScheduled);
    this.#dispatchEvent(event, notification);
  }

  #isObsoleteSinceMinutes(date, minutes) {
    const now = Date.now();
    return new Date(date).getTime() < now - minutes * 60 * 1000;
  }

  #formatId(id) {
    return `${OGBIData.json.universeId}-${id}`;
  }
  #formatFleetArrivalId(fleetId, isBack) {
    return this.#formatId(`fleet-${fleetId}-${isBack ? "return" : "arrival"}`);
  }
  #formatTitle(title) {
    return `${OGBIData.json.universeName} - ${title}`;
  }

  #createOrUpdateScheduledNotification(notification, sendDispatch = true) {
    if (sendDispatch) {
      this.#dispatchNotification("ogi-notification-scheduled", notification, true);
      this.logger.info(`Scheduled notification ${notification.id}: `, notification);
    }

    //Save for synchronization in case of multiple devices
    OGBIData.notifications[notification.id] = notification;
    OGBIData.Save();
    this.logger.debug(`Saved scheduled notification ${notification.id} to OGBIData.`, notification);
  }

  ScheduleNotification(id, category, priority, title, message, url, date) {
    this.#createOrUpdateScheduledNotification({
      id: this.#formatId(id),
      category: category,
      domain: OGBIData.json.universeDomain,
      priority: priority,
      title: this.#formatTitle(title),
      message: message,
      url: url,
      when: date.toISOString(),
      notified: false,
    });
  }

  EndSyncNotifications(notificationResult) {
    if (!notificationResult) return;

    OGBIData.lastSyncNotification = notificationResult.SyncDate;

    this.logger.info(
      `Synchronized notifications: ${notificationResult.Saved.length} saved, ${notificationResult.Canceled.length} canceled`,
      notificationResult
    );
  }

  BeginSyncNotifications(force) {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    const minutesAgoSync = Math.floor((now - new Date(OGBIData.lastSyncNotification).getTime()) / 60000);

    this.logger.debug(`Last notifications sync was ${minutesAgoSync} minutes ago (${OGBIData.lastSyncNotification})`);
    //if force or last sync was more than 5 minutes ago, then sync
    if (force || this.#isObsoleteSinceMinutes(OGBIData.lastSyncNotification, 5)) {
      this.logger.info(`Start syncing notifications (Forced: ${force})`);

      //remove notified notifications or obsoletes since 30 minutes
      for (const [obsoleteNotificationId, obsoleteNotification] of Object.entries(OGBIData.notifications).filter(
        ([, x]) => x.notified || this.#isObsoleteSinceMinutes(x.when, 30)
      )) {
        delete OGBIData.notifications[obsoleteNotificationId];
        this.logger.info(`Removed obsolete notification ${obsoleteNotificationId}`, obsoleteNotification);
      }
      OGBIData.Save();

      this.#dispatchEvent("ogi-notification-sync", {
        domain: OGBIData.json.universeDomain,
        notifications: Object.values(OGBIData.notifications),
      });
    }
  }

  #cancelScheduledNotification(id, sendDispatch = true) {
    if (sendDispatch) {
      this.#dispatchEvent("ogi-notification-cancel", { id: id });
    }
    if (OGBIData.notifications[id]) {
      //Save for synchronization in case of multiple devices
      delete OGBIData.notifications[id];
      this.logger.info(`Cancelled notification ${id}`);
      OGBIData.Save();
    }
  }
  CancelScheduledNotification(id) {
    this.#cancelScheduledNotification(this.#formatId(id), true);
  }

  Notify(notification) {
    if (notification.id && notification.title && notification.message) {
      notification.id = this.#formatId(notification.id);
      notification.title = this.#formatTitle(notification.title);
      this.#dispatchNotification("ogi-notification", notification);
      this.logger.info(`Sent notification ${notification.id}`, notification);
    }
  }

  IsFleetMissionNotifiable(missionType) {
    /*Only peaceful fleets are affected.
     * For now, managing hostile fleets is complicated due to the possible change in fleet arrival time.*/
    const notifiableMissions = [
      MissionType.TRANSPORT,
      MissionType.DEPLOYMENT,
      MissionType.HARVEST,
      MissionType.COLONISATION,
    ];
    return notifiableMissions.includes(missionType);
  }
  IsFleetReturnBasedMission(missionType) {
    const backBasedMissions = [missionType.TRANSPORT, missionType.HARVEST];
    return backBasedMissions.includes(missionType);
  }

  IsFleetArrivalNotificationScheduled(fleetId, isBack) {
    const formattedId = this.#formatFleetArrivalId(fleetId, isBack);
    const exists = OGBIData.notifications[formattedId] !== undefined && OGBIData.notifications[formattedId] !== null;
    return exists;
  }

  CleanObsoleteFleetsNotifications(allRemainingFleets) {
    const possibleRemainingFleetIds = [];
    for (const [fleetId, type, isBack] of allRemainingFleets) {
      if (this.IsFleetMissionNotifiable(type)) {
        possibleRemainingFleetIds.push(this.#formatFleetArrivalId(fleetId, isBack));
        if (!isBack && this.IsFleetReturnBasedMission(type)) {
          //if not back and back is notifiable, then add back notification id
          possibleRemainingFleetIds.push(this.#formatFleetArrivalId(fleetId, true));
        }
      }
    }
    //remove notifications about fleets that are no longer present
    for (const [obsoleteNotificationId, obsoleteNotification] of Object.entries(OGBIData.notifications).filter(
      ([id, x]) => x.category === "fleet" && !possibleRemainingFleetIds.includes(id)
    )) {
      this.#cancelScheduledNotification(obsoleteNotificationId, true);
    }
  }

  ScheduleFleetArrivalNotification(fleetId, coords, isMoon, missionType, isBack, arrivalDatetime) {
    const id = this.#formatFleetArrivalId(fleetId, isBack);

    const title = Translator.translate(198);
    const missionTranslated = `${Translator.translate(199)}: ${Translator.TranslateMissionType(missionType)}${
      isBack ? ` (${Translator.translate(45)})` : ""
    }`;

    const destination = isMoon
      ? OGBIData.empire.find((x) => x.coordinates === coords)?.moon
      : OGBIData.empire.find((x) => x.coordinates === coords);

    const destinationNameTranslated = destination ? `\n${Translator.translate(127)}: ${destination.name}` : "";

    const coordsTranslated = `${Translator.translate(98)}: ${coords} (${
      isMoon ? Translator.translate(194) : Translator.translate(42)
    })`;

    const url = destination
      ? `https://${OGBIData.json.universeDomain}/game/index.php?page=ingame&component=fleetdispatch&cp=${destination.id}`
      : `https://${OGBIData.json.universeDomain}/game/index.php?page=ingame&component=overview`;

    const message = `${missionTranslated}${destinationNameTranslated}\n${coordsTranslated}`;

    if (id && coords) {
      this.#createOrUpdateScheduledNotification({
        id: id,
        category: "fleet",
        domain: OGBIData.json.universeDomain,
        priority: NotificationPriority.VERY_HIGH,
        title: this.#formatTitle(title),
        message: message,
        url: url,
        when: arrivalDatetime.toISOString(),
        notified: false,
      });
    }
  }

  CancelFleetArrivalScheduledNotification(fleetId, isBack) {
    this.#cancelScheduledNotification(this.#formatFleetArrivalId(fleetId, isBack), true);
  }
}

export default new Notifier();
