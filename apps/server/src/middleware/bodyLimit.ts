import express, { type NextFunction, type Request, type Response } from "express";

/** Vercel rejects request bodies over 4.5MB before they reach us, so stay under it there. */
export const VERCEL_JSON_LIMIT = "4mb";
export const LOCAL_JSON_LIMIT = "10mb";

/**
 * JSON parser for large canvas payloads. The cap is read per request (4mb when VERCEL is set, else 10mb)
 * and an oversize body gets a 413 with a friendly message. Other body errors pass through.
 */
export function bigJson(tooLargeMessage: string) {
  const local = express.json({ limit: LOCAL_JSON_LIMIT });
  const vercel = express.json({ limit: VERCEL_JSON_LIMIT });
  return function parse(req: Request, res: Response, next: NextFunction): void {
    (process.env.VERCEL ? vercel : local)(req, res, (err?: unknown) => {
      if ((err as { type?: string } | undefined)?.type === "entity.too.large") {
        res.status(413).json({ error: tooLargeMessage });
        return;
      }
      next(err);
    });
  };
}
