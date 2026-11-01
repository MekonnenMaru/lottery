(() => {
  const zone = "Africa/Nairobi";
  const RealDate = Date;
  let skew = 0;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/time.php", false);
    xhr.send();
    if (xhr.status === 200) {
      const server = RealDate.parse(JSON.parse(xhr.responseText).now);
      if (Number.isFinite(server)) skew = server - RealDate.now();
    }
  } catch {
    /* keep the device clock only if the server cannot be reached */
  }

  function now() {
    return RealDate.now() + skew;
  }

  function PlatformDate(...args) {
    if (!new.target) return new RealDate(now()).toString();
    if (args.length === 0) return new RealDate(now());
    return new RealDate(...args);
  }
  PlatformDate.now = now;
  PlatformDate.parse = RealDate.parse;
  PlatformDate.UTC = RealDate.UTC;
  PlatformDate.prototype = RealDate.prototype;
  window.Date = PlatformDate;

  function zoned(options) {
    return Object.assign({}, options, { timeZone: zone });
  }
  const stamp = RealDate.prototype.toLocaleString;
  const day = RealDate.prototype.toLocaleDateString;
  const clock = RealDate.prototype.toLocaleTimeString;
  RealDate.prototype.toLocaleString = function localeString(locale, options) {
    return stamp.call(this, locale, zoned(options));
  };
  RealDate.prototype.toLocaleDateString = function localeDate(locale, options) {
    return day.call(this, locale, zoned(options));
  };
  RealDate.prototype.toLocaleTimeString = function localeTime(locale, options) {
    return clock.call(this, locale, zoned(options));
  };

  window.MarakiTime = { zone, offset: "+03:00", now };
})();
