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
    customQuickScanFunction = 'customQuickScanCode' + functionOutputTypeExtension,
}