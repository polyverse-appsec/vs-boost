import { BoostExtension } from "../extension/BoostExtension";
import { boostLogging } from "../utilities/boostLogging";
import * as vscode from 'vscode';
import { getSymbols } from "./callGraph";


export class CallAndClassGraph {
    public boostextension: BoostExtension;
    public context: vscode.ExtensionContext;

    public constructor(
        context: vscode.ExtensionContext,
        boostextension: BoostExtension)
    {
        this.context = context;
        this.boostextension = boostextension;
    }

    public async generateCallGraph(){
        boostLogging.info("Generating Call Graph");
        return getSymbols();
    }
}