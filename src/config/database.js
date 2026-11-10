import { env } from "./env.js";

/** MySQL connection settings from `.env`. */
export function databaseConfig() {
  const { db } = env();
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.name,
    poolSize: db.poolSize,
  };
}
