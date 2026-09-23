import { handle } from "hono/vercel";
import app from "../dist/index.mjs";

export default handle(app);
