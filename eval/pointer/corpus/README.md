# Pointer corpus

30 labelled targets. Each directory holds `shot.png` (1440x900, dpr 1), `shot_small.png` (longest side <= 1568 px, the Jev limit), `target.json`, and where available `dom.json`, `ax.json`, `full.png` / `full_small.png` (top 2400 px of the whole page, for web targets).

## Ground truth

- `box` is `{x,y,w,h}` in `shot.png` pixels (top-left origin). `cursor` is a point inside the box (deterministic 40-60% offset). `boxClipped` is true when the element is larger than the viewport and the box was clipped to it.
- Web targets (`t*`): box = the target element's DOM `getBoundingClientRect()` after scrolling it into view in the Playwright Chromium (CDP), viewport 1440x900. `dom.json` = `DomInfo` (capture contract) for the element under the cursor, with a trimmed HTML snapshot of its table/figure container. `ax.json` = CDP accessibility tree (`Accessibility.getFullAXTree` + `DOM.getBoxModel` frames), the 50 nodes nearest the cursor, shaped as `AxNode`. Google Sheets pages render inside an iframe, so their `ax.json` may be thin or absent.
- Native-PDF targets (`n*`): the PDFs in `../fixtures/` are printed from local HTML with `Page.printToPDF`. **No real Preview window capture or AX frames**: the cmux-cua computer-use daemon was unavailable and this shell has no Screen Recording grant (`screencapture -l` failed). Instead each PDF page is rendered with CoreGraphics (the renderer Preview uses) at 96 dpi and composited on a Preview-style gray 1440x900 canvas; the box is the print-layout DOM rect plus the page offset. These carry no `dom.json` or `ax.json`. Re-do them with real Preview AX frames once the notch app has Screen Recording and Accessibility.
- Not covered (not installed here): Excel and the Slack app. Slack is represented by its public pricing page, Google Sheets by two public published sheets, Notion by a public notion.site page (the owner's workspace was not touched).
- Live pages (transit, pricing, Wikipedia, Our World in Data) change over time. The stored screenshot and box are authoritative, so do not re-fetch the page to re-derive them.

Totals: 22 with dom.json, 22 with ax.json.

## Targets

| id | app | kind | target | utterance | box (x,y,w,h) | source |
|---|---|---|---|---|---|---|
| n01-pdf-schedule-table | Preview (PDF, rendered) | table | Route 44 weekday timetable | "track this schedule" | 370,145,701,205 | eval/pointer/fixtures/schedule.pdf (printed from schedule.html via Page.printToPDF) |
| n02-pdf-schedule-arrival | Preview (PDF, rendered) | text | 6:41 arrival time at University District Station | "when does the first bus arrive?" | 581,320,82,29 | eval/pointer/fixtures/schedule.pdf (printed from schedule.html via Page.printToPDF) |
| n03-pdf-pricing-table | Preview (PDF, rendered) | table | Starter / Pro / Team pricing table | "track this pricing" | 370,145,701,206 | eval/pointer/fixtures/pricing.pdf (printed from pricing.html via Page.printToPDF) |
| n04-pdf-pricing-pro-price | Preview (PDF, rendered) | text | Pro plan price $12 / month | "what does this plan cost?" | 728,175,174,30 | eval/pointer/fixtures/pricing.pdf (printed from pricing.html via Page.printToPDF) |
| n05-pdf-revenue-chart | Preview (PDF, rendered) | chart | Quarterly revenue bar chart | "what does this chart show?" | 370,145,640,360 | eval/pointer/fixtures/chart.pdf (printed from chart.html via Page.printToPDF) |
| n06-pdf-revenue-q4-bar | Preview (PDF, rendered) | chart | Q4 bar (72M) in the revenue chart | "why is this bar so high?" | 820,205,80,270 | eval/pointer/fixtures/chart.pdf (printed from chart.html via Page.printToPDF) |
| n07-pdf-invoice-items | Preview (PDF, rendered) | table | Invoice 2041 line items table | "track this invoice" | 370,145,701,235 | eval/pointer/fixtures/invoice.pdf (printed from invoice.html via Page.printToPDF) |
| n08-pdf-invoice-total | Preview (PDF, rendered) | text | Total due $1,165.92 | "pay this amount" | 921,349,149,30 | eval/pointer/fixtures/invoice.pdf (printed from invoice.html via Page.printToPDF) |
| t01-transit-timetable | Chromium (Sound Transit) | table | first populated timetable row (1 Line, to Federal Way) (clipped) | "track this train" | 25,420,1415,60 | https://www.soundtransit.org/ride-with-us/routes-schedules/1-line |
| t02-transit-time-cell | Chromium (Sound Transit) | text | first departure time cell | "what time is this train?" | 1255,420,160,60 | https://www.soundtransit.org/ride-with-us/routes-schedules/1-line |
| t03-transit-view-toggle | Chromium (Sound Transit) | button | Point to point view toggle | "switch to point to point" | 1249,426,134,48 | https://www.soundtransit.org/ride-with-us/routes-schedules/1-line |
| t04-gsheet-class-table | Chromium (Google Sheets) | table | Class Data sheet table | "track this table" | 0,29,772,709 | https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/htmlview |
| t05-gsheet-class-major-header | Chromium (Google Sheets) | table | Major column header cell | "what does this column mean?" | 530,53,121,35 | https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/htmlview |
| t06-gsheet-sales-table | Chromium (Google Sheets) | table | Category / Sales / % of Total table | "track this sales table" | 0,29,332,233 | https://docs.google.com/spreadsheets/d/e/2PACX-1vS4CmyhVsSYtVtK8MwyZ6WqkcEf1oxCx15zq-dZDitvCZt7alqYBy-ydnxJiApR-gD7oLsDY4s4V_sa/pubhtml |
| t07-gsheet-sales-total | Chromium (Google Sheets) | text | Total sales cell $1,020 | "track this number" | 130,241,101,21 | https://docs.google.com/spreadsheets/d/e/2PACX-1vS4CmyhVsSYtVtK8MwyZ6WqkcEf1oxCx15zq-dZDitvCZt7alqYBy-ydnxJiApR-gD7oLsDY4s4V_sa/pubhtml |
| t08-gsheet-sales-share-c | Chromium (Google Sheets) | text | 43.1% share cell for category C | "what does this percentage mean?" | 231,199,101,21 | https://docs.google.com/spreadsheets/d/e/2PACX-1vS4CmyhVsSYtVtK8MwyZ6WqkcEf1oxCx15zq-dZDitvCZt7alqYBy-ydnxJiApR-gD7oLsDY4s4V_sa/pubhtml |
| t09-notion-table | Chromium (Notion) | table | Entries table view | "track this table" | 96,394,601,156 | https://bensomething.notion.site/Synced-Database-Views-d03baa8ecb524b6996d8278233f78e61 |
| t10-notion-status-header | Chromium (Notion) | table | Status column header | "what is this column?" | 204,454,100,36 | https://bensomething.notion.site/Synced-Database-Views-d03baa8ecb524b6996d8278233f78e61 |
| t11-notion-entry-row | Chromium (Notion) | table | Entry 2 row | "open this entry" | 104,454,300,36 | https://bensomething.notion.site/Synced-Database-Views-d03baa8ecb524b6996d8278233f78e61 |
| t12-wiki-companies-row | Chromium (Wikipedia) | table | Walmart row in largest companies table | "track this company" | 264,433,911,33 | https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue |
| t13-wiki-companies-revenue-header | Chromium (Wikipedia) | table | Revenue column header | "what does this column mean?" | 653,426,80,46 | https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue |
| t14-wiki-seattle-temp-row | Chromium (Wikipedia) | table | Seattle mean daily maximum temperature row | "track this" | 265,427,911,46 | https://en.wikipedia.org/wiki/Seattle |
| t15-wiki-warming-chart | Chromium (Wikipedia) | chart | Common Era global temperature chart | "what does this chart show?" | 830,321,342,257 | https://en.wikipedia.org/wiki/Global_warming |
| t16-slack-pricing-pro-price | Chromium (Slack) | text | Pro plan price | "track this price" | 505,424,135,52 | https://slack.com/pricing |
| t17-slack-pricing-cta | Chromium (Slack) | button | Pro plan Get started button | "start this plan" | 429,421,274,58 | https://slack.com/pricing |
| t18-vercel-pricing-pro-price | Chromium (Vercel) | text | Pro plan price $20/mo | "what does this plan cost?" | 520,422,98,56 | https://vercel.com/pricing |
| t19-notion-pricing-plus | Chromium (Notion) | text | Plus plan price | "track this price" | 433,476,40,28 | https://www.notion.com/pricing |
| t20-notion-pricing-cta | Chromium (Notion) | button | Get Notion free button | "sign me up" | 1284,14,132,36 | https://www.notion.com/pricing |
| t21-owid-life-expectancy-chart | Chromium (Our World in Data) | chart | life expectancy line chart | "what does this chart show?" | 80,100,1280,680 | https://ourworldindata.org/grapher/life-expectancy |
| t22-owid-chart-title | Chromium (Our World in Data) | text | chart title | "explain this chart title" | 81,101,957,91 | https://ourworldindata.org/grapher/life-expectancy |

## Rebuild

```
node eval/pointer/collect/collect.mjs            # web targets (needs the cached Playwright Chromium; network)
node eval/pointer/collect/print-fixtures.mjs     # fixtures/*.html -> *.pdf + layout.json
swiftc -O eval/pointer/collect/pdf2png.swift -o $TMPDIR/pdf2png && for n in schedule pricing chart invoice; do $TMPDIR/pdf2png eval/pointer/fixtures/$n.pdf eval/pointer/fixtures/$n.page.png; done
python3 -I eval/pointer/collect/native.py        # native-PDF targets
python3 -I eval/pointer/collect/readme.py        # this file + index.json
python3 -I eval/pointer/collect/verify.py OUT_DIR [id-prefix]   # draw boxes on shots for review
```
