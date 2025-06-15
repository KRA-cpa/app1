// config/logger.cjs
const winston = require('winston'); // [cite: 1]
const path = require('path');
const fs = require('fs');

const logDirectory = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory); //[cite: 7]
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ level, message, timestamp, stack }) => {
        return `${timestamp} ${level}: ${stack || message}`;
      })
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDirectory, 'error.log'), level: 'error' }),// [cite: 8]
    new winston.transports.File({ filename: path.join(logDirectory, 'combined.log') }) // [cite: 8]
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    )
  })); // [cite: 9]
}

module.exports = logger;