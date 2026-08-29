export default {
  /**
   * Parses the `dd.mm.yyyy hh:mm:ss` OGame prints in message headers.
   *
   * It swaps the first two components and lets `Date` parse the result as
   * `mm/dd/yyyy`, which is the only reason it works. Lifted out of `OGBeyondInfinity` in
   * Phase 3 of refactoring.md, unchanged.
   */
  dateStrToDate: (datestr) => {
    let splits = datestr.split(".");
    let tmp = splits[0];
    splits[0] = splits[1];
    splits[1] = tmp;
    return new Date(splits.join("/"));
  },

  timeSince: (date) => {
    let seconds = Math.floor((new Date(localTime) - date) / 1e3);
    let interval = Math.floor(seconds / 86400);
    let since = "";
    if (interval >= 1) {
      since += interval + "d ";
    }
    seconds = seconds % 86400;
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) {
      since += interval + "h ";
    }
    seconds = seconds % 3600;
    interval = Math.floor(seconds / 60);
    if (interval >= 1 && since.indexOf("d") === -1) {
      since += interval + "m";
    }
    if (since === "") {
      since = "Just now";
    } else {
      since += " ago";
    }
    return since;
  },
};
