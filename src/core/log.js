// DEBUG-gated logging. v1 had ~80 unconditional console.logs, several of
// which dumped whole multi-MB datasets. Here debug output is off unless
// the page is opened with ?debug=1 or localStorage.debug = "1".
//
// warn/error always print — they indicate something the user may notice.

function debugEnabled() {
  try {
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "1") return true;
    return typeof localStorage !== "undefined" && localStorage.getItem("debug") === "1";
  } catch {
    return false;
  }
}

const DEBUG = debugEnabled();

export const log = {
  debug: (...args) => { if (DEBUG) console.log("[debug]", ...args); },
  info: (...args) => { if (DEBUG) console.info(...args); },
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
