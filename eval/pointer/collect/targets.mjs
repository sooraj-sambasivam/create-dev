// Web targets. `find` is resolved by lib.pickAndMeasure; box = element's DOM rect (viewport px, 1440x900, dpr 1).
const ST = "https://www.soundtransit.org/ride-with-us/routes-schedules/1-line";
const GS_CLASS = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/htmlview";
const GS_PUB = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS4CmyhVsSYtVtK8MwyZ6WqkcEf1oxCx15zq-dZDitvCZt7alqYBy-ydnxJiApR-gD7oLsDY4s4V_sa/pubhtml";
const NOTION = "https://bensomething.notion.site/Synced-Database-Views-d03baa8ecb524b6996d8278233f78e61";
const WP_CO = "https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue";
const WP_POP = "https://en.wikipedia.org/wiki/List_of_countries_by_population_(United_Nations)";
const OWID = "https://ourworldindata.org/grapher/life-expectancy";

const PRE_COOKIES = "[...document.querySelectorAll('button')].find(b=>/accept/i.test(b.innerText))?.click()";
export const WEB_TARGETS = [
  // live transit (Sound Transit 1 Line, today's timetable)
  { id: "t01-transit-timetable", app: "Chromium (Sound Transit)", url: ST, kind: "table", label: "first populated timetable row (1 Line, to Federal Way)", utterance: "track this train", settle: 8000, readyExpr: "document.querySelectorAll('table.schedule-table.visible td').length>50", find: { sel: "table.schedule-table.visible tr", re: "\\d{1,2}:\\d{2}\\s*[ap]\\.?m", flags: "i", nth: 0 } },
  { id: "t02-transit-time-cell", app: "Chromium (Sound Transit)", url: ST, kind: "text", label: "first departure time cell", utterance: "what time is this train?", settle: 8000, readyExpr: "document.querySelectorAll('table.schedule-table.visible td').length>50", find: { sel: "table.schedule-table.visible td", re: "^\\d{1,2}:\\d{2}\\s*[ap]\\.?m\\.?", flags: "i", nth: 0 } },
  { id: "t03-transit-view-toggle", app: "Chromium (Sound Transit)", url: ST, kind: "button", label: "Point to point view toggle", utterance: "switch to point to point", settle: 5000, find: { text: "Point to point" } },
  // Google Sheets published to the web
  { id: "t04-gsheet-class-table", app: "Chromium (Google Sheets)", url: GS_CLASS, kind: "table", label: "Class Data sheet table", utterance: "track this table", settle: 4000, find: { frame: "iframe", sel: "table.waffle" } },
  { id: "t05-gsheet-class-major-header", app: "Chromium (Google Sheets)", url: GS_CLASS, kind: "table", label: "Major column header cell", utterance: "what does this column mean?", settle: 4000, find: { frame: "iframe", sel: "td", text: "Major" } },
  { id: "t06-gsheet-sales-table", app: "Chromium (Google Sheets)", url: GS_PUB, kind: "table", label: "Category / Sales / % of Total table", utterance: "track this sales table", settle: 4000, find: { frame: "iframe", sel: "table.waffle" } },
  { id: "t07-gsheet-sales-total", app: "Chromium (Google Sheets)", url: GS_PUB, kind: "text", label: "Total sales cell $1,020", utterance: "track this number", settle: 4000, find: { frame: "iframe", sel: "td", text: "$1,020" } },
  { id: "t08-gsheet-sales-share-c", app: "Chromium (Google Sheets)", url: GS_PUB, kind: "text", label: "43.1% share cell for category C", utterance: "what does this percentage mean?", settle: 4000, find: { frame: "iframe", sel: "td", text: "43.1%" } },
  // public Notion page with a database table
  { id: "t09-notion-table", app: "Chromium (Notion)", url: NOTION, kind: "table", label: "Entries table view", utterance: "track this table", settle: 7000, find: { sel: ".notion-table-view", nth: 0 } },
  { id: "t10-notion-status-header", app: "Chromium (Notion)", url: NOTION, kind: "table", label: "Status column header", utterance: "what is this column?", settle: 7000, find: { sel: ".notion-table-view-header-cell", text: "Status", nth: 0 } },
  { id: "t11-notion-entry-row", app: "Chromium (Notion)", url: NOTION, kind: "table", label: "Entry 2 row", utterance: "open this entry", settle: 7000, find: { sel: ".notion-table-view-row", re: "^Entry 2", nth: 0 } },
  // Wikipedia
  { id: "t12-wiki-companies-row", app: "Chromium (Wikipedia)", url: WP_CO, kind: "table", label: "Walmart row in largest companies table", utterance: "track this company", settle: 3000, find: { sel: "table.wikitable tr", re: "^\\d+\\s+Walmart", nth: 0 } },
  { id: "t13-wiki-companies-revenue-header", app: "Chromium (Wikipedia)", url: WP_CO, kind: "table", label: "Revenue column header", utterance: "what does this column mean?", settle: 3000, find: { sel: "table.wikitable th", re: "^Revenue", nth: 0 } },
  { id: "t14-wiki-seattle-temp-row", app: "Chromium (Wikipedia)", url: "https://en.wikipedia.org/wiki/Seattle", kind: "table", label: "Seattle mean daily maximum temperature row", utterance: "track this", settle: 3000, find: { sel: "table.wikitable tr", re: "^Mean daily maximum", nth: 0 } },
  { id: "t15-wiki-warming-chart", app: "Chromium (Wikipedia)", url: "https://en.wikipedia.org/wiki/Global_warming", kind: "chart", label: "Common Era global temperature chart", utterance: "what does this chart show?", settle: 3500, find: { sel: "img[src*=\"Common_Era_Temperature\"]", nth: 0 } },
  // SaaS pricing
  { id: "t16-slack-pricing-pro-price", app: "Chromium (Slack)", url: "https://slack.com/pricing", kind: "text", label: "Pro plan price", utterance: "track this price", settle: 5000, find: { sel: "div, span, p", re: "\\$4\\.38", nth: 0 } },
  { id: "t17-slack-pricing-cta", app: "Chromium (Slack)", url: "https://slack.com/pricing", kind: "button", label: "Pro plan Get started button", utterance: "start this plan", settle: 5000, find: { sel: "a, button", re: "^get started$", flags: "i", nth: 2 } },
  { id: "t18-vercel-pricing-pro-price", app: "Chromium (Vercel)", url: "https://vercel.com/pricing", kind: "text", label: "Pro plan price $20/mo", utterance: "what does this plan cost?", settle: 5000, find: { sel: "div, span, p, h2, h3", re: "^\\$20", nth: 0 } },
  { id: "t19-notion-pricing-plus", app: "Chromium (Notion)", url: "https://www.notion.com/pricing", kind: "text", label: "Plus plan price", utterance: "track this price", settle: 5000, find: { sel: "div, span, p", re: "^\\$10", nth: 0 } },
  { id: "t20-notion-pricing-cta", app: "Chromium (Notion)", url: "https://www.notion.com/pricing", kind: "button", label: "Get Notion free button", utterance: "sign me up", settle: 5000, find: { sel: "a, button", re: "^(Get Notion free|Sign up|Get started)", flags: "i", nth: 0 } },
  // data-journalism chart page
  { id: "t21-owid-life-expectancy-chart", app: "Chromium (Our World in Data)", url: OWID, kind: "chart", label: "life expectancy line chart", utterance: "what does this chart show?", settle: 6000, pre: PRE_COOKIES, find: { sel: "figure, .GrapherComponent, #grapher-container svg", nth: 0 } },
  { id: "t22-owid-chart-title", app: "Chromium (Our World in Data)", url: OWID, kind: "text", label: "chart title", utterance: "explain this chart title", settle: 6000, pre: PRE_COOKIES, find: { sel: "h1, h2, .HeaderHTML, header", re: "[Ll]ife expectancy", nth: 0 } },
];
