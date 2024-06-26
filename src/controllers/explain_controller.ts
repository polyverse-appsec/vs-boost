import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext, NotebookCell, NotebookDocument } from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { BoostNotebook, BoostNotebookCell } from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';

export const explainKernelName = 'explain';
export const explainOutputHeader = 'Code Explanation';

export function getExplainEndpoint(cloudServiceStage: string): string {
    switch (BoostConfiguration.cloudServiceStage)
    {
        case "local":
            return 'http://127.0.0.1:8000/explain';
        case 'dev':
            return 'https://jorsb57zbzwcxcjzl2xwvah45i0mjuxs.lambda-url.us-west-2.on.aws/';
        case "test":
            return 'https://r5s6cjvc43jsrqdq3axrhrceya0cumft.lambda-url.us-west-2.on.aws/';
        case 'staging':
        case 'prod':
        default:
            return 'https://vdcg2nzj2jtzmtzzcmfwbvg4ey0jxghj.lambda-url.us-west-2.on.aws/';
    }
}

export class BoostExplainKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceResponseHandler: any, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            explainKernelName,
            'Explain Code',
            'Explains the targeted source code in English, including algorithms, referenced frameworks and design patterns',
            ControllerOutputType.explain,
            DisplayGroupFriendlyName.documentation,
            explainOutputHeader,
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
        return getExplainEndpoint(BoostConfiguration.cloudServiceStage);
    }

    onKernelOutputItem(
        response: any,
        notebook : NotebookDocument | BoostNotebook,
        cell : NotebookCell | BoostNotebookCell,
        mimetype : any) : string {
        if (response.explanation === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.explanation);
    }
}