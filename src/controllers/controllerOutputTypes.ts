export const functionOutputTypeExtension = 'List';

export enum ControllerOutputType {
    analyze = 'bugAnalysis',
    analyzeFunction = analyze + functionOutputTypeExtension,
    blueprint = 'archblueprintCode',
    testgen = 'testGeneration',
    compliance = 'complianceCode',
    complianceFunction = compliance + functionOutputTypeExtension,
    performance = 'performance',
    performanceFunction = performance + functionOutputTypeExtension,
    flowDiagram = 'flowDiagram',
    summary = 'summary',
    explain = 'explainCode',
    chat = 'chat',
    codeGuidelines = 'guidelinesCode',
    convert = 'generatedCode',
    customProcess = 'customProcessCode',
    customQuickScanFunction = 'customQuickScanCode' + functionOutputTypeExtension,
}

//compute the display summary of boostprojectdata
//these are the sections supported currently. Be sure to update this list
//if new analysis are done.
export const outputTypeToDisplayGroup = {
    documentation: [
        ControllerOutputType.explain,
        ControllerOutputType.flowDiagram,
    ],
    security: [ControllerOutputType.analyzeFunction],
    compliance: [ControllerOutputType.complianceFunction],
    deepcode: [
        ControllerOutputType.compliance,
        ControllerOutputType.blueprint,
        ControllerOutputType.analyze,
        ControllerOutputType.codeGuidelines,
    ],
};
