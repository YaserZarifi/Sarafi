const panel = document.querySelector("[data-feed]");
const language = document.documentElement.lang.split("-")[0];
const copy = {
  en: {
    buy: "Buy", sell: "Sell", all: "All markets", unit: "Quoted for {units} {base}",
    unconfirmed: "Quote unit unconfirmed", reconnecting: "Showing the last available quotes.",
    empty: "Market rates will appear here when the feed is available.",
    markets: { KABUL: "Kabul", HERAT: "Herat", KANDAHAR: "Kandahar", MAZAR: "Mazar-i-Sharif", GHAZNI: "Ghazni", NANGARHAR: "Nangarhar" },
    toman: "Toman", bank: "Toman Bank", cheque: "Toman Cheque",
  },
  fa: {
    buy: "خرید", sell: "فروش", all: "همهٔ بازارها", unit: "نرخ برای {units} {base}",
    unconfirmed: "واحد نرخ تأیید نشده", reconnecting: "آخرین نرخ‌های در دسترس نمایش داده می‌شوند.",
    empty: "هنوز نرخی برای نمایش در دسترس نیست.",
    markets: { KABUL: "کابل", HERAT: "هرات", KANDAHAR: "کندهار", MAZAR: "مزارشریف", GHAZNI: "غزنی", NANGARHAR: "ننگرهار" },
    toman: "تومان", bank: "تومان بانکی", cheque: "تومان چک",
  },
  ps: {
    buy: "پېر", sell: "پلور", all: "ټول بازارونه", unit: "د {units} {base} نرخ",
    unconfirmed: "د نرخ واحد لا تایید شوی نه دی", reconnecting: "وروستي شته نرخونه ښودل کېږي.",
    empty: "تر اوسه د ښودلو لپاره نرخونه نشته.",
    markets: { KABUL: "کابل", HERAT: "هرات", KANDAHAR: "کندهار", MAZAR: "مزار شریف", GHAZNI: "غزني", NANGARHAR: "ننګرهار" },
    toman: "تومان", bank: "بانکي تومان", cheque: "تومان چک",
  },
}[language];
const sources = new Set(["nerkh_yab", "kabulnarkh", "nerkhsarafan"]);

if (panel && copy) {
  const locale = document.documentElement.lang;
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const number = new Intl.NumberFormat(locale);
  const filter = panel.querySelector("[data-market]");
  const status = panel.querySelector("[data-status]");
  const grid = panel.querySelector("[data-quotes]");
  const quotes = new Map();
  let updating = false;

  function currency(code) {
    return { TOMAN: copy.toman, TOMAN_BANK: copy.bank, TOMAN_CHEQUE: copy.cheque }[code] ?? code;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function render() {
    const markets = [...new Set([...quotes.values()].map(quote => quote.market))];
    const selected = filter.value;
    filter.replaceChildren(new Option(copy.all, ""), ...markets.map(market => new Option(copy.markets[market], market)));
    filter.value = markets.includes(selected) ? selected : "";
    filter.parentElement.hidden = markets.length < 2;

    grid.replaceChildren(...[...quotes.values()].filter(quote => !filter.value || quote.market === filter.value).map(quote => {
      const card = element("article", undefined, "rate-card");
      const pair = element("h3");
      pair.append(element("bdi", currency(quote.base)), " / ", element("bdi", currency(quote.counter)));
      card.append(element("p", copy.markets[quote.market], "rate-market"), pair);
      const unit = quote.baseUnits ? copy.unit.replace("{units}", number.format(quote.baseUnits))
        .replace("{base}", currency(quote.base)) : copy.unconfirmed;
      card.append(element("p", unit, "rate-unit"));

      const prices = element("dl", undefined, "rate-prices");
      for (const [label, price] of [[copy.buy, quote.buy], [copy.sell, quote.sell]]) {
        const group = element("div");
        const value = element("dd");
        value.append(element("bdi", price));
        group.append(element("dt", label), value);
        prices.append(group);
      }
      const time = element("time", undefined, "rate-time");
      time.dateTime = new Date(quote.postedAt).toISOString();
      time.dataset.postedAt = quote.postedAt;
      card.append(prices, time);
      return card;
    }));
    updateTimes();
  }

  function updateTimes() {
    if (document.hidden) return;
    for (const time of grid.querySelectorAll("time")) {
      const elapsed = Math.max(0, Math.floor((Date.now() - Number(time.dataset.postedAt)) / 1000));
      const [divisor, unit] = elapsed < 60 ? [1, "second"] : elapsed < 3600 ? [60, "minute"] :
        elapsed < 86400 ? [3600, "hour"] : [86400, "day"];
      const age = Math.floor(elapsed / divisor);
      time.textContent = relative.format(age === 0 ? -0 : -age, unit);
    }
  }

  function valid(quote) {
    const currencyCode = /^[A-Z][A-Z_]{2,15}$/;
    const price = /^\d{1,24}(?:\.\d{1,12})?$/;
    return quote && Object.hasOwn(copy.markets, quote.market) && sources.has(quote.source) &&
      currencyCode.test(quote.base) && currencyCode.test(quote.counter) &&
      typeof quote.buy === "string" && price.test(quote.buy) && typeof quote.sell === "string" && price.test(quote.sell) &&
      Number.isSafeInteger(quote.messageId) && quote.messageId > 0 &&
      Number.isSafeInteger(quote.postedAt) && quote.postedAt > 0 && quote.postedAt <= Date.now() + 60_000 &&
      Number.isSafeInteger(quote.revisionAt) && quote.revisionAt >= quote.postedAt;
  }

  async function refresh() {
    if (document.hidden || updating) return;
    updating = true;
    try {
      const response = await fetch(panel.dataset.feed, { cache: "no-cache" });
      if (!response.ok) throw new Error("Feed unavailable");
      const feed = await response.json();
      if (feed.version !== 1 || feed.source !== "nerkh_yab" || !Array.isArray(feed.quotes)) {
        throw new Error("Unexpected rates feed");
      }
      for (const row of feed.quotes) {
        if (!row || typeof row !== "object") continue;
        const quote = { ...row, source: row.source ?? feed.source };
        if (!valid(quote)) continue;
        const key = [quote.market, quote.base, quote.counter].join("/");
        const old = quotes.get(key);
        if (!old || quote.postedAt > old.postedAt ||
            (quote.postedAt === old.postedAt && quote.revisionAt >= old.revisionAt)) {
          quotes.set(key, quote);
        }
      }
      status.hidden = quotes.size > 0;
      if (!status.hidden) status.textContent = copy.empty;
      render();
    } catch {
      status.hidden = false;
      status.textContent = quotes.size ? copy.reconnecting : copy.empty;
    } finally {
      updating = false;
    }
  }

  filter.addEventListener("change", render);
  document.addEventListener("visibilitychange", () => { updateTimes(); refresh(); });
  setInterval(updateTimes, 1000);
  setInterval(refresh, 60_000);
  refresh();
}
