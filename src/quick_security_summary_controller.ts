import {
    BoostQuickSummaryKernelControllerBase,
    quickSummaryKernelNamePrefix
} from './quick_summary_controller';

import { ControllerOutputType } from './controllerOutputTypes';

import * as vscode from 'vscode';
import { analyzeFunctionKernelName } from './analyze_function_controller';

export const quickSecuritySummaryKernelName = `${quickSummaryKernelNamePrefix}${analyzeFunctionKernelName}`;

export class BoostQuickSecuritySummaryKernel extends BoostQuickSummaryKernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: vscode.DiagnosticCollection)
        {
        super(
            context,
            onServiceErrorHandler,
            otherThis,
            collection,
            analyzeFunctionKernelName,
            ControllerOutputType.analyze,
            ControllerOutputType.analyzeFunction,
            "Security");
	}

	dispose(): void {
		super.dispose();
	}
}