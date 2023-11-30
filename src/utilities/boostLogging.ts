import { OutputChannel, Disposable, window, ExtensionContext } from "vscode";
import * as fs from 'fs';
import * as path from 'path';
import winston from 'winston';
import 'winston-daily-rotate-file';

import { BoostConfiguration } from "../extension/boostConfiguration";

export let rollingLogger : winston.Logger;

export function activateLogging(context: ExtensionContext) {
    const logDirectory = path.join(context.extensionPath, 'logs');
    
    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true });
    }

    const transport = new winston.transports.DailyRotateFile({
        filename: path.join(logDirectory, 'boost-%DATE%.log'),
        datePattern: 'YYYY-MM-DD-HH',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '2d'
    });

    rollingLogger = winston.createLogger({
        level: (BoostConfiguration.logLevel.toLowerCase() in ['warn', 'error']) ? 'info' :
            BoostConfiguration.logLevel,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            transport
        ]
    });

    boostLogging.log("Offline logs in: " + logDirectory);
}

export class BoostLogger extends Disposable {
    private _outputChannel: OutputChannel | undefined;

    constructor() {
        super(() => this.dispose());

        // we use a friendly name for the channel as this will be displayed to the user in the output pane
        for (let i = 0; i < 3; i++) {
            try {
                this._outputChannel =
                    window.createOutputChannel("Polyverse Boost");
            } catch (e) {
                // ignore
            }
            if (this._outputChannel) {
                break;
            }
        }
    }

    debug(message: string) {
        if (!this.shouldLog("debug")) {
            return;
        }

        this.log("DEBUG: " + message);
        rollingLogger.debug(message);
    }

    log(message: string) {
        this._log(message);
        rollingLogger.info(message);
    }

    private _log(message: string) {
        this._outputChannel?.appendLine(message);
    }

    info(message: string, showUI: boolean = false) {
        if (!this.shouldLog("info")) {
            return;
        }

        this._log("INFO: " + message);
        rollingLogger.info(message);
        if (showUI) {
            window.showInformationMessage(message);
        }
    }

    warn(message: string, showUI: boolean = false) {
        if (!this.shouldLog("warn")) {
            return;
        }

        this._log("WARNING: " + message);
        rollingLogger.warn(message);
        if (showUI) {
            window.showWarningMessage(message);
        }
    }

    error(message: string, showUI: boolean = false) {
        if (!this.shouldLog("error")) {
            return;
        }

        this._log("ERROR: " + message);
        rollingLogger.error(message);
        if (showUI) {
            window.showErrorMessage(message);
        }
    }

    dispose(): void {
        this.log("Boost Logging shutting down...");
        this._outputChannel?.dispose();
    }

    shouldLog(messageTarget: string): boolean {
        const logLevel = BoostConfiguration.logLevel.toLowerCase();

        switch (messageTarget) {
            case "debug":
                return logLevel === "debug";
            case "info":
                return logLevel === "debug" || logLevel === "info";
            case "warn":
                return (
                    logLevel === "debug" ||
                    logLevel === "info" ||
                    logLevel === "warn"
                );
            case "error":
                return (
                    logLevel === "debug" ||
                    logLevel === "info" ||
                    logLevel === "warn" ||
                    logLevel === "error"
                );
            default:
                return true;
        }
    }
}

export const boostLogging = new BoostLogger();
