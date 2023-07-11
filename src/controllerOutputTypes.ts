const functionOutputTypeExtension = 'List';

export enum ControllerOutputType {
    analyze = 'bugAnalysis',
    analyzeFunction = analyze + functionOutputTypeExtension,
    blueprint = 'archblueprintCode',
    testgen = 'testGeneration',
    compliance = 'compliance',
    complianceFunction = compliance + functionOutputTypeExtension,
    performance = 'performance',
    performanceFunction = performance + functionOutputTypeExtension,
    flowDiagram = 'flowDiagram',
    summary = 'summary',
    explain = 'explainCode',
    codeGuidelines = 'guidelinesCode',
    convert = 'generatedCode',

}