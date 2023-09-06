import * as vscode from 'vscode';
import { CodelensProvider } from './codelens_provider';
import { DecoratorProvider } from './decorator_provider';
import { BoostExtension } from '../extension/BoostExtension';

export class InlineBoostAnnotations {
    //public codeLensProvider: CodelensProvider;
    public decoratorProvider: DecoratorProvider;
    public context: vscode.ExtensionContext;
    public extension: BoostExtension;

    constructor(context: vscode.ExtensionContext, extension: BoostExtension) {
        /*
         unused for now

        this.codeLensProvider = new CodelensProvider();
        vscode.languages.registerCodeLensProvider("*", this.codeLensProvider);
        vscode.commands.registerCommand("polyverse-boost-notebook.codelensAction", (args: any) => {
            vscode.window.showInformationMessage(`CodeLens action clicked with args=${args}`);
        });
        */

        this.decoratorProvider = new DecoratorProvider(context, extension);
        this.context = context;
        this.extension = extension;
    }
}
