import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext} from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import { boostLogging } from './boostLogging';
import { TextDecoder } from 'util';
import { BoostNotebook, BoostNotebookCell } from './jupyter_notebook';

export const blueprintCellMarker = 'archblueprintCode';

export class BoostArchitectureBlueprintKernel extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: vscode.DiagnosticCollection) {
        super(
            collection,
            'blueprint',
            'Architectural Blueprint Code',
            'Builds Archiectural Blueprint of targeted source code by identifying architectural principles, patterns, licensing, performance, etc.',
            blueprintCellMarker,
            false,
            false,
            context,
            otherThis,
            onServiceErrorHandler);
	}

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/blueprint';
            case 'dev':
                return 'https://67wxr6xq76bj5jiaoct5qjzble0wfmdt.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://igmvzc3rb3i7ftqm5ozzhpxa5m0xzuae.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://hb34ftyxhjnd7jvxbmlsmddct40hvrni.lambda-url.us-west-2.on.aws/';
        }
    }

    readonly kernelMarkdownPrefix = "### Boost Architectural Blueprint\n";

    onKernelOutputItem(response: any): string {
        return `${this.kernelMarkdownPrefix}\n\nLast Updated: ${this.currentDateTime}\n\n${response.blueprint}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Architectural Blueprint failed: " + error.message;
        return error;
    }

    private _lastBlueprint = "";

    async executeAll(cells: vscode.NotebookCell[] | BoostNotebookCell[], notebook: vscode.NotebookDocument | BoostNotebook, session : vscode.AuthenticationSession) {
        this._lastBlueprint = "";

        const usingBoostNotebook = (notebook instanceof BoostNotebook);

        // seed cell is the largest (source code) cell in the notebook / this is a heuristic for now to get max detail
        let seedCell : vscode.NotebookCell | BoostNotebookCell | undefined = undefined;
        let largestSize = 0;
        for (const cell of cells) {
            let length = usingBoostNotebook?(cell as BoostNotebookCell).source.length : (cell as vscode.NotebookCell).document.getText().length;
            if (length > largestSize) {
                largestSize = length;
                seedCell = cell;
            }
        }
        if (!seedCell) {
            boostLogging.error(`Blueprint seed not built due to no cells in ${notebook.uri.toString()}`);
            return;
        }

        // build the seed cell first
        if (!await this.doExecution(notebook, seedCell, session)) {
            boostLogging.error(`Error building Architectural Blueprint seed on cell ${usingBoostNotebook ? (seedCell as BoostNotebookCell).id : (seedCell as vscode.NotebookCell).document.uri.toString()}`);
            return; // we failed seed, just bail
        }

        // now process all remaining cells
        let successfullyCompleted = true;
        let lastCell = seedCell;
        for (const cell of cells) {
            if (usingBoostNotebook? (cell as BoostNotebookCell).id === (seedCell as BoostNotebookCell).id :
                (cell as vscode.NotebookCell).document.uri === (seedCell as vscode.NotebookCell).document.uri) {
                continue; // skip seed cell
            }

            // get the blueprint out of the last Cell (or seed cell) to feed into next blueprinting
            const blueprintOutput = usingBoostNotebook ? (lastCell as BoostNotebookCell).outputs.find(output => {
                return (blueprintCellMarker === output.metadata?.outputType);
            }) :
                (lastCell as vscode.NotebookCell).outputs.find(output => {
                    return (blueprintCellMarker === output.metadata?.outputType);
                });;

            if (!blueprintOutput || blueprintOutput.items.length !== 1) {
                boostLogging.error(`Error building Architectural Blueprint; could not find blueprint on ${(seedCell as vscode.NotebookCell).document.uri.toString()}`);
                return; // we failed seed, just bail
            }
            let blueprint = usingBoostNotebook?(blueprintOutput.items[0].data as string) : new TextDecoder().decode((blueprintOutput as vscode.NotebookCellOutput).items[0].data);
            // strip the header off the blueprint - its the 3rd line
            blueprint = blueprint.split("\n", 3)[2];
            this._lastBlueprint = blueprint;

            // update the blueprint in other cells
            if (!await this.doExecution(notebook, cell, session)) {
                successfullyCompleted = false;
            }
		}
        if (!successfullyCompleted) {
            boostLogging.error(`Error Blueprinting Notebook ${notebook.uri.toString()}`);
        }
    }

    async makeBoostServiceRequest(
        cell : vscode.NotebookCell | BoostNotebookCell,
        serviceEndpoint : string,
        payload : any): Promise<any> {

            if (this._lastBlueprint && this._lastBlueprint !== "") {
                // inject the last blueprint into the payload
                payload = { ...payload,
                    blueprint: this._lastBlueprint};
            }
    
            return super.makeBoostServiceRequest(cell, serviceEndpoint, payload);
    }
}