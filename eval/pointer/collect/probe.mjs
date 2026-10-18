// dev helper: node probe.mjs <url> '<js expr>' [settleMs]
import { openBrowser, setViewport, goto, screenshot } from "./cdp.mjs";
const [url, expr, settle] = process.argv.slice(2);
const b = await openBrowser({ port: 9333 });
await setViewport(b);
await goto(b, url, { settle: Number(settle) || 3000 });
console.log("title:", await b.ev("document.title"));
if (expr) console.log(JSON.stringify(await b.ev(expr), null, 1).slice(0, 6000));
await screenshot(b, "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/probe.png");
b.close(); process.exit(0);
