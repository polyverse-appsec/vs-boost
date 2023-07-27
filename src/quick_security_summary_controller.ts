import {
    BoostQuickSummaryKernelControllerBase,
} from './quick_summary_controller';

import { ControllerOutputType } from './controllerOutputTypes';

import * as vscode from 'vscode';
import { analyzeKernelName } from './analyze_controller';

export const quickSecuritySummaryKernelName = `quick${ControllerOutputType.analyze}`;

export class BoostQuickSecuritySummaryKernel extends BoostQuickSummaryKernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: vscode.DiagnosticCollection)
        {
        super(
            context,
            onServiceErrorHandler,
            otherThis,
            collection,
            analyzeKernelName,
            ControllerOutputType.analyze,
            ControllerOutputType.analyzeFunction,
            "Security");
	}

	dispose(): void {
		super.dispose();
	}
}