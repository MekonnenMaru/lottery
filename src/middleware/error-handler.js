import multer from "multer";

/** Wrap async route handlers so rejected promises become JSON errors. */
export function wrap(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Final Express error middleware. */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    res.status(400).json({ success: false, message: "Upload a JPEG, PNG, or WebP image under 5 MB" });
    return;
  }
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ success: false, message: "Invalid request" });
    return;
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 ? "Something went wrong" : err.message;
  res.status(status).json({ success: false, message, error: message });
}
