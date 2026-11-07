// Non-human traffic detection for campaign tracking (link clicks + review pages).
//
// WHY THIS EXISTS. A review page is addressed to one prospect, but the "views"
// it collects are dominated by the recipient's own email-security stack, not the
// recipient. When a message lands at Microsoft 365 / Proofpoint / Mimecast /
// Barracuda, the gateway follows every link to detonate it in a sandbox — and
// the modern ones deliberately spoof a real browser's user-agent, fetch from a
// datacenter, and hit the page two or three times within seconds of delivery.
// Counting those as people is the exact mistake the tracking pixel makes; a
// campaign that reads "4 viewers" off one scanner sends someone chasing a lead
// that never existed.
//
// The old rule was a short user-agent denylist. It caught scanners that announce
// themselves (Proofpoint, Mimecast, curl) and missed everything that lies —
// raw HTTP libraries (`Apache-HttpClient`, `Go-http-client`) and spoofed legacy
// browsers (`Firefox/3.5` on Windows Vista, `Chrome/79`) sailed through as human.
//
// LAYERS, cheapest first (this file owns 1–3; velocity/honeypot live at the call
// sites where the DB is):
//   1. user-agent   — libraries, automation frameworks, named scanners, preview
//                     bots, and a conservative spoofed-legacy-browser floor.
//   2. request headers — a real browser navigation always sends Accept-Language;
//                     a scanner usually does not.
//   3. network      — a "person" clicking from an AWS/Azure/OVH range is a
//                     datacenter, not a person (resolved post-response via geo).
//
// The floor is deliberately generous: a false "automated" discards a real
// engagement signal (worse than an admitted-uncertain one), so the legacy-browser
// cutoffs sit years below any browser a 2026 prospect could plausibly run.

/** The one shape every layer returns. `reason` is for tuning against real data,
 *  not for the UI — it says WHICH rule fired. */
export interface BotVerdict {
  automated: boolean
  reason: string | null
}

const HUMAN: BotVerdict = { automated: false, reason: null }
const bot = (reason: string): BotVerdict => ({ automated: true, reason })

// ── Layer 1a: things that never pretend to be a browser ──────────────────────

/** Headless browsers and browser-automation frameworks. A real prospect is not
 *  driving the page from Selenium. */
const AUTOMATION_RE =
  /headless|phantomjs|puppeteer|playwright|selenium|webdriver|cypress|jsdom|electron|lighthouse|slimerjs|htmlunit|splash|prerender|dom-?crawler/i

/** Raw HTTP clients and language runtimes. Nothing here renders a page; if it is
 *  fetching a review link it is a machine. Kept as word-ish fragments so
 *  `Java/24.0.2` and `Go-http-client/2.0` both land. */
const HTTP_LIB_RE =
  /\bcurl\b|\bwget\b|libwww|lwp|python|urllib|aiohttp|httpx|requests|scrapy|mechanize|\bjava\b|jakarta|apache-?httpclient|\bhttpclient\b|okhttp|go-http-client|\bgo\b\/|node-fetch|undici|axios|got\/|guzzle|symfony|restsharp|dotnet|\.net\b|winhttp|wininet|powershell|ruby|typhoeus|faraday|perl|php\b|httr\b|httpie|postmanruntime|insomnia|paw\/|httrack|wanative|zgrab|masscan|nmap|\bnetcat\b/i

/** Generic crawler / monitoring vocabulary. Anything self-describing as a bot.
 *  `preview` is here for the link-unfurlers below that don't use a proper name. */
const GENERIC_BOT_RE =
  /\bbot\b|bots?\/|crawler|crawl\b|spider|slurp|\bfetcher?\b|feedfetcher|harvest|scrap(?:er|ing)|indexer|monitor(?:ing)?|uptime|pingdom|statuscake|site24x7|newrelic|datadog|probe|checker|validator|analyzer|inspector|scanner|scan\b|preview|unfurl|link ?check|dead ?link|w3c/i

// ── Layer 1b: named threats & sources that spoof a browser UA but are known ───

/** Corporate email security gateways and their sandboxes. Many now copy a real
 *  Chrome UA, so this is the tail of the distribution, not the main control —
 *  velocity and datacenter (below) catch the ones that scrub every token. */
const EMAIL_SECURITY_RE =
  /proofpoint|urldefense|mimecast|barracuda|symantec|messagelabs|forcepoint|safelinks|safe-?links|\batp\b|fireeye|cloudmark|trend ?micro|sophos|mcafee|ironport|agari|abnormal|avanan|area ?1|vadesecure|vade ?secure|retarus|clearswift|spamtitan|libra ?esva|fortimail|fortinet|fortiguard|sonicwall|netskope|zscaler|crowdstrike|darktrace|bitdefender|kaspersky|\beset\b|gatefy|tessian|checkpoint|sentinelone|paloalto|ironscales|graphus|\binky\b|perception ?point|mailcontrol|mailscanner|amavis|spamassassin|rspamd|cyren|opendns|umbrella|websense|mailmarshal|mailguard|greathorn|guardian ?digital|vircom|trustwave|mailroute|sanesecurity/i

/** Chat/social link-unfurlers and search crawlers. They fetch a link the moment
 *  it is pasted or received, never because a person chose to visit. Named by
 *  their own agent, not the app's: Snapchat's and Pinterest's in-app browsers
 *  carry the app name and are people. */
const PREVIEW_CRAWLER_RE =
  /facebookexternalhit|facebookcatalog|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|discordbot|discourse|whatsapp|telegrambot|skypeuripreview|redditbot|embedly|iframely|quora ?link|pinterestbot|pinterest\/0\.|bitlybot|outbrain|nuzzel|vkshare|metauri|snap url preview|applebot|googlebot|google-inspectiontool|mediapartners-google|adsbot-google|googleimageproxy|google-read-aloud|bingbot|bingpreview|microsoftpreview|msnbot|yandex|baiduspider|sogou|exabot|ia_archiver|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|dataforseo|seznambot|duckduckbot|gptbot|oai-searchbot|chatgpt|claudebot|anthropic|perplexitybot|ccbot|amazonbot|bytespider|google-extended/i

// ── Layer 1c: spoofed-legacy-browser floor ───────────────────────────────────
//
// A scanner that copies a browser UA usually copies an OLD one (its sandbox
// image is stale). No managed 2026 endpoint runs a browser this far behind — the
// floors sit ~5 years below current, so a genuinely-behind corporate laptop
// (Chrome 110-ish, three years old) is still comfortably above them.
const CHROME_FLOOR = 90    // Chrome 90 shipped 2021-04; observed scanners: 60, 79
const FIREFOX_FLOOR = 80   // Firefox 80 shipped 2020-08; observed scanners: 3.5, 59

/** MSIE / Trident / Presto / ancient Gecko / Windows XP·Vista — extinct among
 *  real recipients, alive only in scanner sandboxes. */
const LEGACY_ENGINE_RE = /\bMSIE\b|Trident\/|Presto\/|Gecko\/2009|rv:1\.[0-9]|Windows NT [45]\.|Windows NT 6\.0\b|Windows 9[85]|Windows CE/i

function staleBrowserVerdict(ua: string): BotVerdict | null {
  if (LEGACY_ENGINE_RE.test(ua)) return bot('legacy-engine')
  // Edge/Opera/Samsung carry a Chrome token too; a stale one of those is just as
  // machine-like, so we don't special-case them out.
  const chrome = /(?:chrome|chromium|crios)\/(\d+)/i.exec(ua)
  if (chrome && Number(chrome[1]) < CHROME_FLOOR) return bot(`stale-chrome-${chrome[1]}`)
  const firefox = /(?:firefox|fxios)\/(\d+)/i.exec(ua)
  if (firefox && Number(firefox[1]) < FIREFOX_FLOOR) return bot(`stale-firefox-${firefox[1]}`)
  return null
}

/** Layer 1: the user-agent alone. Pure and cheap — safe to call on every hit. */
export function classifyUserAgent(userAgent: string | null | undefined): BotVerdict {
  const ua = (userAgent ?? '').trim()
  if (!ua) return bot('no-ua')                    // a real browser always sends one
  if (AUTOMATION_RE.test(ua)) return bot('automation')
  if (HTTP_LIB_RE.test(ua)) return bot('http-library')
  if (EMAIL_SECURITY_RE.test(ua)) return bot('email-security')
  if (PREVIEW_CRAWLER_RE.test(ua)) return bot('preview-crawler')
  if (GENERIC_BOT_RE.test(ua)) return bot('crawler')
  const stale = staleBrowserVerdict(ua)
  if (stale) return stale
  return HUMAN
}

// ── Layer 2: request headers ─────────────────────────────────────────────────

export interface RequestFacts {
  userAgent?: string | null
  /** The `Accept-Language` header. Distinguish "" / null (checked, absent) from
   *  `undefined` (not looked at) — only the former is a signal. */
  acceptLanguage?: string | null
  /** True for a top-level page load or the /r/ redirect. The Accept-Language
   *  rule applies ONLY here: a `navigator.sendBeacon` POST (the play/CTA event)
   *  legitimately omits the header even from a real browser, so applying it there
   *  would flag every genuine play. */
  navigation?: boolean
}

/** Layers 1 + 2. What the two request-time call sites should use. */
export function classifyRequest(facts: RequestFacts): BotVerdict {
  const ua = classifyUserAgent(facts.userAgent)
  if (ua.automated) return ua
  // A real browser NAVIGATION always sends Accept-Language. Absence (header
  // present-but-empty or missing) on a navigation is a strong scanner tell — the
  // spoofed-Chrome sandboxes that scrub every other giveaway still skip it.
  if (facts.navigation && (facts.acceptLanguage === '' || facts.acceptLanguage === null)) {
    return bot('no-accept-language')
  }
  return HUMAN
}

/** Back-compat: the old boolean API, now backed by the full user-agent classifier. */
export function looksAutomated(userAgent: string | null | undefined): boolean {
  return classifyUserAgent(userAgent).automated
}

// ── Layer 3: network (datacenter / hosting) ──────────────────────────────────
//
// Resolved from the IP's org/ISP after the response has gone out (the geo lookup
// is a network call and nobody waits on it). A prospect reads their mail from a
// residential or corporate-office network; a "click" whose IP belongs to a cloud
// host is a scanner or a proxy running in that cloud. This is the signal that
// catches the spoofed-current-Chrome scanners nothing else can.
const DATACENTER_ORG_RE =
  /amazon|\baws\b|\bec2\b|google (?:llc|cloud|inc)|\bgcp\b|microsoft|azure|digitalocean|\blinode\b|akamai|fastly|cloudflare|\bovh\b|hetzner|\bvultr\b|leaseweb|choopa|contabo|scaleway|oracle|alibaba|aliyun|tencent|huawei ?cloud|equinix|\bcolo(?:cation)?\b|data ?cent(?:er|re)|hosting|hosted|dedicated server|\bvps\b|\bcloud\b|m247|psychz|quadranet|zenlayer|\bpacket\b|latitude\.sh|upcloud|kamatera|\bionos\b|1&1|godaddy|rackspace|softlayer|servers?\.com|worldstream|serverius|\bnforce\b|frantech|buyvm|sharktech|gcore|g-core|stackpath|limelight|incapsula|imperva|\bnbip\b|datacamp|bunnyway|constant\b|colocrossing|hostwinds|hostgator|bluehost|dreamhost|\bnamecheap\b|hivelocity|phoenixnap|internap|voxility|\bfdcservers\b|servermania|joes ?datacenter|reliablesite/i

/** True when an IP's org/ISP name looks like a hosting provider rather than an
 *  eyeball network. Pass whatever the geo provider returns for org and/or isp. */
export function isDatacenterOrg(orgOrIsp: string | null | undefined): boolean {
  const s = (orgOrIsp ?? '').trim()
  if (!s) return false
  return DATACENTER_ORG_RE.test(s)
}
