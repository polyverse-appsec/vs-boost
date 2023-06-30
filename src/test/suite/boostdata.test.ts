import * as fs from 'fs';
import { BoostProjectData } from '../../BoostProjectData'; // Update the path
import * as assert from 'assert';

suite('BoostProjectData', function() {
    const sampleDataJson = JSON.stringify({
        summary: {
            projectName: 'Sample Project',
            summaryUrl: 'http://example.com',
            filesToAnalyze: 1,
            filesAnalyzed: 1,
            issues: []
        },
        sectionSummary: [],
        analysis: [],
        files: {}
    });

    const sampleDataFilePath = 'sampleData.json';

    suiteSetup(function() {
        // Write the sample data to a file before tests
        fs.writeFileSync(sampleDataFilePath, sampleDataJson, 'utf-8');
    });

    suiteTeardown(function() {
        // Clean up the sample data file after tests
        fs.unlinkSync(sampleDataFilePath);
    });

    test('should create an instance from a JSON string', function() {
        const boostProjectData = new BoostProjectData();
        boostProjectData.create(sampleDataJson);

        assert.strictEqual(boostProjectData.summary.projectName, 'Sample Project');
        assert.strictEqual(boostProjectData.summary.filesToAnalyze, 1);
    });

    test('should load an instance from a file', function() {
        const boostProjectData = new BoostProjectData();
        boostProjectData.load(sampleDataFilePath);

        assert.strictEqual(boostProjectData.summary.projectName, 'Sample Project');
        assert.strictEqual(boostProjectData.summary.filesToAnalyze, 1);
    });
});

