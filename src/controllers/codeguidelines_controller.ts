import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext, NotebookCell, NotebookDocument } from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { BoostNotebookCell, BoostNotebook } from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';

export const codeGuidelinesKernelName = 'codeguidelines';
const codeGuidelinesOutputHeader = `Code Guidelines Evaluation`;

export class BoostCodeGuidelinesKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceResponseHandler: any, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            codeGuidelinesKernelName,
            'Evaluate Code Guidelines',
            'Evaluates targeted source code for following Code Guidelines for programming language and framework',
            ControllerOutputType.codeGuidelines,
            DisplayGroupFriendlyName.documentation,
            codeGuidelinesOutputHeader,
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
                return 'http://127.0.0.1:8000/codeguidelines';
            case 'dev':
                return 'https://4govp5ze7uyio3kjehtarpv24u0nabhw.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://5n2t5znpduvacad53c2dibg4du0nrstv.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://ssmhqxozg6ixnk5abyhnezf5ya0seyby.lambda-url.us-west-2.on.aws/';
        }
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