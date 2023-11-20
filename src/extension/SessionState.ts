import * as vscode from 'vscode';

class SessionStateVariable<T> {
    constructor(private key: string, private value: T) {
        void this.setContext();
    }

    public get(): T {
        return this.value;
    }

    public async set(value: T): Promise<void> {
        this.value = value;
        return this.setContext();
    }

    private async setContext(): Promise<void> {
        await vscode.commands.executeCommand('setContext', this.key, this.value);
    }
}

export abstract class SessionState {
    public static paid = new SessionStateVariable<boolean>('polyverseboost.paid', false);
}