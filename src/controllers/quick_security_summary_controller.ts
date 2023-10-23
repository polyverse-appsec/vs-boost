import {
    BoostQuickSummaryKernelControllerBase,
    quickSummaryKernelNamePrefix
} from './quick_summary_controller';

import { ControllerOutputType } from './controllerOutputTypes';

import * as vscode from 'vscode';
import { analyzeFunctionKernelName } from './analyze_function_controller';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';

export const quickSecuritySummaryKernelName = `${quickSummaryKernelNamePrefix}${analyzeFunctionKernelName}`;

export class BoostQuickSecuritySummaryKernel extends BoostQuickSummaryKernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceResponseHandler: any, otherThis : any, collection: vscode.DiagnosticCollection)
        {
        super(
            context,
            onServiceResponseHandler,
            otherThis,
            collection,
            analyzeFunctionKernelName,
            ControllerOutputType.analyze,
            DisplayGroupFriendlyName.security,
            ControllerOutputType.analyzeFunction,
            "Security");
	}

	dispose(): void {
		super.dispose();
	}
}