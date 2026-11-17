import pino from "pino"

const logger = pino({
  level: process.env.LOG_LEVEL || "info",

  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,

  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "DATABASE_URL",
    ],
    censor: "[REDACTED]",
  },
})

export default logger