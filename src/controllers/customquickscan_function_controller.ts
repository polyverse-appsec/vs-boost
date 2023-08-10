import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { FunctionKernelControllerBase } from './function_base_controller';
import { ControllerOutputType } from './controllerOutputTypes';
import { BoostNotebookCell, BoostNotebook } from '../data/jupyter_notebook';
import * as vscode from 'vscode';
import { boostLogging } from '../utilities/boostLogging';

const customQuickScanFunctionKernelName = "customQuickScan";

export class BoostCustomQuickScanFunctionKernel extends FunctionKernelControllerBase {

    // use a default scan for async or multi-threading issues
    customScanGuidance : string =
        'broken or incorrect handling of asynchronous code. \n' +
        'Look for any of following issues:\n' +
        '* code that leaks threads, wasting memory or thread pool resources\n' +
        '* uses multiple threads to operate on unsafe or shared resources without locking\n' +
        '* incorrect synchronization, including missing joins or waits\n' +
        '* misuse of locks that can lead to livelocks and deadlocks ' +
        'including lock order inversions or race conditions.\n' +
        '* code that might exit prematurely without resolving or ' +
        'rejecting a promise or its language-specific equivalent\n';
    _customScanGuidance : string = this.customScanGuidance;

    customScanCategories : string = 'ResourceLeak, UnsafeResource, Deadlock, Livelock, MissingSync';
    _customScanCategories : string = this.customScanCategories;

	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            customQuickScanFunctionKernelName,
            'Quick source scan for code issues',
            'Quickly analyzes all targeted source code for custom set of issues',
            ControllerOutputType.customQuickScanFunction,
            "customScan",
            "Custom Quick Scan", 
            context,
            otherThis,
            onServiceErrorHandler);
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/customscan_function';
            case 'dev':
                return 'https://pko6t3libouikzl6o3f2ur4fji0czvcm.lambda-url.us-west-2.on.aws/';
            case "test":
                throw new Error('Custom Quick Scan Function not available in test stage');
            case 'staging':
            case 'prod':
            default:
                throw new Error('Custom Quick Scan Function not available in production stage');
        }
    }

	dispose(): void {
		super.dispose();
	}

    async executeAll(
        cells: vscode.NotebookCell[] | BoostNotebookCell[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session : vscode.AuthenticationSession,
        forceAnalysisRefresh : boolean = false) : Promise<boolean> {

        const userInputGuidance = await vscode.window.showInputBox({
            value: this._customScanGuidance,
            prompt: 'Enter your analysis guidance',
            placeHolder: this._customScanGuidance,
        });
    
        if (userInputGuidance === undefined) {
            // write user canceled warning to output, without UI
            boostLogging.warn(`Boost ${this.outputHeader} cancelled by user`, false);
            throw new Error(`Boost ${this.outputHeader} cancelled by user`);
        }
        // if user blanked out the prompt, use the default
        if (userInputGuidance.trim() === '') {
            this._customScanGuidance = this.customScanGuidance;
        } else {
            this._customScanGuidance = userInputGuidance;
        }

        const userInputCategories = await vscode.window.showInputBox({
            value: this._customScanCategories,
            prompt: 'Enter your analysis issue categories',
            placeHolder: this._customScanCategories,
        });
    
        if (userInputCategories === undefined) {
            // write user canceled warning to output, without UI
            boostLogging.warn(`Boost ${this.outputHeader} cancelled by user`, false);
            throw new Error(`Boost ${this.outputHeader} cancelled by user`);
        }
        // if user blanked out the prompt, use the default
        if (userInputCategories.trim() === '') {
            this._customScanCategories = this.customScanCategories;
        } else {
            this._customScanCategories = userInputCategories;
        }
        
        return super.executeAll(cells, notebook, session, forceAnalysisRefresh);
    }

    async makeBoostServiceRequest(cell: vscode.NotebookCell | BoostNotebookCell, serviceEndpoint: string, payload: any): Promise<any> {
        // inject the current custom prompt into the payload
        payload = { ...payload,
            customScanGuidance: this._customScanGuidance,
            customScanCategories: this._customScanCategories
        };

        return super.makeBoostServiceRequest(cell, serviceEndpoint, payload);
    }}
