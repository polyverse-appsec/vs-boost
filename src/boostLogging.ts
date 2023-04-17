import {
    OutputChannel,
    Disposable,
    window
} from "vscode";

export class BoostLogger extends Disposable {
    private _outputChannel: OutputChannel;

    constructor() {
        super(() => this.dispose());

        // we use a friendly name for the channel as this will be displayed to the user in the output pane
        this._outputChannel = window.createOutputChannel("Polyverse Boost");
    
        this.log('Boost Logging starting...');
    }

    log(message: string) {
        this._outputChannel.appendLine(message);
    }

    debug(message: string) {
        this.log("DEBUG: " + message);
    }

    info(message: string) {
        this.log("INFO: " + message);
        window.showInformationMessage(message);
    }
    warn(message: string) {
        this.log("WARNING: " + message);
        window.showWarningMessage(message);
    }
    error(message: string, showUI : boolean = true) {
        this.log("ERROR: " + message);
        if (showUI) {
            window.showErrorMessage(message);
        }
    }

    dispose() : void {
        this.log('Boost Logging shutting down...');
        this._outputChannel.dispose();       
    }
}

export const boostLogging = new BoostLogger();
