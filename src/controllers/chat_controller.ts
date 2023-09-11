import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext, NotebookCell, NotebookDocument } from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import {
    BoostNotebookCell,
    BoostNotebook
} from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';

export const chatKernelName = 'chat';
const chatOutputHeader = 'Analysis Query';

export class BoostChatKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            chatKernelName,
            chatOutputHeader,
            'Enables custom queries and analysis against the project.',
            ControllerOutputType.chat,
            DisplayGroupFriendlyName.deepcode,
            chatOutputHeader,
            false,
            false,
            context,
            otherThis,
            onServiceErrorHandler,
            "query");
	}

	dispose(): void {
		super.dispose();
	}

    get requiresInputData(): boolean {
        return false;
    }

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/chat';
            case 'dev':
                return '';
            case "test":
                return '';
            case 'staging':
            case 'prod':
            default:
                return '';
        }
    }

    localizeError(error: any): Error {
        throw error;
    }

    onKernelOutputItem(
        response: any,
        notebook: NotebookDocument | BoostNotebook,
        cell : NotebookCell | BoostNotebookCell,
        mimetype : any) : string {
        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.analysis);
    }
}