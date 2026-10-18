import "dotenv/config";
import { createApp } from "./app";

const app = createApp();
const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`[server] http://localhost:${port}  mock=${process.env.MOCK_AI === "1"}`);
});
