import {
    KernelControllerBase
 } from './base_controller';
import { AuthenticationSession, DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';
import { NotebookCell, NotebookDocument } from 'vscode';
import { BoostNotebook, BoostNotebookCell } from '../data/jupyter_notebook';
import { ControllerOutputType } from './controllerOutputTypes';
import * as path from 'path';
import { boostLogging } from '../utilities/boostLogging';

export const flowDiagramKernelName = 'flowdiagram';
const flowDiagramOutputHeader = `Flow Diagram`;

const nonCodeFileExtensions = [
    '.json',
];

export class BoostFlowDiagramKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceResponseHandler: any, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            flowDiagramKernelName,
            'Create Flow Diagrams',
            'Creates a flow diagram from the code',
            ControllerOutputType.flowDiagram,
            DisplayGroupFriendlyName.documentation,
            flowDiagramOutputHeader,
            false,
            false,
            context,
            otherThis,
            onServiceResponseHandler);
	}

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/flowdiagram';
            case 'dev':
                return 'https://54t2jblqus2ou7letg3g2eph7y0aydtk.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://a72sw3ffonfcjpq6unrift476e0okcgq.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://b3pflzry5l5wbaenwtdytiv7se0ykzkc.lambda-url.us-west-2.on.aws/';
        }
        
    }

    executeAll(
        cells: NotebookCell[] | BoostNotebookCell[],
        notebook: NotebookDocument | BoostNotebook,
        session: AuthenticationSession, forceAnalysisRefresh?: boolean): Promise<boolean> {

        const usingBoostNotebook = notebook instanceof BoostNotebook;

        const sourceFile = notebook.metadata?.sourceFile;
        if (sourceFile) {
            const extension = path.extname(sourceFile);
            if (nonCodeFileExtensions.includes(extension.toLowerCase())) {
                // don't execute on non-code files
                boostLogging.info(`Skipping flow diagram analysis on non-code file ${sourceFile}`);
                return Promise.resolve(false);
            }
        }

        return super.executeAll(cells, notebook, session, forceAnalysisRefresh);
    }
    
    onKernelOutputItem(
        response: any,
        notebook : NotebookDocument | BoostNotebook,
        cell : NotebookCell | BoostNotebookCell,
        mimetype : any) : string {
        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.analysis);
    }
}