const panel = document.querySelector("[data-feed]");
const language = document.documentElement.lang.split("-")[0];
const copy = {
  en: {
    priceUp: "Price went up", priceDown: "Price went down",
    buy: "Buy", sell: "Sell", all: "All markets", unit: "Quoted for {units} {base}",
    reconnecting: "Showing the last available quotes.",
    empty: "Market rates will appear here when the feed is available.",
    markets: { KABUL: "Kabul", HERAT: "Herat", KANDAHAR: "Kandahar", MAZAR: "Mazar-i-Sharif", GHAZNI: "Ghazni", NANGARHAR: "Nangarhar" },
    pair: "{base} to {counter}",
    currencies: {
      AFN: "Afghani", USD: "Dollar", PKR: "Rupee", EUR: "Euro",
      TRY: "Lira", TOMAN: "Toman", TOMAN_CHEQUE: "Toman Cheque",
      IRR: "Rial", AED: "Dirham", SAR: "Riyal", GBP: "Pound", CNY: "Yuan",
    },
  },
  fa: {
    priceUp: "قیمت بالا رفت", priceDown: "قیمت پایین آمد",
    buy: "خرید", sell: "فروش", all: "همهٔ بازارها", unit: "نرخ برای {units} {base}",
    reconnecting: "آخرین نرخ‌های در دسترس نمایش داده می‌شوند.",
    empty: "هنوز نرخی برای نمایش در دسترس نیست.",
    markets: { KABUL: "کابل", HERAT: "هرات", KANDAHAR: "کندهار", MAZAR: "مزارشریف", GHAZNI: "غزنی", NANGARHAR: "ننگرهار" },
    pair: "{base} به {counter}",
    currencies: {
      AFN: "افغانی", USD: "دالر", PKR: "کلدار", EUR: "یورو",
      TRY: "لیر", TOMAN: "تومان", TOMAN_CHEQUE: "تومان چک",
      IRR: "ریال", AED: "درهم", SAR: "ریال", GBP: "پوند", CNY: "یوان",
    },
  },
  ps: {
    priceUp: "بیه لوړه شوه", priceDown: "بیه ټیټه شوه",
    buy: "پېر", sell: "پلور", all: "ټول بازارونه", unit: "د {units} {base} نرخ",
    reconnecting: "وروستي شته نرخونه ښودل کېږي.",
    empty: "تر اوسه د ښودلو لپاره نرخونه نشته.",
    markets: { KABUL: "کابل", HERAT: "هرات", KANDAHAR: "کندهار", MAZAR: "مزار شریف", GHAZNI: "غزني", NANGARHAR: "ننګرهار" },
    pair: "{base} په {counter}",
    currencies: {
      AFN: "افغانۍ", USD: "ډالر", PKR: "کلدارې", EUR: "یورو",
      TRY: "لیره", TOMAN: "تومان", TOMAN_CHEQUE: "تومان چک",
      IRR: "ریال", AED: "درهم", SAR: "ریال", GBP: "پونډ", CNY: "یوان",
    },
  },
}[language];
const sources = new Set(["nerkh_yab", "kabulnarkh", "nerkhsarafan"]);
const currencyFlags = {
  AFN: "af", USD: "us", PKR: "pk", EUR: "eu", TRY: "tr", TOMAN: "ir",
  TOMAN_CHEQUE: "ir", IRR: "ir", AED: "ae", SAR: "sa", GBP: "gb", CNY: "cn",
};

if (panel && copy) {
  const locale = document.documentElement.lang;
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const number = new Intl.NumberFormat(locale);
  const filter = panel.querySelector("[data-market]");
  const status = panel.querySelector("[data-status]");
  const grid = panel.querySelector("[data-quotes]");
  const spotlight = document.querySelector("[data-hero-quote]");
  const quotes = new Map();
  let updating = false;

  function currency(code) {
    return copy.currencies[code] ?? code;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function currencyBadge(code) {
    const badge = element("span", undefined, "rate-currency");
    const flag = currencyFlags[code];
    if (flag) {
      const image = element("img");
      image.src = new URL(`./assets/flags/${flag}.png`, import.meta.url).href;
      image.alt = "";
      image.width = 24;
      image.height = 18;
      badge.append(image);
    }
    badge.append(element("bdi", currency(code)));
    return badge;
  }

  function rateCard(quote) {
    const card = element("article", undefined, "rate-card");
    const pair = element("h3", undefined, "rate-pair");
    pair.setAttribute("aria-label", copy.pair.replace("{base}", currency(quote.base)).replace("{counter}", currency(quote.counter)));
    const arrow = element("span", "→", "rate-arrow");
    arrow.setAttribute("aria-hidden", "true");
    pair.append(currencyBadge(quote.base), arrow, currencyBadge(quote.counter));
    card.append(element("p", copy.markets[quote.market], "rate-market"), pair);
    if (quote.baseUnits) {
      const unit = copy.unit.replace("{units}", number.format(quote.baseUnits))
        .replace("{base}", currency(quote.base));
      card.append(element("p", unit, "rate-unit"));
    }

    const prices = element("dl", undefined, "rate-prices");
    for (const [label, price, trend] of [[copy.buy, quote.buy, quote.buyTrend], [copy.sell, quote.sell, quote.sellTrend]]) {
      const group = element("div");
      const value = element("dd");
      value.append(element("bdi", price));
      if (trend === "up" || trend === "down") {
        const up = trend === "up";
        const marker = element("span", up ? "↑" : "↓", `rate-trend rate-trend-${trend}`);
        marker.setAttribute("role", "img");
        marker.setAttribute("aria-label", up ? copy.priceUp : copy.priceDown);
        marker.title = up ? copy.priceUp : copy.priceDown;
        value.append(marker);
      }
      group.append(element("dt", label), value);
      prices.append(group);
    }
    const time = element("time", undefined, "rate-time");
    time.dateTime = new Date(quote.revisionAt).toISOString();
    card.append(prices, time);
    return card;
  }

  function render() {
    const allQuotes = [...quotes.values()];
    const markets = [...new Set(allQuotes.map(quote => quote.market))];
    const selected = filter.value;
    filter.replaceChildren(new Option(copy.all, ""), ...markets.map(market => new Option(copy.markets[market], market)));
    filter.value = markets.includes(selected) ? selected : "";
    filter.parentElement.hidden = markets.length < 2;
    grid.replaceChildren(...allQuotes.filter(quote => !filter.value || quote.market === filter.value).map(rateCard));

    if (spotlight) {
      const featured = allQuotes.find(quote => quote.market === "KABUL" && quote.base === "USD" && quote.counter === "AFN")
        ?? allQuotes.reduce((latest, quote) => !latest || quote.revisionAt > latest.revisionAt ? quote : latest, null);
      spotlight.hidden = !featured;
      spotlight.replaceChildren(...(featured ? [rateCard(featured)] : []));
    }
    updateTimes();
  }

  function updateTimes() {
    if (document.hidden) return;
    for (const time of document.querySelectorAll(".rate-card time")) {
      const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(time.dateTime)) / 1000));
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
        const quote = {
          ...row,
          source: row.source ?? feed.source,
          base: row.base === "TOMAN_BANK" ? "TOMAN" : row.base,
          counter: row.counter === "TOMAN_BANK" ? "TOMAN" : row.counter,
        };
        if (!valid(quote) || quote.base === quote.counter) continue;
        const key = [quote.market, quote.base, quote.counter].join("/");
        const old = quotes.get(key);
        if (!old || quote.postedAt > old.postedAt ||
            (quote.postedAt === old.postedAt && quote.source === old.source &&
              (quote.messageId > old.messageId ||
                (quote.messageId === old.messageId && quote.revisionAt > old.revisionAt)))) {
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
