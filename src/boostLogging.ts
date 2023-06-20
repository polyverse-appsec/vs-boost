import {
    OutputChannel,
    Disposable,
    window
} from "vscode";
import { BoostConfiguration } from "./boostConfiguration";

export class BoostLogger extends Disposable {
    private _outputChannel: OutputChannel;

    constructor() {
        super(() => this.dispose());

        // we use a friendly name for the channel as this will be displayed to the user in the output pane
        this._outputChannel = window.createOutputChannel("Polyverse Boost");
    
        this.log('Boost Logging starting...');
    }

    debug(message: string) {
        if (!this.shouldLog("debug")) {
            return;
        }

        this.log("DEBUG: " + message);
    }

    log(message: string) {
        this._outputChannel.appendLine(message);
    }

    info(message: string, showUI : boolean = true) {
        if (!this.shouldLog("info")) {
            return;
        }

        this.log("INFO: " + message);
        if (showUI) {
            window.showInformationMessage(message);
        }
    }

    warn(message: string, showUI : boolean = true) {
        if (!this.shouldLog("warn")) {
            return;
        }

        this.log("WARNING: " + message);
        if (showUI) {
            window.showWarningMessage(message);
        }
    }
    
    error(message: string, showUI : boolean = true) {
        if (!this.shouldLog("error")) {
            return;
        }

        this.log("ERROR: " + message);
        if (showUI) {
            window.showErrorMessage(message);
        }
    }

    dispose() : void {
        this.log('Boost Logging shutting down...');
        this._outputChannel.dispose();       
    }

    shouldLog(messageTarget: string) : boolean {
        const logLevel = BoostConfiguration.logLevel.toLowerCase();

        switch (messageTarget) {
            case "debug":
                return logLevel === "debug";
            case "info":
                return logLevel === "debug" || logLevel === "info";
            case "warn":
                return logLevel === "debug" || logLevel === "info" || logLevel === "warn";
            case "error":
                return logLevel === "debug" || logLevel === "info" || logLevel === "warn" || logLevel === "debug";
            default:
                return true;
        }
    }
}

export const boostLogging = new BoostLogger();
