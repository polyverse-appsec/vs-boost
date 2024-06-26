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

export const analyzeKernelName = 'analyze';
const analysisOutputHeader = 'Code Analysis';

export class BoostAnalyzeKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceResponseHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            analyzeKernelName,
            'Analyze for bug and design flaws',
            'Deep analysis of all targeted source code for security vulnerabiities, bugs and potential design flaws',
            ControllerOutputType.analyze,
            DisplayGroupFriendlyName.security,
            analysisOutputHeader,
            true,
            true, 
            context,
            otherThis,
            onServiceResponseHandler);
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/analyze';
            case 'dev':
                return 'https://iyn66vkb6lmlcb4log6d3ah7d40axgqu.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://avfacpvmtvwcns7sq3si46noxy0zcyrb.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://2av3vd7bxvxu3zfymtdgqziuoy0lvpge.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(
        response: any,
        notebook : NotebookDocument | BoostNotebook,
        _ : NotebookCell | BoostNotebookCell,
        __ : any) : string {

        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.analysis);
    }
}
