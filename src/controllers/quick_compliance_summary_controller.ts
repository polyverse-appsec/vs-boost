import {
    BoostQuickSummaryKernelControllerBase,
    quickSummaryKernelNamePrefix
} from './quick_summary_controller';

import { ControllerOutputType } from './controllerOutputTypes';

import * as vscode from 'vscode';
import { complianceFunctionKernelName } from './compliance_function_controller';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';

export const quickComplianceSummaryKernelName = `${quickSummaryKernelNamePrefix}${complianceFunctionKernelName}`;

export class BoostQuickComplianceSummaryKernel extends BoostQuickSummaryKernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: vscode.DiagnosticCollection)
        {
        super(
            context,
            onServiceErrorHandler,
            otherThis,
            collection,
            complianceFunctionKernelName,
            ControllerOutputType.compliance,
            DisplayGroupFriendlyName.compliance,
            ControllerOutputType.complianceFunction,
            "Compliance");
	}

	dispose(): void {
		super.dispose();
	}
}